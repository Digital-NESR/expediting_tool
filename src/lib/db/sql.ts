import type { Pool, PoolClient, QueryResultRow } from 'pg';

/**
 * The house `sql()` / `exec()` pair, in one place.
 *
 * Six modules each carried a byte-identical copy of `toPostgresQuery` /
 * `normaliseParams` / `serialise` / `sql` / `exec`, plus — in three of them — a
 * transaction-bound twin under a different name (`dbOn`, `sqlTx`/`execTx`,
 * `sqlOn`/`execOn`). `createSqlHelpers` binds to either a `Pool` or a `PoolClient`,
 * so the pool-bound and client-bound variants are now the same code called twice.
 *
 * Contract, unchanged from the copies it replaces:
 *   - `?` placeholders are rewritten to `$1..$n`, left to right;
 *   - `undefined` parameters become `null` (pg rejects `undefined`);
 *   - `sql()` returns rows, `exec()` returns `{ rowCount, insertId }` where
 *     `insertId` is `rows[0].id` coerced to a number, or 0.
 */

export type SqlParam =
  string | number | boolean | null | undefined | Date | Buffer | string[] | number[];

export type SqlParams = readonly SqlParam[];

export type ExecResult = { rowCount: number; insertId: number };

/** Anything that can run a query: a pool, or one transaction's client. */
export type SqlExecutor = Pick<Pool | PoolClient, 'query'>;

/**
 * Rewrite `?` placeholders to Postgres `$n`, skipping any `?` that is not actually
 * a placeholder.
 *
 * The copies this replaces were a bare `statement.replace(/\?/g, ...)`, which counts
 * every `?` in the text — including ones inside a string literal, a quoted identifier
 * or a comment. One such `?` shifts every placeholder after it by one, silently
 * binding each parameter to the wrong column. No query in the repo trips it today,
 * which is exactly why it is worth fixing before one does.
 *
 * Skipped regions:
 *   - `'...'` string literals (with `''` doubling)
 *   - `"..."` quoted identifiers (with `""` doubling)
 *   - `$tag$...$tag$` dollar-quoted bodies (function bodies in the schema DDL)
 *   - `-- ...` line comments and `/* ... *\/` block comments (Postgres nests these)
 *
 * NOT handled, deliberately: the JSONB existence operators `?`, `?|`, `?&`. They are
 * indistinguishable from a placeholder without a real parser, and the repo uses none
 * of them. That, and `E'\''` backslash-escaped string literals, are the remaining
 * reasons to finish the migration to native `$n` — see the note at the bottom.
 */
export function toPostgresQuery(statement: string): string {
  let out = '';
  let index = 0;
  let i = 0;
  const n = statement.length;

  while (i < n) {
    const ch = statement[i];

    // Line comment: -- ... end of line
    if (ch === '-' && statement[i + 1] === '-') {
      const end = statement.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      out += statement.slice(i, stop);
      i = stop;
      continue;
    }

    // Block comment: /* ... */, nestable in Postgres
    if (ch === '/' && statement[i + 1] === '*') {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (statement[j] === '/' && statement[j + 1] === '*') {
          depth++;
          j += 2;
          continue;
        }
        if (statement[j] === '*' && statement[j + 1] === '/') {
          depth--;
          j += 2;
          continue;
        }
        j++;
      }
      out += statement.slice(i, j);
      i = j;
      continue;
    }

    // String literal / quoted identifier, both closed by a doubled quote char
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (statement[j] === ch) {
          if (statement[j + 1] === ch) {
            j += 2;
            continue;
          }
          j++;
          break;
        }
        j++;
      }
      out += statement.slice(i, j);
      i = j;
      continue;
    }

    // Dollar-quoted body: $$ ... $$ or $tag$ ... $tag$ ($1 etc. is not one)
    if (ch === '$') {
      const open = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(statement.slice(i));
      if (open) {
        const tag = open[0];
        const close = statement.indexOf(tag, i + tag.length);
        const stop = close === -1 ? n : close + tag.length;
        out += statement.slice(i, stop);
        i = stop;
        continue;
      }
    }

    if (ch === '?') {
      out += `$${++index}`;
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/** pg rejects `undefined`; the house convention is that it means SQL NULL. */
export function normaliseParams(params: SqlParams): SqlParam[] {
  return params.map((value) => (value === undefined ? null : value));
}

/**
 * Strip `pg` internals (Date, Buffer, BigInt-ish numerics) so rows can cross the
 * server-action boundary as plain JSON.
 *
 * Kept on by default because that is what every copy did, and callers read these
 * rows as strings — turning a `Date` column back into a real `Date` would change
 * what hundreds of call sites see. The redundant *second* pass over already-
 * serialised rows was removed earlier (see `asSerialised` in laptopProcurement);
 * nothing depends on the round trip happening twice. Narrowing the single
 * remaining pass to only the columns that need it is a per-query behaviour change
 * and is left as a follow-up.
 */
export function serialise<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Type-narrow a value that `sql()` already put through `serialise()`. Those rows are
 * plain JSON with no Dates, Buffers or pg internals left in them, so a second
 * `serialise()` was a full JSON round trip of every row for a value that cannot
 * change. Same narrowing, no second pass — only ever apply it to `sql()` output (or
 * values built from it); anything straight off the pool still needs a real
 * `serialise()`.
 */
export function asSerialised<T>(value: unknown): T {
  return value as T;
}

export interface SqlHelpers {
  sql: <T extends QueryResultRow[]>(statement: string, params?: SqlParams) => Promise<T>;
  exec: (statement: string, params?: SqlParams) => Promise<ExecResult>;
}

/**
 * Bind the helpers to a pool or to one transaction's client.
 *
 * Inside `withTransaction`, every statement MUST go through helpers built on the
 * supplied client — helpers built on the pool run on a different connection,
 * outside the transaction, and will not roll back with it.
 */
export function createSqlHelpers(executor: SqlExecutor): SqlHelpers {
  const sql = async <T extends QueryResultRow[]>(
    statement: string,
    params: SqlParams = [],
  ): Promise<T> => {
    const result = await executor.query(toPostgresQuery(statement), normaliseParams(params));
    return serialise<T>(result.rows);
  };

  const exec = async (statement: string, params: SqlParams = []): Promise<ExecResult> => {
    const result = await executor.query(toPostgresQuery(statement), normaliseParams(params));
    const rawId = result.rows[0]?.id;
    const insertId = typeof rawId === 'number' ? rawId : Number(rawId);
    return { rowCount: result.rowCount ?? 0, insertId: Number.isFinite(insertId) ? insertId : 0 };
  };

  return { sql, exec };
}

/*
 * FOLLOW-UP (not done here, on purpose): move the queries to native `$n` bind
 * parameters and delete `toPostgresQuery` entirely. The rewrite above is now
 * literal-aware, but it is still a hand-rolled lexer standing between every query
 * and the database, and it cannot support the JSONB `?` operators. Converting the
 * several hundred call sites is a large diff with real regression risk and wants
 * its own change.
 */
