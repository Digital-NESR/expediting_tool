import { describe, expect, it } from 'vitest';

import {
  DS_CATEGORY_LEGEND,
  DS_CATEGORY_TONE,
  DS_CODES,
  DS_DESCRIPTIONS,
  DS_DISPLAY_LABELS,
  SELECTABLE_DS_CODES,
  dsCategoryPillClass,
  dsLabel,
  dsName,
  dsPillClass,
  dsTone,
  getDsCode,
} from '@/lib/ds-codes';

/**
 * NESR's official Delivery Status list, transcribed from the source document rather than from the
 * module under test, so this file fails if the catalogue is edited to disagree with it.
 *
 * NINETEEN codes. An earlier version of this file asserted eighteen and no DS19, which is how the
 * wrong list survived three weeks of green tests: it had been transcribed from the same mistaken
 * reading as the module, so the two agreed with each other and not with NESR. A fixture is only
 * worth having when it comes from the source, and this one now does.
 */
const OFFICIAL: ReadonlyArray<readonly [string, string]> = [
  ['DS01', 'PO Copy Not Received'],
  ['DS02', 'PO Rejected'],
  ['DS03', 'PO Pending Revision'],
  ['DS04', 'PO Acknowledged - Delivery On time'],
  ['DS05', 'PO Acknowledged - Delivery Delay'],
  ['DS06', 'Delivery On Hold - Pending Import Permit'],
  ['DS07', 'PO Acknowledged - No response'],
  ['DS08', 'Delivery On Hold - Pending LC'],
  ['DS09', 'Delivery On Hold - Pending Advance Payment'],
  ['DS10', 'Delivery On-Hold - Payment Issues'],
  ['DS11', 'Delivery On Hold - Others'],
  ['DS12', 'Delivered & Invoiced'],
  ['DS13', 'Service Ongoing'],
  ['DS14', 'Service Completed'],
  ['DS15', 'Shipped - In Transit'],
  ['DS16', 'Ready for Collection'],
  ['DS17', 'Collected by Freight Forwarder'],
  ['DS18', 'Customs Clearance'],
  ['DS19', 'Products Delivered to Base'],
];

describe('the catalogue matches the official list', () => {
  it('offers exactly the nineteen official codes, in order', () => {
    expect(SELECTABLE_DS_CODES.map((c) => [c.code, c.name])).toEqual(
      OFFICIAL.map(([code, name]) => [code, name]),
    );
  });

  it.each(OFFICIAL)('%s is %s', (code, name) => {
    expect(dsName(code)).toBe(name);
  });

  /* The codes the 15 Sep renumbering moved and this change moved back, called out one by one.
     Each carried a different meaning for three weeks, and scripts/remap-ds-codes-official.mjs
     moved the stored rows to match. If one of these flips again, history changes meaning. */
  it.each([
    ['DS07', 'PO Acknowledged - No response', 'was Pending LC between 15 Sep and 8 Oct'],
    ['DS11', 'Delivery On Hold - Others', 'was Delivered & Invoiced'],
    ['DS12', 'Delivered & Invoiced', 'was Service Ongoing'],
    ['DS15', 'Shipped - In Transit', 'was Ready for Collection'],
    ['DS19', 'Products Delivered to Base', 'did not exist at all'],
  ])('%s is %s (%s)', (code, name) => {
    expect(dsName(code)).toBe(name);
  });

  /* The bug a user could actually see: 85 open PO lines sat at DS19, the catalogue stopped at
     DS18, and the dashboard rendered a pill with no label. */
  it('knows DS19, which the dashboard was showing blank', () => {
    expect(getDsCode('DS19')).not.toBeNull();
    expect(DS_DESCRIPTIONS.DS19).toBe('Products Delivered to Base');
    expect(DS_DISPLAY_LABELS.DS19).toBe('DS19 - Products Delivered to Base');
  });

  /* DS07L only ever existed because the official DS07 was mistakenly thought not to exist. The
     remap sends those rows back to DS07, so nothing should answer to it. */
  it('no longer carries the retired DS07L', () => {
    expect(getDsCode('DS07L')).toBeNull();
    expect(DS_CODES.some((c) => c.retired)).toBe(false);
  });

  it('has no duplicate codes', () => {
    const codes = DS_CODES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('gives every code a name, a description and a category', () => {
    for (const c of DS_CODES) {
      expect(c.name.trim()).not.toBe('');
      expect(c.description.trim()).not.toBe('');
      expect(DS_CATEGORY_LEGEND.some((l) => l.id === c.category)).toBe(true);
    }
  });
});

describe('tone', () => {
  /**
   * Reconciliation used to hold three hand-written sets and the dashboard a separate category
   * list, and they disagreed: the dashboard filed the in-transit codes under "complete" while
   * reconciliation coloured them amber. These are reconciliation's old sets, translated
   * code-by-code onto the official numbering, and they are what the shared catalogue produces —
   * so the fix preserved reconciliation's reading rather than the dashboard's.
   */
  it.each([
    ['DS04', 'green'],
    ['DS12', 'green'],
    ['DS13', 'green'],
    ['DS14', 'green'],
    ['DS19', 'green'],
    ['DS05', 'amber'],
    ['DS15', 'amber'],
    ['DS16', 'amber'],
    ['DS17', 'amber'],
    ['DS18', 'amber'],
    ['DS01', 'red'],
    ['DS02', 'red'],
    ['DS03', 'red'],
    ['DS06', 'red'],
    ['DS07', 'red'],
    ['DS08', 'red'],
    ['DS09', 'red'],
    ['DS10', 'red'],
    ['DS11', 'red'],
  ])('%s reads %s', (code, tone) => {
    expect(dsTone(code)).toBe(tone);
  });

  it('covers every code, leaving none to the unknown fallback', () => {
    for (const c of DS_CODES) {
      expect(DS_CATEGORY_TONE[c.category]).toBeDefined();
    }
  });

  it.each([null, undefined, '', 'DS99', 'nonsense'])(
    'falls back to amber for %j: visible, not alarming',
    (code) => {
      expect(dsTone(code)).toBe('amber');
    },
  );
});

describe('lookup and labels', () => {
  it('builds the display label the dashboard filter shows', () => {
    expect(dsLabel('DS12')).toBe('DS12 - Delivered & Invoiced');
    expect(DS_DISPLAY_LABELS.DS12).toBe('DS12 - Delivered & Invoiced');
  });

  it('takes a separator, for the supplier dropdown that uses an en dash', () => {
    expect(dsLabel('DS12', '–')).toBe('DS12 – Delivered & Invoiced');
  });

  /* An unrecognised code still has to appear. The dashboard renders whatever SAP sent, and a
     row silently collapsing to an empty cell would hide a data problem rather than show it. */
  it.each(['DS99', 'Pending Supplier Response', 'whatever'])('passes %j through', (raw) => {
    expect(dsLabel(raw)).toBe(raw);
    expect(dsName(raw)).toBeNull();
  });

  it.each([null, undefined])('returns an empty label for %j', (raw) => {
    expect(dsLabel(raw)).toBe('');
  });

  it('trims before looking up', () => {
    expect(dsName('  DS12  ')).toBe('Delivered & Invoiced');
  });

  it('is case sensitive, because every writer stores upper case', () => {
    expect(dsName('ds12')).toBeNull();
  });
});

describe('pill classes', () => {
  it('gives each category its own colour', () => {
    const classes = DS_CATEGORY_LEGEND.map((c) => dsCategoryPillClass(c.id));
    expect(new Set(classes).size).toBe(DS_CATEGORY_LEGEND.length);
  });

  it('routes a code through its category', () => {
    expect(dsPillClass('DS15')).toBe(dsCategoryPillClass('transit'));
    expect(dsPillClass('DS12')).toBe(dsCategoryPillClass('complete'));
  });

  it.each([null, undefined, 'DS99'])('falls back to slate for %j', (code) => {
    expect(dsPillClass(code)).toContain('slate');
  });
});
