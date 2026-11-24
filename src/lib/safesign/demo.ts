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
}

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: 'admin',
    name: 'Demo Admin',
    email: 'demo.admin@safesign.invalid',
    role: 'admin',
    blurb: 'Everything, plus who has access',
  },
  {
    id: 'sender',
    name: 'Demo Sender (Sourcing)',
    email: 'demo.sender@safesign.invalid',
    role: 'sender',
    blurb: 'Vendors, sending, reminders, plans, reports',
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
