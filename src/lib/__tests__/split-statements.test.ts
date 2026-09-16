import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { splitStatements } from '../../../database/migrations/split-statements.mjs';

/**
 * The migration runner splits `-- migrate:no-transaction` files into individual statements, so
 * that none of them picks up the implicit transaction Postgres wraps a multi-statement query in.
 *
 * Splitting SQL on semicolons is the kind of thing that looks finished and then quietly mangles
 * one file in production. The cases below are the ones that actually appear in these baselines —
 * `DO $$ ... $$` blocks stuffed with semicolons above all — plus the ones that would appear the
 * moment someone writes a migration that inserts a row.
 */

const MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'database',
  'migrations',
);

describe('splitStatements', () => {
  it('splits plain statements on semicolons', () => {
    expect(splitStatements('CREATE TABLE a (id INT);\nCREATE TABLE b (id INT);')).toEqual([
      'CREATE TABLE a (id INT)',
      'CREATE TABLE b (id INT)',
    ]);
  });

  it('keeps a dollar-quoted body whole, semicolons and all', () => {
    const sql = `DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 't') THEN
    ALTER TYPE t ADD VALUE IF NOT EXISTS 'x';
  END IF;
END
$$;
CREATE INDEX i ON a (b);`;
    const parts = splitStatements(sql);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain('ALTER TYPE t ADD VALUE');
    expect(parts[0].endsWith('$$')).toBe(true);
    expect(parts[1]).toBe('CREATE INDEX i ON a (b)');
  });

  it('handles a tagged dollar quote', () => {
    const parts = splitStatements('DO $body$ SELECT 1; SELECT 2; $body$;\nSELECT 3;');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain('SELECT 1; SELECT 2;');
  });

  it('ignores semicolons inside string literals', () => {
    const parts = splitStatements("INSERT INTO t (c) VALUES ('a;b');\nSELECT 1;");
    expect(parts).toEqual(["INSERT INTO t (c) VALUES ('a;b')", 'SELECT 1']);
  });

  it('ignores a doubled quote inside a literal rather than ending it early', () => {
    const parts = splitStatements("INSERT INTO t (c) VALUES ('it''s; fine');\nSELECT 1;");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain("'it''s; fine'");
  });

  it('ignores semicolons inside quoted identifiers', () => {
    const parts = splitStatements('CREATE TABLE "odd;name" (id INT);\nSELECT 1;');
    expect(parts).toEqual(['CREATE TABLE "odd;name" (id INT)', 'SELECT 1']);
  });

  it('ignores semicolons inside line and block comments', () => {
    expect(splitStatements('-- a; b\nSELECT 1;')).toEqual(['-- a; b\nSELECT 1']);
    expect(splitStatements('/* a; b */ SELECT 1;')).toEqual(['/* a; b */ SELECT 1']);
  });

  it('drops a trailing comment block rather than calling it a statement', () => {
    expect(splitStatements('SELECT 1;\n-- nothing more to do\n')).toEqual(['SELECT 1']);
  });

  it('accepts a final statement with no trailing semicolon', () => {
    expect(splitStatements('SELECT 1;\nSELECT 2')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('leaves every committed baseline with balanced dollar quotes', () => {
    if (!existsSync(MIGRATIONS)) return;
    const broken: string[] = [];
    for (const dir of readdirSync(MIGRATIONS, { withFileTypes: true }).filter((d) =>
      d.isDirectory(),
    )) {
      for (const file of readdirSync(join(MIGRATIONS, dir.name)).filter((f) =>
        f.endsWith('.sql'),
      )) {
        const parts = splitStatements(readFileSync(join(MIGRATIONS, dir.name, file), 'utf8'));
        parts.forEach((statement, i) => {
          const markers = statement.match(/\$[A-Za-z_]*\$/g);
          if (markers && markers.length % 2 !== 0) {
            broken.push(`${dir.name}/${file} statement ${i + 1}`);
          }
        });
      }
    }
    expect(
      broken,
      'A statement was cut through the middle of a dollar-quoted block, so it would be sent to ' +
        'Postgres as a syntactically incomplete fragment.',
    ).toEqual([]);
  });
});
