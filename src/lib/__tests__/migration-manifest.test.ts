import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATABASES } from '../../../database/migrations/databases.mjs';

/**
 * The migration runner is plain Node and cannot import the app's TypeScript pools, so
 * `database/migrations/databases.mjs` restates each database's name and credential style. That
 * duplication is the dangerous kind: nothing fails loudly if the two drift, and the failure mode
 * is a migration applied to the wrong database.
 *
 * These tests are the pin. They read the pool modules as text rather than importing them — an
 * import would construct pools as a side effect — and assert the three things that have to stay
 * true: every pool is in the manifest, every manifest entry is a real pool, and every migration
 * folder names a database that exists.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(SRC, '..', '..');
const MIGRATIONS = join(REPO, 'database', 'migrations');

interface PoolModule {
  file: string;
  key: string;
  source: string;
}

/** Every `createPool` call in the app, found by reading the db modules as text. */
function poolModules(): PoolModule[] {
  return readdirSync(SRC)
    .filter((f) => f === 'db.ts' || (f.startsWith('db-') && f.endsWith('.ts')))
    .map((file) => {
      const source = readFileSync(join(SRC, file), 'utf8');
      const key = /key:\s*'([^']+)'/.exec(source)?.[1];
      return key ? { file, key, source } : null;
    })
    .filter((m): m is PoolModule => m !== null);
}

const manifestKeys = DATABASES.map((d: { key: string }) => d.key);

describe('migration database manifest', () => {
  it('lists every pool the app constructs', () => {
    const missing = poolModules()
      .filter((m) => !manifestKeys.includes(m.key))
      .map((m) => `${m.key} (src/lib/${m.file})`);
    expect(
      missing,
      'A pool exists with no entry in database/migrations/databases.mjs, so `npm run migrate` ' +
        'would silently never migrate it. Add it to the manifest.',
    ).toEqual([]);
  });

  it('names only pools that exist', () => {
    const real = poolModules().map((m) => m.key);
    const phantom = manifestKeys.filter((k: string) => !real.includes(k));
    expect(
      phantom,
      'The manifest names a database no pool uses. Either a pool was removed and the manifest ' +
        'was not, or the key is misspelled — a misspelled key migrates the wrong database.',
    ).toEqual([]);
  });

  it('resolves each database name from the same environment variables as its pool', () => {
    const modules = new Map(poolModules().map((m) => [m.key, m]));
    const drifted: string[] = [];

    for (const entry of DATABASES as Array<{ key: string; database: () => string | undefined }>) {
      const poolModule = modules.get(entry.key);
      if (!poolModule) continue;
      const names = [...String(entry.database).matchAll(/process\.env\.(\w+)/g)].map((m) => m[1]);
      for (const name of names) {
        if (!poolModule.source.includes(`process.env.${name}`)) {
          drifted.push(`${entry.key}: manifest reads ${name}, src/lib/${poolModule.file} does not`);
        }
      }
    }

    expect(
      drifted,
      'The manifest and the pool disagree about which environment variable holds the database ' +
        'name. Whichever is wrong, migrations and queries are pointed at different databases.',
    ).toEqual([]);
  });

  it('has a known database for every migration folder', () => {
    if (!existsSync(MIGRATIONS)) return;
    const folders = readdirSync(MIGRATIONS, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const unknown = folders.filter((f) => !manifestKeys.includes(f));
    expect(
      unknown,
      'A folder under database/migrations does not match any database key, so the runner will ' +
        'skip it entirely and the migrations in it will never run.',
    ).toEqual([]);
  });

  it('numbers migrations uniquely within each database', () => {
    if (!existsSync(MIGRATIONS)) return;
    const clashes: string[] = [];
    for (const key of manifestKeys) {
      const dir = join(MIGRATIONS, key);
      if (!existsSync(dir)) continue;
      const seen = new Map<string, string>();
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
        const prefix = /^(\d+)/.exec(file)?.[1];
        if (!prefix) {
          clashes.push(`${key}/${file} does not start with a number, so its order is undefined`);
          continue;
        }
        const first = seen.get(prefix);
        if (first) clashes.push(`${key}: ${first} and ${file} share the number ${prefix}`);
        else seen.set(prefix, file);
      }
    }
    expect(clashes, 'Two migrations with the same number apply in an order nobody chose.').toEqual(
      [],
    );
  });
});
