/**
 * Split a migration file into individual SQL statements.
 *
 * Needed only for `-- migrate:no-transaction` files. Postgres wraps a multi-statement simple
 * query in an IMPLICIT transaction, so sending such a file as one string would put it right back
 * inside the transaction the directive exists to escape — the directive would silently do
 * nothing, which is worse than not having it at all.
 *
 * Splitting SQL on semicolons is only correct if you respect everything that can legally contain
 * one: line and block comments, single-quoted literals, quoted identifiers, and dollar-quoted
 * bodies. That last one is not optional here — the `DO $$ ... $$` blocks in these baselines are
 * full of semicolons, and a naive split would cut them into fragments that each fail on their
 * own.
 *
 * Its own module so it can be tested. Importing the runner would run the migrations.
 */
export function splitStatements(sql) {
  const out = [];
  let start = 0;
  let i = 0;

  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === '--') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl + 1;
    } else if (two === '/*') {
      const close = sql.indexOf('*/', i + 2);
      i = close === -1 ? sql.length : close + 2;
    } else if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i];
      i += 1;
      while (i < sql.length) {
        if (sql[i] === quote) {
          // A doubled quote is an escaped one, not the end of the literal.
          if (sql[i + 1] === quote) i += 2;
          else break;
        } else i += 1;
      }
      i += 1;
    } else if (sql[i] === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (tag) {
        const close = sql.indexOf(tag[0], i + tag[0].length);
        i = close === -1 ? sql.length : close + tag[0].length;
      } else i += 1;
    } else if (sql[i] === ';') {
      const statement = sql.slice(start, i).trim();
      if (statement) out.push(statement);
      start = i + 1;
      i += 1;
    } else i += 1;
  }

  const tail = sql.slice(start).trim();
  if (tail) out.push(tail);

  // A trailing block of comments after the last semicolon is not a statement. Postgres would
  // accept it as an empty query, but "applied 24 statements" when one of them was a paragraph of
  // prose is a misleading thing for this script to say.
  return out.filter((s) =>
    s
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim(),
  );
}
