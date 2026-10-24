import { describe, expect, it } from 'vitest';
import { CHIP_STATE_LABEL, chipStateOf } from '@/app/home/chain/chipState';
import { TOOLS, maturityOf, type ToolDef, type ToolStatus } from '@/app/home/tools';

/**
 * What a chip on the chain is allowed to claim.
 *
 * The rule exists so the chain and the card grid cannot disagree about who may open what.
 * The grid's answer is the one that counts -- `handleOpen` in ToolLauncher enforces it -- so
 * these tests restate that enforcement and check the chip agrees with it, rather than
 * checking the chip against itself.
 */

const byId = (id: string): ToolDef => {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`no tool "${id}"`);
  return tool;
};

/** ToolLauncher.handleOpen, as a predicate. If these two ever part, the chip is lying. */
function launcherWouldOpen(tool: ToolDef, status: ToolStatus, isAdmin: boolean): boolean {
  switch (tool.access.kind) {
    case 'always':
      return true;
    case 'adminPreview':
      return isAdmin;
    case 'status':
      return isAdmin || status === 'approved';
  }
}

describe('a chip never promises more than the launcher delivers', () => {
  const STATUSES: ToolStatus[] = ['new', 'pending', 'approved', 'denied', 'revoked', 'rejected'];

  it.each(
    TOOLS.flatMap((t) =>
      STATUSES.flatMap((s) => [[t.id, s, true] as const, [t.id, s, false] as const]),
    ),
  )('%s / %s / admin=%s', (id, status, isAdmin) => {
    const tool = byId(id);
    const state = chipStateOf(tool, status, isAdmin);

    if (state === 'open') {
      expect(
        launcherWouldOpen(tool, status, isAdmin),
        `the chain draws "${id}" as openable but ToolLauncher would not open it`,
      ).toBe(true);
    }

    /* The converse is deliberately NOT asserted. An external portal is "openable" as far as
         the launcher is concerned -- it just navigates -- but the reader may have no account
         there, so the chip says "separate portal" rather than pretending. Under-promising is
         allowed; over-promising is the bug. */
  });
});

describe('the states themselves', () => {
  it('hides unshipped tools from everybody but an admin', () => {
    const preview = TOOLS.filter((t) => maturityOf(t) === 'coming-soon');
    expect(preview.length, 'no unshipped tools left to test with').toBeGreaterThan(0);
    for (const tool of preview) {
      expect(chipStateOf(tool, 'new', false), tool.id).toBe('coming-soon');
      expect(chipStateOf(tool, 'new', true), tool.id).toBe('open');
    }
  });

  it('marks a separate portal as locked rather than open', () => {
    /* ShipWaves is the case that prompted all of this: access.kind is 'always', so the
       launcher happily navigates, but it is somebody else's product behind its own sign-in. */
    const shipwaves = byId('shipwaves');
    expect(shipwaves.access.kind).toBe('always');
    expect(chipStateOf(shipwaves, 'new', false)).toBe('locked');
    expect(chipStateOf(shipwaves, 'new', true)).toBe('locked');
  });

  it('opens an in-house tool that needs no request', () => {
    expect(chipStateOf(byId('laptop-procurement'), 'new', false)).toBe('open');
  });

  it('walks a request-driven tool through its whole lifecycle', () => {
    const sourceguide = byId('sourceguide');
    expect(chipStateOf(sourceguide, 'new', false)).toBe('locked');
    expect(chipStateOf(sourceguide, 'pending', false)).toBe('pending');
    expect(chipStateOf(sourceguide, 'approved', false)).toBe('open');
    for (const refused of ['denied', 'revoked', 'rejected'] as const) {
      expect(chipStateOf(sourceguide, refused, false), refused).toBe('denied');
    }
    /* An administrator needs nobody's permission, at any point in that lifecycle. */
    expect(chipStateOf(sourceguide, 'denied', true)).toBe('open');
  });

  it('gives every state a label', () => {
    for (const tool of TOOLS) {
      const state = chipStateOf(tool, 'new', false);
      expect(CHIP_STATE_LABEL[state], `no label for "${state}"`).toBeTruthy();
    }
  });
});

describe('maturity', () => {
  it('reads unshipped from the registry rather than needing to be told', () => {
    /* Catalog Repo carries all three spellings of "not yet": tone, group and access kind. */
    const catalog = byId('catalog-manager');
    expect(catalog.maturity).toBeUndefined();
    expect(maturityOf(catalog)).toBe('coming-soon');
  });

  it('calls a shipped tool live', () => {
    expect(maturityOf(byId('procure-guard'))).toBe('live');
  });

  it('lets a hand-set value win', () => {
    expect(maturityOf({ ...byId('procure-guard'), maturity: 'beta' })).toBe('beta');
  });
});
