import { describe, expect, it } from 'vitest';
import { AP_HIDDEN_SCREENS, screenHiddenFrom } from '@/app/soa-consolidation/lib';
import type { ScreenId } from '@/app/soa-consolidation/types';

const ALL_SCREENS: ScreenId[] = [
  'dashboard',
  'scoping',
  'outreach',
  'tracking',
  'consolidation',
  'evidence',
  'rollup',
];

const AP = { apOnly: true, canSeeRollup: false };
const CHAMPION = { apOnly: false, canSeeRollup: false };
const ADMIN = { apOnly: false, canSeeRollup: true };

describe('screenHiddenFrom', () => {
  /*
   * One rule behind two things: the nav strip filters on it and the active-screen fallback reads
   * it. They used to be separate expressions in different halves of the same function, which is
   * how a hidden tab comes back — a screen added to one list and not the other, with no symptom
   * until somebody reaches a page they have no tab for.
   */
  it('hides the champion-only screens from an AP-only reader', () => {
    expect(ALL_SCREENS.filter((s) => screenHiddenFrom(s, AP))).toEqual([
      'scoping',
      'outreach',
      'tracking',
      'rollup',
    ]);
  });

  it('leaves AP the dashboard, the consolidation and the evidence behind it', () => {
    expect(ALL_SCREENS.filter((s) => !screenHiddenFrom(s, AP))).toEqual([
      'dashboard',
      'consolidation',
      'evidence',
    ]);
  });

  it('hides nothing but the rollup from a single-country champion', () => {
    expect(ALL_SCREENS.filter((s) => screenHiddenFrom(s, CHAMPION))).toEqual(['rollup']);
  });

  it('hides nothing from an administrator', () => {
    expect(ALL_SCREENS.filter((s) => screenHiddenFrom(s, ADMIN))).toEqual([]);
  });

  /* The rollup is gated on its own flag, not on apOnly: an AP reader who is also an all-country
     champion keeps it, which is the case `isApOnlyFor` exists to let through. */
  it('gates the rollup on its own grant rather than on the AP flag', () => {
    expect(screenHiddenFrom('rollup', { apOnly: true, canSeeRollup: true })).toBe(false);
    expect(screenHiddenFrom('rollup', { apOnly: false, canSeeRollup: false })).toBe(true);
  });

  it('keeps the hidden list to the three the champion acts on', () => {
    expect([...AP_HIDDEN_SCREENS]).toEqual(['scoping', 'outreach', 'tracking']);
  });
});
