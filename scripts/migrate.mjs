#!/usr/bin/env node
/**
 * Apply pending SQL migrations to every database the app uses.
 *
 *   npm run migrate              apply everything pending
 *   npm run migrate -- --dry     list what would run, touch nothing
 *   npm run migrate -- --db=tite only that database
 *
 * Before this, the schema was ~90 DDL statements living inside request handlers, re-running on
 * every serverless cold start behind hand-rolled `let xEnsured: Promise | null` memos. That made
 * the first request of each instance pay for schema maintenance, and it meant the schema had no
 * written-down form: to know what a table looked like you read the code that patched it.
 *
 * How this stays safe to run against a live database:
 *
 *  - Every statement in the 001 baselines is the DDL that was already running on every cold
 *    start, copied across unchanged. It is all `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, so
 *    applying a baseline to a database that already has the schema is a no-op. That is what
 *    makes it safe to adopt this on databases that are already live.
 *  - A migration runs in its own transaction and is recorded in the same transaction, so a
 *    failure leaves neither a half-applied schema nor a false record of success. The exception is
 *    a `-- migrate:no-transaction` file, which by definition cannot have that guarantee; it is
 *    re-run whole on the next attempt instead, which is safe because the statements are
 *    idempotent.
 *  - A session advisory lock is held per database, so two deploys landing together queue instead
 *    of racing.
 *  - Applied migrations are checksummed. Editing a file that has already run is an error rather
 *    than a silent no-op, because the database would no longer match what the file says.
 *
 * A file whose first line is `-- migrate:no-transaction` runs outside a transaction, for the few
 * statements Postgres refuses to run inside one.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { DATABASES, credentials } from '../database/migrations/databases.mjs';
import { splitStatements } from '../database/migrations/split-statements.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'database', 'migrations');

const args = process.argv.slice(2);
const DRY = args.includes('--dry') || args.includes('--dry-run');
const ONLY = args.find((a) => a.startsWith('--db='))?.slice(5);

/** Stable 64-bit advisory-lock key, so the number does not depend on Node's string hashing. */
function lockKey(name) {
  return BigInt('0x' + createHash('sha1').update(name).digest('hex').slice(0, 15));
}

function migrationsFor(key) {
  const dir = join(MIGRATIONS, key);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => {
      const body = readFileSync(join(dir, file), 'utf8');
      return {
        version: file.replace(/\.sql$/, ''),
        file,
        body,
        checksum: createHash('sha256').update(body).digest('hex').slice(0, 16),
        inTransaction: !/^\s*--\s*migrate:no-transaction/i.test(body),
      };
    });
}

async function migrateDatabase(entry) {
  const pending = migrationsFor(entry.key);
  if (!pending.length) return { key: entry.key, applied: 0, skipped: true };

  const database = entry.database();
  const client = new pg.Client({ ...credentials(entry.envStyle), database });
  await client.connect();

  let applied = 0;
  try {
    await client.query('SELECT pg_advisory_lock($1)', [lockKey(`migrate:${entry.key}`).toString()]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     TEXT PRIMARY KEY,
        checksum    TEXT NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await client.query('SELECT version, checksum FROM schema_migrations');
    const seen = new Map(rows.map((r) => [r.version, r.checksum]));

    for (const m of pending) {
      const recorded = seen.get(m.version);
      if (recorded !== undefined) {
        if (recorded !== m.checksum) {
          throw new Error(
            `${entry.key}/${m.file} has already been applied but its contents have changed ` +
              `(recorded ${recorded}, now ${m.checksum}). Applied migrations are history: add a ` +
              `new file rather than editing this one.`,
          );
        }
        continue;
      }

      if (DRY) {
        console.log(`  would apply  ${m.file}`);
        applied += 1;
        continue;
      }

      if (m.inTransaction) {
        await client.query('BEGIN');
        try {
          await client.query(m.body);
          await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
            m.version,
            m.checksum,
          ]);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        }
      } else {
        // One statement per round trip, so none of them acquires an implicit transaction.
        // There is no rollback here by definition: a failure part-way leaves the earlier
        // statements applied and the migration unrecorded, so the next run retries the whole
        // file. Every statement in these baselines is idempotent, which is what makes that safe.
        for (const statement of splitStatements(m.body)) await client.query(statement);
        await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
          m.version,
          m.checksum,
        ]);
      }
      console.log(`  applied      ${m.file}`);
      applied += 1;
    }
  } finally {
    await client.end();
  }
  return { key: entry.key, database, applied, skipped: false };
}

/*
 * No database configured at all means this is a checkout without env vars — a fresh clone, or a
 * CI job that only builds. Skipping is right there. An unreachable database when one IS
 * configured is a different thing entirely, and that still fails the command.
 */
if (!process.env.DB_HOST && !process.env.POSTGRES_HOST) {
  console.log('No DB_HOST or POSTGRES_HOST set — skipping migrations.');
  process.exit(0);
}

const targets = DATABASES.filter((d) => !ONLY || d.key === ONLY);
if (ONLY && !targets.length) {
  console.error(`No database named '${ONLY}'. Known: ${DATABASES.map((d) => d.key).join(', ')}`);
  process.exit(1);
}

let total = 0;
let failed = false;
for (const entry of targets) {
  const withMigrations = migrationsFor(entry.key).length > 0;
  if (!withMigrations) continue;
  console.log(`${entry.key} (${entry.database()})`);
  try {
    const result = await migrateDatabase(entry);
    total += result.applied;
    if (!result.applied) console.log('  up to date');
  } catch (err) {
    failed = true;
    console.error(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (failed) {
  /*
   * `npm run build` runs this first, so a failure here fails the deploy. That is deliberate —
   * shipping the app against a database that has not been migrated gives every affected page a
   * SchemaNotMigratedError instead — but a build that fails for a reason nobody can diagnose from
   * the log is its own problem, so say what the two likely causes are and what to do about each.
   */
  console.error(
    '\nMigration failed. Databases that succeeded are fully applied; nothing is half-applied.\n' +
      '\nTwo things usually cause this at deploy time:\n' +
      '  1. The build environment cannot reach the database. Run `npm run migrate` from somewhere\n' +
      '     that can, then re-deploy.\n' +
      '  2. A migration is genuinely wrong. Fix it and commit; do not edit one that has already\n' +
      '     been applied — add a new numbered file instead.\n' +
      '\nTo deploy without migrating while you sort it out, drop `node scripts/migrate.mjs &&`\n' +
      "from the build script — but expect SchemaNotMigratedError on any page whose schema isn't\n" +
      'there yet.',
  );
  process.exit(1);
}

console.log(DRY ? `\n${total} migration(s) pending.` : `\n${total} migration(s) applied.`);
