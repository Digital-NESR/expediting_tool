import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireSchema, resetSchemaChecks, SchemaNotMigratedError } from '@/lib/db/schema-version';

/**
 * `requireSchema` replaced the `ensure*` DDL guards that used to run schema statements on every
 * cold start. It is the only thing standing between "migrations were not run" and a confusing
 * query error deep inside a feature, so the two behaviours that matter are that it caches a
 * success (one round trip per process, not per request) and that it does NOT cache a failure —
 * a connection blip must not leave an instance permanently convinced the schema is missing.
 */
function fakePool(query: (sql: string, params: unknown[]) => Promise<{ rowCount: number }>) {
  return { query: vi.fn(query) } as unknown as Pool & { query: ReturnType<typeof vi.fn> };
}

const found = async () => ({ rowCount: 1 });
const absent = async () => ({ rowCount: 0 });

beforeEach(() => {
  resetSchemaChecks();
});

describe('requireSchema', () => {
  it('passes when the migration is recorded', async () => {
    const pool = fakePool(found);
    await expect(requireSchema(pool, 'tite', '001_baseline')).resolves.toBeUndefined();
    expect(pool.query).toHaveBeenCalledWith('SELECT 1 FROM schema_migrations WHERE version = $1', [
      '001_baseline',
    ]);
  });

  it('asks the database once per process, not once per call', async () => {
    const pool = fakePool(found);
    await Promise.all([
      requireSchema(pool, 'tite', '001_baseline'),
      requireSchema(pool, 'tite', '001_baseline'),
    ]);
    await requireSchema(pool, 'tite', '001_baseline');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('names the database and the fix when the migration has not been applied', async () => {
    const pool = fakePool(absent);
    await expect(requireSchema(pool, 'procureguard', '001_baseline')).rejects.toThrow(
      SchemaNotMigratedError,
    );
    // The message has to carry all three: which database, which migration, and what to run.
    await expect(requireSchema(pool, 'procureguard', '001_baseline')).rejects.toThrow(
      /procureguard[\s\S]*001_baseline[\s\S]*npm run migrate/,
    );
  });

  it('retries after a failure instead of caching it', async () => {
    let attempt = 0;
    const pool = fakePool(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('ECONNRESET');
      return { rowCount: 1 };
    });

    await expect(requireSchema(pool, 'sns', '001_baseline')).rejects.toThrow('ECONNRESET');
    // A transient error must not poison the memo for the life of the instance.
    await expect(requireSchema(pool, 'sns', '001_baseline')).resolves.toBeUndefined();
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('tracks each database separately', async () => {
    const pool = fakePool(found);
    await requireSchema(pool, 'tite', '001_baseline');
    await requireSchema(pool, 'learning-hub', '001_baseline');
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('tracks each version separately, so a later migration is checked on its own', async () => {
    const pool = fakePool(found);
    await requireSchema(pool, 'tite', '001_baseline');
    await requireSchema(pool, 'tite', '002_add_reference_sequence');
    expect(pool.query).toHaveBeenCalledTimes(2);
  });
});
