import { describe, expect, it, vi } from 'vitest';
import { createSqlHelpers, normaliseParams, toPostgresQuery } from '@/lib/db/sql';

/**
 * `toPostgresQuery` replaces six copies of a bare `statement.replace(/\?/g, ...)`.
 * The behaviour every existing query relies on — left-to-right `?` → `$1..$n` — must
 * not move; what is new is that a `?` inside a string literal, a quoted identifier,
 * a dollar-quoted body or a comment no longer consumes a placeholder number and no
 * longer shifts every placeholder after it.
 */
describe('toPostgresQuery', () => {
  describe('the unchanged contract', () => {
    it('numbers placeholders left to right', () => {
      expect(toPostgresQuery('SELECT * FROM t WHERE a = ? AND b = ?')).toBe(
        'SELECT * FROM t WHERE a = $1 AND b = $2',
      );
    });

    it('leaves a statement with no placeholders alone', () => {
      expect(toPostgresQuery('SELECT 1')).toBe('SELECT 1');
    });

    it('handles an empty statement', () => {
      expect(toPostgresQuery('')).toBe('');
    });

    it('numbers the expanded IN (?, ?, ?) lists the callers build', () => {
      const list = [1, 2, 3].map(() => '?').join(', ');
      expect(toPostgresQuery(`SELECT id FROM t WHERE id IN (${list})`)).toBe(
        'SELECT id FROM t WHERE id IN ($1, $2, $3)',
      );
    });

    it('does not disturb existing $n text', () => {
      expect(toPostgresQuery('SELECT pg_advisory_xact_lock(hashtext($1))')).toBe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
      );
    });

    it('preserves a real query verbatim apart from the placeholders', () => {
      const statement = `SELECT DISTINCT delegator_email, delegator_name
           FROM delegations
          WHERE LOWER(delegate_email) = ?
            AND status = 'active'
            AND NOW() BETWEEN starts_at AND ends_at
            AND (app = 'all' OR app = ?)`;
      expect(toPostgresQuery(statement)).toBe(statement.replace('= ?', '= $1').replace('app = ?', 'app = $2'));
    });
  });

  describe('literal awareness', () => {
    it('ignores a ? inside a single-quoted string literal', () => {
      expect(toPostgresQuery("SELECT 'why?' AS q WHERE a = ?")).toBe("SELECT 'why?' AS q WHERE a = $1");
    });

    it('does not let a quoted ? shift the placeholders after it', () => {
      expect(toPostgresQuery("SELECT ? WHERE label = 'a?b' AND x = ?")).toBe(
        "SELECT $1 WHERE label = 'a?b' AND x = $2",
      );
    });

    it('handles the doubled-quote escape inside a literal', () => {
      expect(toPostgresQuery("SELECT 'it''s a ? really' , ?")).toBe("SELECT 'it''s a ? really' , $1");
    });

    it('ignores a ? inside a double-quoted identifier', () => {
      expect(toPostgresQuery('SELECT "odd?column" FROM t WHERE a = ?')).toBe(
        'SELECT "odd?column" FROM t WHERE a = $1',
      );
    });

    it('ignores a ? inside a line comment', () => {
      expect(toPostgresQuery('SELECT a -- is this ok?\nFROM t WHERE a = ?')).toBe(
        'SELECT a -- is this ok?\nFROM t WHERE a = $1',
      );
    });

    it('keeps an apostrophe inside a line comment from swallowing the rest', () => {
      expect(toPostgresQuery("SELECT a -- don't ask\nFROM t WHERE a = ?")).toBe(
        "SELECT a -- don't ask\nFROM t WHERE a = $1",
      );
    });

    it('ignores a ? inside a block comment, including a nested one', () => {
      expect(toPostgresQuery('SELECT /* who? /* really? */ */ a FROM t WHERE a = ?')).toBe(
        'SELECT /* who? /* really? */ */ a FROM t WHERE a = $1',
      );
    });

    it('ignores a ? inside a dollar-quoted body', () => {
      const statement = "CREATE FUNCTION f() RETURNS text AS $$ SELECT 'huh?' $$ LANGUAGE sql";
      expect(toPostgresQuery(statement)).toBe(statement);
    });

    it('ignores a ? inside a tagged dollar-quoted body but still numbers the rest', () => {
      expect(toPostgresQuery('DO $body$ BEGIN /* ? */ END $body$; SELECT ?')).toBe(
        'DO $body$ BEGIN /* ? */ END $body$; SELECT $1',
      );
    });

    it('treats $1 as a placeholder reference, not the start of a dollar quote', () => {
      expect(toPostgresQuery('SELECT $1, ?')).toBe('SELECT $1, $1');
    });
  });
});

describe('normaliseParams', () => {
  it('maps undefined to null and leaves everything else identical', () => {
    expect(normaliseParams(['a', 0, false, null, undefined, [1, 2]])).toEqual([
      'a',
      0,
      false,
      null,
      null,
      [1, 2],
    ]);
  });
});

describe('createSqlHelpers', () => {
  const executor = (rows: Record<string, unknown>[], rowCount: number | null = rows.length) => {
    const query = vi.fn().mockResolvedValue({ rows, rowCount });
    return { executor: { query }, query };
  };

  it('sql() rewrites the statement, normalises params and returns plain rows', async () => {
    const { executor: ex, query } = executor([{ id: 1, at: new Date('2026-01-02T03:04:05Z') }]);
    const { sql } = createSqlHelpers(ex);

    const rows = await sql('SELECT * FROM t WHERE a = ? AND b = ?', ['x', undefined]);

    expect(query).toHaveBeenCalledWith('SELECT * FROM t WHERE a = $1 AND b = $2', ['x', null]);
    // serialise() is still applied: Dates arrive at the caller as ISO strings.
    expect(rows).toEqual([{ id: 1, at: '2026-01-02T03:04:05.000Z' }]);
  });

  it('exec() reports rowCount and the returned id', async () => {
    const { executor: ex } = executor([{ id: 42 }], 1);
    const { exec } = createSqlHelpers(ex);

    expect(await exec('INSERT INTO t (a) VALUES (?) RETURNING id', ['x'])).toEqual({
      rowCount: 1,
      insertId: 42,
    });
  });

  it('exec() falls back to insertId 0 when nothing usable comes back', async () => {
    const { executor: ex } = executor([], null);
    const { exec } = createSqlHelpers(ex);

    expect(await exec('UPDATE t SET a = ?', ['x'])).toEqual({ rowCount: 0, insertId: 0 });
  });

  it('coerces a string id, as the copies it replaces did', async () => {
    const { executor: ex } = executor([{ id: '7' }], 1);
    const { exec } = createSqlHelpers(ex);

    expect(await exec('INSERT INTO t DEFAULT VALUES RETURNING id')).toEqual({
      rowCount: 1,
      insertId: 7,
    });
  });

  it('binds to whatever executor it is given, so a transaction client stays on its client', async () => {
    const { executor: client, query } = executor([]);
    await createSqlHelpers(client).exec('UPDATE t SET a = ? WHERE id = ?', ['x', 1]);

    expect(query).toHaveBeenCalledWith('UPDATE t SET a = $1 WHERE id = $2', ['x', 1]);
  });
});
