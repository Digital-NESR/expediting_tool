import { describe, expect, it } from 'vitest';
import { TOOLS } from '@/app/home/tools';
import { isKnownToolId } from '@/lib/home-favourites';

describe('tool ids', () => {
  /*
   * A favourite is stored as (user_email, tool_id), so the id is the key. Two cards sharing one
   * would mean pinning either pins both and unpinning either unpins both, and nothing else in
   * the launcher would complain: React keys would collide silently and the grids would still
   * render.
   */
  it('are unique across every card', () => {
    const ids = TOOLS.map((t) => t.id);
    expect(new Set(ids).size, `duplicate id in TOOLS: ${ids.join(', ')}`).toBe(ids.length);
  });

  it('fit the column that stores them', () => {
    // home_favourites.tool_id is VARCHAR(64).
    for (const tool of TOOLS) expect(tool.id.length, tool.id).toBeLessThanOrEqual(64);
  });
});

describe('isKnownToolId', () => {
  it('accepts every card the launcher renders', () => {
    for (const tool of TOOLS) expect(isKnownToolId(tool.id), tool.id).toBe(true);
  });

  /*
   * The toggle is a public POST endpoint reachable by anybody signed in. Without this check the
   * table takes whatever string it is handed, which is a write-anything endpoint wearing a
   * favourites hat.
   */
  it.each([
    ['', 'empty'],
    ['not-a-tool', 'a plausible but unknown id'],
    ['PO-EXPEDITING', 'the right id in the wrong case'],
    ['po-expediting ', 'a trailing space'],
    ["'; DROP TABLE home_favourites; --", 'an injection attempt'],
    ['x'.repeat(200), 'longer than the column'],
  ])('rejects %j (%s)', (candidate) => {
    expect(isKnownToolId(candidate)).toBe(false);
  });
});
