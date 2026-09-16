// Startup env-var presence check for the PO Expediting dispatch path.
// Logs only SET / MISSING (never the values) once per server process, in production.
// Imported for side effect from the po-expediting layout so it runs on cold start.
//
// This is a report, not a gate: it runs on cold start and cannot stop anything later.
// The dispatch enforces NEXT_PUBLIC_APP_URL itself, refusing the batch rather than
// mailing suppliers a link they cannot open, so treat a MISSING line here as advance
// warning that dispatches will be refused — not as the only thing standing in the way.

let logged = false;

export function runStartupEnvCheck(): void {
  if (logged) return;
  logged = true;
  if (process.env.NODE_ENV !== 'production') return;

  const check = (name: string) =>
    console.log(`[Startup] ${name}:`, process.env[name] ? 'SET' : 'MISSING ❌');

  console.log('[Startup] Environment check:');
  check('DB_HOST');
  check('DB_NAME');
  check('N8N_EXPEDITE_WEBHOOK_URL');
  check('NEXT_PUBLIC_APP_URL');
  check('NEXTAUTH_URL');
}

runStartupEnvCheck();
