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
 * NESR's official Delivery Status list, transcribed from the source document rather than from
 * the module under test, so this file fails if the catalogue is edited to disagree with it.
 * Eighteen codes, no DS19, and DS07 is "Pending LC" — the app's old list had an extra status at
 * DS07 which pushed everything above it up by one.
 */
const OFFICIAL: ReadonlyArray<readonly [string, string]> = [
  ['DS01', 'PO Copy Not Received'],
  ['DS02', 'PO Rejected'],
  ['DS03', 'PO Pending Revision'],
  ['DS04', 'PO Acknowledged - Delivery On time'],
  ['DS05', 'PO Acknowledged - Delivery Delay'],
  ['DS06', 'Delivery On Hold - Pending Import Permit'],
  ['DS07', 'Delivery On Hold - Pending LC'],
  ['DS08', 'Delivery On Hold - Pending Advance Payment'],
  ['DS09', 'Delivery On Hold - Others'],
  ['DS10', 'Delivery On-Hold - Payment Issues'],
  ['DS11', 'Delivered & Invoiced'],
  ['DS12', 'Service Ongoing'],
  ['DS13', 'Service Completed'],
  ['DS14', 'Shipped - In Transit'],
  ['DS15', 'Ready for Collection'],
  ['DS16', 'Collected by Freight Forwarder'],
  ['DS17', 'Customs Clearance'],
  ['DS18', 'Products Delivered to Base'],
];

describe('the catalogue matches the official list', () => {
  it('offers exactly the eighteen official codes, in order', () => {
    expect(SELECTABLE_DS_CODES.map((c) => [c.code, c.name])).toEqual(
      OFFICIAL.map(([code, name]) => [code, name]),
    );
  });

  it.each(OFFICIAL)('%s is %s', (code, name) => {
    expect(dsName(code)).toBe(name);
  });

  /* The four numbers the old list got wrong, called out one by one. Each of these carried a
     different meaning before 15 Sep 2026, and scripts/remap-ds-codes.mjs moved the stored rows
     to match. If one of these ever flips back, history silently changes meaning again. */
  it.each([
    ['DS07', 'Delivery On Hold - Pending LC', 'was PO Acknowledged - No response'],
    ['DS11', 'Delivered & Invoiced', 'was Delivery On Hold - Others'],
    ['DS14', 'Shipped - In Transit', 'was Service Completed'],
    ['DS18', 'Products Delivered to Base', 'was Customs Clearance'],
  ])('%s is %s (%s)', (code, name) => {
    expect(dsName(code)).toBe(name);
  });

  it('has no DS19: the old list invented one by shifting everything up', () => {
    expect(getDsCode('DS19')).toBeNull();
    expect(DS_DESCRIPTIONS.DS19).toBeUndefined();
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

describe('the retired code', () => {
  /* Old DS07 has no equivalent on the official list. It keeps its own id so the 535 rows that
     carry it still read correctly, and it must never reappear in a supplier dropdown. */
  it('renders with its original label', () => {
    expect(dsName('DS07L')).toBe('PO Acknowledged - No response');
  });

  it('is not selectable', () => {
    expect(SELECTABLE_DS_CODES.some((c) => c.code === 'DS07L')).toBe(false);
    expect(getDsCode('DS07L')?.retired).toBe(true);
  });

  it('is the only retired code', () => {
    expect(DS_CODES.filter((c) => c.retired).map((c) => c.code)).toEqual(['DS07L']);
  });
});

describe('tone', () => {
  /**
   * Reconciliation used to hold three hand-written sets and the dashboard a separate category
   * list, and they disagreed: the dashboard filed DS15 to DS18 under "complete" while
   * reconciliation coloured the same codes amber. These are reconciliation's old sets,
   * translated code-by-code through the remap, and they are now what the shared catalogue
   * produces — so the fix preserved reconciliation's reading rather than the dashboard's.
   */
  it.each([
    ['DS04', 'green'],
    ['DS11', 'green'],
    ['DS12', 'green'],
    ['DS13', 'green'],
    ['DS18', 'green'],
    ['DS05', 'amber'],
    ['DS14', 'amber'],
    ['DS15', 'amber'],
    ['DS16', 'amber'],
    ['DS17', 'amber'],
    ['DS01', 'red'],
    ['DS02', 'red'],
    ['DS03', 'red'],
    ['DS06', 'red'],
    ['DS07', 'red'],
    ['DS08', 'red'],
    ['DS09', 'red'],
    ['DS10', 'red'],
    ['DS07L', 'red'],
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
    expect(dsLabel('DS11')).toBe('DS11 - Delivered & Invoiced');
    expect(DS_DISPLAY_LABELS.DS11).toBe('DS11 - Delivered & Invoiced');
  });

  it('takes a separator, for the supplier dropdown that uses an en dash', () => {
    expect(dsLabel('DS11', '–')).toBe('DS11 – Delivered & Invoiced');
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
    expect(dsName('  DS11  ')).toBe('Delivered & Invoiced');
  });

  it('is case sensitive, because every writer stores upper case', () => {
    expect(dsName('ds11')).toBeNull();
  });
});

describe('pill classes', () => {
  it('gives each category its own colour', () => {
    const classes = DS_CATEGORY_LEGEND.map((c) => dsCategoryPillClass(c.id));
    expect(new Set(classes).size).toBe(DS_CATEGORY_LEGEND.length);
  });

  it('routes a code through its category', () => {
    expect(dsPillClass('DS14')).toBe(dsCategoryPillClass('transit'));
    expect(dsPillClass('DS11')).toBe(dsCategoryPillClass('complete'));
  });

  it.each([null, undefined, 'DS99'])('falls back to slate for %j', (code) => {
    expect(dsPillClass(code)).toContain('slate');
  });
});
