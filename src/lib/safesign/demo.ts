/**
 * SafeSign demo people, for trying the roles on a developer's machine before SSO is wired up.
 *
 * LOCAL ONLY. Everything that uses this checks `demoAllowed()`, which is `NODE_ENV !==
 * 'production'`. Every Vercel deployment (production and preview) builds with NODE_ENV set to
 * production, so the demo sign-in does not exist there and no environment variable can switch it
 * on. That is deliberate: SC Agents is a production site, and the ICSA demo login that WAS
 * switchable by a variable ended up live on scagents.nesr.com (removed in 7ff2cbd).
 *
 * The addresses use the reserved `.invalid` domain so they can never be a real person or collide
 * with ADMIN_EMAILS.
 */

export type DemoRole = 'admin' | 'sender';

export interface DemoPersona {
  id: string;
  name: string;
  email: string;
  role: DemoRole;
  blurb: string;
  /** Countries a demo sender works in (an admin has every country). */
  countries?: string[];
  /** Approves communications: as SCM for these countries, and/or as final approver. */
  approver?: { scm: string[]; final: boolean };
}

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: 'admin',
    name: 'Demo Admin',
    email: 'demo.admin@safesign.invalid',
    role: 'admin',
    blurb: 'Every country, plus the admin panel',
  },
  {
    id: 'sender',
    name: 'Demo Sender (Sourcing)',
    email: 'demo.sender@safesign.invalid',
    role: 'sender',
    blurb: 'Saudi Arabia only: suppliers, sending, reminders, plans, reports',
    countries: ['SA'],
  },
  {
    id: 'scm',
    name: 'Demo SCM (Saudi Arabia)',
    email: 'demo.scm@safesign.invalid',
    role: 'sender',
    blurb: 'Approves Saudi Arabia communications as supply chain manager',
    countries: [],
    approver: { scm: ['SA'], final: false },
  },
  {
    id: 'final',
    name: 'Demo Final Approver',
    email: 'demo.final@safesign.invalid',
    role: 'sender',
    blurb: 'Gives the final approval, every country',
    countries: [],
    approver: { scm: [], final: true },
  },
];

export function demoAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/** The demo persona behind an address, or null (always null in production). */
export function demoPersonaFor(email: string | null | undefined): DemoPersona | null {
  if (!demoAllowed() || !email) return null;
  const e = email.trim().toLowerCase();
  return DEMO_PERSONAS.find((p) => p.email === e) ?? null;
}
