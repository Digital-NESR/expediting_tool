import type { Pool } from 'pg';

/**
 * Assert that a database has had its migrations run.
 *
 * This replaces the `ensure*` functions that used to sit in front of queries. Those ran the
 * schema DDL itself — `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` — on the first
 * request every serverless instance served, behind a hand-rolled `let xEnsured` memo. Schema
 * management now happens once at deploy (`npm run migrate`, see scripts/migrate.mjs); what is
 * left at runtime is this: one cheap row lookup, memoised per process, that turns "the schema is
 * missing" from a confusing query error deep in a feature into one sentence naming the fix.
 *
 * Failures are not cached. A migration genuinely not having run is permanent and will fail the
 * same way next time, but a connection blip is not, and caching it would keep an instance broken
 * for its whole life.
 */
const checked = new Map<string, Promise<void>>();

export class SchemaNotMigratedError extends Error {
  constructor(dbKey: string, version: string) {
    super(
      `The '${dbKey}' database has not been migrated: ${version} is missing from schema_migrations. ` +
        `Run 'npm run migrate' against this environment before serving traffic.`,
    );
    this.name = 'SchemaNotMigratedError';
  }
}

/**
 * @param dbKey the pool's key, which is also its folder under database/migrations
 * @param version the migration this code depends on — the baseline unless a later one added
 *   something a caller specifically needs
 */
export function requireSchema(pool: Pool, dbKey: string, version: string): Promise<void> {
  const cacheKey = `${dbKey}:${version}`;
  const existing = checked.get(cacheKey);
  if (existing) return existing;

  const check = (async () => {
    const { rowCount } = await pool.query('SELECT 1 FROM schema_migrations WHERE version = $1', [
      version,
    ]);
    if (!rowCount) throw new SchemaNotMigratedError(dbKey, version);
  })().catch((err: unknown) => {
    checked.delete(cacheKey);
    throw err;
  });

  checked.set(cacheKey, check);
  return check;
}

/** Test seam. The memo is process-wide, so a test that exercises a failure must clear it. */
export function resetSchemaChecks(): void {
  checked.clear();
}
