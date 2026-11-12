import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { QueryResultRow } from 'pg';
import { logger } from '@/lib/logger';
import { lockForTransaction, withTransaction } from '@/lib/db/tx';
import { icsaPool } from './db';
import type { IcsaSectionKey } from './model';

/**
 * ICSA demo sign-in.
 *
 * SC Agents signs people in with Microsoft SSO. For walking stakeholders through ICSA before it
 * goes live, this adds six demo people (two admins, two champions, two employees) who sign in
 * with a username and one shared password, ICSA_DEMO_PASSWORD.
 *
 * The demo session is ICSA's own signed cookie, not a NextAuth session, so it opens /icsa and
 * nothing else in the platform. It is off unless ICSA_DEMO_PASSWORD is set. Demo addresses use
 * the reserved .invalid domain, so they can never be a real colleague, and no mail is sent to
 * them. While a demo person is signed in, the people search shows the demo people instead of
 * the Azure AD directory.
 */

const log = logger('icsa-demo');

export type DemoRole = 'admin' | 'champion' | 'employee';

export interface DemoUser {
  username: string;
  name: string;
  email: string;
  role: DemoRole;
  /** Champions: the location they run. Employees: the location they work in. */
  country: string | null;
  jobTitle: string;
  department: string;
}

/** The two example locations, both from the ICSA list. */
export const DEMO_COUNTRIES = ['Saudi Arabia', 'Oman'] as const;

export const DEMO_USERS: DemoUser[] = [
  {
    username: 'admin1',
    name: 'Demo Admin One',
    email: 'admin1@icsa-demo.invalid',
    role: 'admin',
    country: null,
    jobTitle: 'Supply Chain Governance Lead',
    department: 'Supply Chain Governance',
  },
  {
    username: 'admin2',
    name: 'Demo Admin Two',
    email: 'admin2@icsa-demo.invalid',
    role: 'admin',
    country: null,
    jobTitle: 'Internal Controls Analyst',
    department: 'Supply Chain Governance',
  },
  {
    username: 'champion.ksa',
    name: 'Demo Champion (Saudi Arabia)',
    email: 'champion.ksa@icsa-demo.invalid',
    role: 'champion',
    country: 'Saudi Arabia',
    jobTitle: 'Supply Chain Manager',
    department: 'Supply Chain',
  },
  {
    username: 'champion.oman',
    name: 'Demo Champion (Oman)',
    email: 'champion.oman@icsa-demo.invalid',
    role: 'champion',
    country: 'Oman',
    jobTitle: 'Supply Chain Manager',
    department: 'Supply Chain',
  },
  {
    username: 'employee.ksa',
    name: 'Demo Employee (Saudi Arabia)',
    email: 'employee.ksa@icsa-demo.invalid',
    role: 'employee',
    country: 'Saudi Arabia',
    jobTitle: 'Storekeeper',
    department: 'Warehouse',
  },
  {
    username: 'employee.oman',
    name: 'Demo Employee (Oman)',
    email: 'employee.oman@icsa-demo.invalid',
    role: 'employee',
    country: 'Oman',
    jobTitle: 'Buyer',
    department: 'Procurement',
  },
];

/** The sections each demo employee is sent, matching their job. */
const DEMO_EMPLOYEE_SECTIONS: Record<string, IcsaSectionKey[]> = {
  'employee.ksa': ['grn', 'movement'],
  'employee.oman': ['sourcing', 'po'],
};

export const DEMO_CYCLE_LABEL = 'Demo cycle (Q4 2026)';

export const DEMO_COOKIE = 'icsa_demo';
const SESSION_HOURS = 12;

export function demoEnabled(): boolean {
  return Boolean(process.env.ICSA_DEMO_PASSWORD && process.env.NEXTAUTH_SECRET);
}

export function isDemoEmail(email: string): boolean {
  return email.toLowerCase().endsWith('@icsa-demo.invalid');
}

export function demoUserByUsername(username: string): DemoUser | null {
  const u = username.trim().toLowerCase();
  return DEMO_USERS.find((d) => d.username === u) ?? null;
}

function digest(s: string): Buffer {
  return createHash('sha256').update(s).digest();
}

/** Constant-time comparison against ICSA_DEMO_PASSWORD. */
export function demoPasswordMatches(password: string): boolean {
  const expected = process.env.ICSA_DEMO_PASSWORD;
  if (!expected || !password) return false;
  return timingSafeEqual(digest(password), digest(expected));
}

function sign(payload: string): string {
  return createHmac('sha256', `icsa-demo:${process.env.NEXTAUTH_SECRET ?? ''}`)
    .update(payload)
    .digest('base64url');
}

/** `username.expiresAtMs.signature` */
export function demoCookieValue(username: string, now = Date.now()): string {
  const payload = `${username}.${now + SESSION_HOURS * 3600_000}`;
  return `${payload}.${sign(payload)}`;
}

export function demoCookieMaxAge(): number {
  return SESSION_HOURS * 3600;
}

export function parseDemoCookie(value: string | undefined, now = Date.now()): DemoUser | null {
  if (!value || !demoEnabled()) return null;
  const at = value.lastIndexOf('.');
  if (at < 0) return null;
  const payload = value.slice(0, at);
  const given = Buffer.from(value.slice(at + 1));
  const want = Buffer.from(sign(payload));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  const dot = payload.lastIndexOf('.');
  const expires = Number(payload.slice(dot + 1));
  if (!Number.isFinite(expires) || expires < now) return null;
  return demoUserByUsername(payload.slice(0, dot));
}

/** The demo person signed in on this request, if any. */
export async function currentDemoUser(): Promise<DemoUser | null> {
  if (!demoEnabled()) return null;
  return parseDemoCookie((await cookies()).get(DEMO_COOKIE)?.value);
}

/** Where a signed-out visitor to ICSA is sent. */
export function icsaSignInPath(): string {
  return demoEnabled() ? '/icsa-login' : '/login';
}

/**
 * Makes sure the demo world exists: the two champions, and one open demo cycle with both
 * locations enrolled and a form already sent to each demo employee. Idempotent, and it never
 * rebuilds a demo cycle that exists, so whatever people did during a demo is kept.
 */
export async function ensureDemoData(): Promise<void> {
  try {
    await withTransaction(icsaPool, async (client) => {
      await lockForTransaction(client, 'icsa:demo-seed');
      const q = (text: string, values: unknown[] = []) => client.query(text, values);

      for (const c of DEMO_USERS.filter((d) => d.role === 'champion')) {
        await q(
          `INSERT INTO icsa_champions (email, name, country, created_by)
           SELECT $1, $2, $3, 'demo-seed'
            WHERE NOT EXISTS (SELECT 1 FROM icsa_champions WHERE LOWER(email) = $1 AND country = $3)`,
          [c.email, c.name, c.country],
        );
      }

      const existing = await q(`SELECT id FROM icsa_cycles WHERE LOWER(label) = LOWER($1)`, [
        DEMO_CYCLE_LABEL,
      ]);
      if (existing.rows.length) return;

      const cycle = await q(
        `INSERT INTO icsa_cycles
           (label, frequency, period_start, period_end, deadline, threshold_pct, created_by)
         VALUES ($1, 'quarterly', DATE '2026-10-01', DATE '2026-12-31',
                 GREATEST((NOW() AT TIME ZONE 'Asia/Dubai')::date + 30, DATE '2026-12-31'),
                 70, 'demo-seed')
         RETURNING id, deadline::text AS deadline`,
        [DEMO_CYCLE_LABEL],
      );
      const { id: cycleId, deadline } = cycle.rows[0] as QueryResultRow;

      for (const country of DEMO_COUNTRIES) {
        const champ = DEMO_USERS.find((d) => d.role === 'champion' && d.country === country)!;
        const enr = await q(
          `INSERT INTO icsa_enrollments (cycle_id, country, champion_email, champion_name, deadline)
           VALUES ($1, $2, $3, $4, $5::date) RETURNING id`,
          [cycleId, country, champ.email, champ.name, deadline],
        );
        const enrollmentId = (enr.rows[0] as QueryResultRow).id;
        for (const emp of DEMO_USERS.filter(
          (d) => d.role === 'employee' && d.country === country,
        )) {
          await q(
            `INSERT INTO icsa_assessments
               (enrollment_id, respondent_email, respondent_name, job_title, department,
                sections, status, nominated_by, requested_at)
             VALUES ($1, $2, $3, $4, $5, $6::text[], 'requested', $7, NOW())`,
            [
              enrollmentId,
              emp.email,
              emp.name,
              emp.jobTitle,
              emp.department,
              DEMO_EMPLOYEE_SECTIONS[emp.username],
              champ.email,
            ],
          );
        }
        await q(
          `INSERT INTO icsa_events (cycle_id, enrollment_id, actor, action, detail)
           VALUES ($1, $2, 'demo-seed', 'demo_seeded', '{}'::jsonb)`,
          [cycleId, enrollmentId],
        );
      }
    });
  } catch (err) {
    log.error('ensureDemoData.failed', err);
    throw err;
  }
}
