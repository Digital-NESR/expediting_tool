import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The /help pages are public, and public/ is not.
 *
 * src/proxy.ts gates every path that is not in PUBLIC_PATHS, and that includes files served out
 * of public/. The matcher carries a short list of filenames to let through, and a logo left off
 * it does not 404 — it 307s to /login, and next/image then fails with "isn't a valid image"
 * because what it fetched was an HTML page.
 *
 * procureguard-logo.jpg was left off, so the ProcureGuard help page showed a broken logo to every
 * signed-out reader. Nobody saw it, because anybody who would notice was signed in, and a signed-in
 * request sails through the gate. Hence a test rather than a comment: this is a class of bug that
 * is invisible from the inside.
 */

const HELP_DIR = join(process.cwd(), 'src', 'app', 'help');
const PROXY = join(process.cwd(), 'src', 'proxy.ts');

/** Every `src="/something.ext"` literal under src/app/help, with the file it names. */
function helpPageAssets(): { file: string; asset: string }[] {
  const found: { file: string; asset: string }[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith('.tsx') && !entry.endsWith('.ts')) continue;
      const source = readFileSync(full, 'utf8');
      for (const match of source.matchAll(/src=["'](\/[^"'/][^"']*\.[a-z0-9]+)["']/gi)) {
        found.push({ file: entry, asset: match[1] });
      }
    }
  };
  walk(HELP_DIR);
  return found;
}

/** The filenames the proxy matcher excludes from the gate. */
function allowlistedAssets(): string[] {
  const proxy = readFileSync(PROXY, 'utf8');
  const matcher = /'\/\(\(\?!([^)]*)\)\.\*\)'/.exec(proxy);
  expect(matcher, 'could not find the proxy matcher').toBeTruthy();
  return matcher![1].split('|');
}

describe('public help pages', () => {
  const assets = helpPageAssets();

  it('reference at least one image, or this test is checking nothing', () => {
    expect(assets.length).toBeGreaterThan(0);
  });

  it.each(assets)('$file can load $asset without being signed in', ({ asset }) => {
    const name = asset.replace(/^\//, '');
    // A path under a gated prefix is fine only if the prefix itself is public; these are all
    // bare filenames at the root of public/, which is the case the allowlist covers.
    expect(
      allowlistedAssets(),
      `"${name}" is referenced from a public help page but is not excluded in the src/proxy.ts matcher, so a signed-out visitor gets a redirect to /login instead of the image`,
    ).toContain(name);
  });
});
