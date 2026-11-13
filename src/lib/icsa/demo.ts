import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { QueryResultRow } from 'pg';
import { logger } from '@/lib/logger';
import { currentActor, isToolAdminEmail } from '@/lib/require-access';
import { lockForTransaction, withTransaction } from '@/lib/db/tx';
import { icsaPool } from './db';
import type { IcsaSectionKey } from './model';

/**
 * ICSA demo sign-in.
 *
 * SC Agents signs people in with Microsoft SSO. For walking stakeholders through ICSA before it
 * goes live, the sign-in page also offers demo people (two admins, plus a champion and
 * employees for each of the DEMO_COUNTRIES): pick one and you see ICSA as that person, no password.
 *
 * The demo session is ICSA's own signed cookie, not a NextAuth session, so it opens /icsa and
 * nothing else in the platform. It is off unless ICSA_DEMO_LOGIN=true. Anyone who can reach the
 * sign-in page can then act as a demo admin inside ICSA, so switch it off before real cycles
 * start. Demo addresses use
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

/** The example locations, all from the ICSA list. */
export const DEMO_COUNTRIES = [
  'Saudi Arabia',
  'Oman',
  'HQ Dubai',
  'Kuwait',
  'Egypt',
  'Algeria',
] as const;

const DEMO_DOMAIN = 'icsa-demo.invalid';

function person(
  username: string,
  name: string,
  role: DemoRole,
  country: string | null,
  jobTitle: string,
  department: string,
): DemoUser {
  return {
    username,
    name,
    email: `${username}@${DEMO_DOMAIN}`,
    role,
    country,
    jobTitle,
    department,
  };
}

export const DEMO_USERS: DemoUser[] = [
  person('admin1', 'Layla Haddad', 'admin', null, 'ICSA Administrator', 'Supply Chain Governance'),
  person(
    'admin2',
    'Omar Khalil',
    'admin',
    null,
    'Internal Controls Analyst',
    'Supply Chain Governance',
  ),

  person(
    'champion.ksa',
    'Faisal Al-Otaibi',
    'champion',
    'Saudi Arabia',
    'Supply Chain Manager',
    'Supply Chain',
  ),
  person(
    'champion.oman',
    'Salim Al-Busaidi',
    'champion',
    'Oman',
    'Supply Chain Manager',
    'Supply Chain',
  ),
  person(
    'champion.dubai',
    'Rania Mansour',
    'champion',
    'HQ Dubai',
    'Head of Procurement',
    'Supply Chain',
  ),
  person(
    'champion.kuwait',
    'Yousef Al-Mutairi',
    'champion',
    'Kuwait',
    'Supply Chain Manager',
    'Supply Chain',
  ),
  person(
    'champion.egypt',
    'Karim Abdelaziz',
    'champion',
    'Egypt',
    'Supply Chain Manager',
    'Supply Chain',
  ),
  person(
    'champion.algeria',
    'Nadia Benali',
    'champion',
    'Algeria',
    'Supply Chain Manager',
    'Supply Chain',
  ),

  person('employee.ksa', 'Ahmed Al-Ghamdi', 'employee', 'Saudi Arabia', 'Storekeeper', 'Warehouse'),
  person(
    'employee.ksa2',
    'Noura Al-Qahtani',
    'employee',
    'Saudi Arabia',
    'Inventory Controller',
    'Warehouse',
  ),
  person('employee.oman', 'Fatima Al-Balushi', 'employee', 'Oman', 'Buyer', 'Procurement'),
  person(
    'employee.oman2',
    'Hamed Al-Harthy',
    'employee',
    'Oman',
    'Planner',
    'Supply Chain Planning',
  ),
  person(
    'employee.dubai1',
    'Priya Nair',
    'employee',
    'HQ Dubai',
    'Category Manager',
    'Procurement',
  ),
  person(
    'employee.dubai2',
    'Tariq Saeed',
    'employee',
    'HQ Dubai',
    'Procurement Policy Lead',
    'Supply Chain Governance',
  ),
  person('employee.kuwait1', 'Abdullah Al-Enezi', 'employee', 'Kuwait', 'Buyer', 'Procurement'),
  person('employee.kuwait2', 'Mariam Al-Rashidi', 'employee', 'Kuwait', 'Storekeeper', 'Warehouse'),
  person('employee.egypt1', 'Mona Farouk', 'employee', 'Egypt', 'Senior Buyer', 'Procurement'),
  person(
    'employee.egypt2',
    'Hossam Ibrahim',
    'employee',
    'Egypt',
    'Inventory Accountant',
    'Finance',
  ),
  person(
    'employee.algeria1',
    'Yacine Boudiaf',
    'employee',
    'Algeria',
    'Warehouse Supervisor',
    'Warehouse',
  ),
  person(
    'employee.algeria2',
    'Amina Cherif',
    'employee',
    'Algeria',
    'Planner',
    'Supply Chain Planning',
  ),
];

/** The sections each demo employee is sent, matching their job. */
const DEMO_EMPLOYEE_SECTIONS: Record<string, IcsaSectionKey[]> = {
  'employee.ksa': ['grn', 'movement'],
  'employee.ksa2': ['valuation', 'movement'],
  'employee.oman': ['sourcing', 'po'],
  'employee.oman2': ['planning'],
  'employee.dubai1': ['sourcing', 'po'],
  'employee.dubai2': ['policy'],
  'employee.kuwait1': ['sourcing', 'po'],
  'employee.kuwait2': ['grn', 'movement'],
  'employee.egypt1': ['sourcing', 'po'],
  'employee.egypt2': ['valuation'],
  'employee.algeria1': ['grn', 'movement', 'valuation'],
  'employee.algeria2': ['planning', 'policy'],
};

export const DEMO_CYCLE_LABEL = 'Demo cycle (Q4 2026)';

export const DEMO_COOKIE = 'icsa_demo';
const SESSION_HOURS = 12;

export function demoEnabled(): boolean {
  return process.env.ICSA_DEMO_LOGIN === 'true' && Boolean(process.env.NEXTAUTH_SECRET);
}

const ROLE_LABEL: Record<DemoRole, string> = {
  admin: 'Admin',
  champion: 'Champion',
  employee: 'Employee',
};

/** "Faisal Al-Otaibi — Champion, Saudi Arabia", for the sign-in dropdown. */
export function demoLabel(d: DemoUser): string {
  return `${d.name} — ${ROLE_LABEL[d.role]}${d.country ? `, ${d.country}` : ' (all locations)'}`;
}

/** What the sign-in page needs: the dropdown options, or null when the demo is off. */
export function demoOptions(): { username: string; label: string }[] | null {
  return demoEnabled()
    ? DEMO_USERS.map((d) => ({ username: d.username, label: demoLabel(d) }))
    : null;
}

export function isDemoEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${DEMO_DOMAIN}`);
}

export function demoUserByUsername(username: string): DemoUser | null {
  const u = username.trim().toLowerCase();
  return DEMO_USERS.find((d) => d.username === u) ?? null;
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
  if (!value || !process.env.NEXTAUTH_SECRET) return null;
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
  const demo = parseDemoCookie((await cookies()).get(DEMO_COOKIE)?.value);
  if (!demo) return null;
  /* With the public demo login off, a demo cookie counts only for the ICSA admin who picked
     it from "View as", and only while their own SSO session lasts. */
  return demoEnabled() || (await isRealIcsaAdmin()) ? demo : null;
}

/** The person signed in with Microsoft SSO, if any, ignoring any demo cookie. */
export async function ssoUser(): Promise<{ email: string; name: string } | null> {
  return currentActor();
}

/** True when the SSO session (not a demo cookie) belongs to an ICSA admin. */
export async function isRealIcsaAdmin(): Promise<boolean> {
  const real = await currentActor();
  return Boolean(real && isToolAdminEmail(real.email, process.env.ICSA_ADMIN_EMAILS));
}

/**
 * Who may become a demo person: everybody on the sign-in page while ICSA_DEMO_LOGIN=true, and
 * otherwise only a real ICSA admin, from "View as" inside ICSA.
 */
export async function canUseDemo(): Promise<boolean> {
  return demoEnabled() || (await isRealIcsaAdmin());
}

/** The "View as" options, for anybody allowed to switch. */
export function allDemoOptions(): { username: string; label: string }[] {
  return DEMO_USERS.map((d) => ({ username: d.username, label: demoLabel(d) }));
}

/** Where a signed-out visitor to ICSA is sent: the sign-in page, which shows the demo too. */
export function icsaSignInPath(): string {
  return '/login';
}

/**
 * Makes sure the demo world exists: the champions, and one open demo cycle with every demo
 * location enrolled and a form already sent to each demo employee. Idempotent, and it never
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

      /* Keep the names on rows seeded earlier in step with DEMO_USERS, so renaming a demo
         person does not leave the old name on their forms. */
      for (const d of DEMO_USERS) {
        await q(
          `UPDATE icsa_champions SET name = $2 WHERE LOWER(email) = $1 AND name IS DISTINCT FROM $2`,
          [d.email, d.name],
        );
        await q(
          `UPDATE icsa_enrollments SET champion_name = $2 WHERE LOWER(champion_email) = $1 AND champion_name IS DISTINCT FROM $2`,
          [d.email, d.name],
        );
        await q(
          `UPDATE icsa_assessments SET respondent_name = $2 WHERE LOWER(respondent_email) = $1 AND respondent_name IS DISTINCT FROM $2`,
          [d.email, d.name],
        );
      }

      /* The demo cycle is created once. Locations and people added to DEMO_USERS later are
         added to it without touching what is already there, so demo answers are kept. */
      const existing = await q(
        `SELECT id, deadline::text AS deadline FROM icsa_cycles WHERE LOWER(label) = LOWER($1)`,
        [DEMO_CYCLE_LABEL],
      );
      const cycle = existing.rows.length
        ? existing
        : await q(
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
        const found = await q(
          `SELECT id FROM icsa_enrollments WHERE cycle_id = $1 AND country = $2`,
          [cycleId, country],
        );
        let enrollmentId = (found.rows[0] as QueryResultRow | undefined)?.id;
        if (!enrollmentId) {
          const enr = await q(
            `INSERT INTO icsa_enrollments (cycle_id, country, champion_email, champion_name, deadline)
             VALUES ($1, $2, $3, $4, $5::date) RETURNING id`,
            [cycleId, country, champ.email, champ.name, deadline],
          );
          enrollmentId = (enr.rows[0] as QueryResultRow).id;
          await q(
            `INSERT INTO icsa_events (cycle_id, enrollment_id, actor, action, detail)
             VALUES ($1, $2, 'demo-seed', 'demo_seeded', '{}'::jsonb)`,
            [cycleId, enrollmentId],
          );
        }
        for (const emp of DEMO_USERS.filter(
          (d) => d.role === 'employee' && d.country === country,
        )) {
          await q(
            `INSERT INTO icsa_assessments
               (enrollment_id, respondent_email, respondent_name, job_title, department,
                sections, status, nominated_by, requested_at)
             SELECT $1, $2::text, $3, $4, $5, $6::text[], 'requested', $7, NOW()
              WHERE NOT EXISTS (
                SELECT 1 FROM icsa_assessments
                 WHERE enrollment_id = $1 AND LOWER(respondent_email) = $2::text)`,
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
      }
    });
  } catch (err) {
    log.error('ensureDemoData.failed', err);
    throw err;
  }
}
