import type { Pool, PoolClient } from 'pg';

/**
 * Run `fn` inside a single database transaction.
 *
 * Several tools here perform multi-statement writes on the pool directly, which
 * means a failure part-way through leaves the earlier statements committed. That
 * has already produced real corruption: an orphaned rate version whose number
 * collides with the next edit, making a catalog entry permanently un-editable.
 *
 * Every statement inside `fn` MUST go through the supplied client. A call that
 * reaches for the pool instead runs on a different connection, outside the
 * transaction, and will not roll back.
 *
 *   await withTransaction(pool, async (client) => {
 *     await client.query('UPDATE ...', [id]);
 *     await client.query('INSERT ...', [id]);
 *   });
 *
 * The client is always released, and a rollback failure never masks the original
 * error — the error that caused the rollback is what propagates.
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // Surfacing this would hide the real failure. Log it and rethrow the original.
      console.error('[withTransaction] ROLLBACK failed', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Serialise work across processes for the life of the surrounding transaction.
 *
 * Postgres advisory locks are keyed on a bigint, so the caller's string key is
 * hashed with `hashtext`. The lock releases automatically at COMMIT or ROLLBACK,
 * so it cannot be leaked by an early return or a thrown error. Use it to make a
 * read-then-write sequence atomic across concurrent serverless invocations —
 * allocating the next reference number, or replacing a track's seeded content.
 *
 * Must be called on a client already inside a transaction; on the pool it would
 * take a lock that is released immediately.
 */
export async function lockForTransaction(client: PoolClient, key: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
}
