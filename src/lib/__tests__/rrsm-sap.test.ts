import { describe, expect, it } from 'vitest';
import {
  EMPTY_SAP,
  cleanPrNumber,
  lineSap,
  rankCandidates,
  type PrCandidate,
  type SapPr,
  poReleaseFrom,
  prReleaseFrom,
  receiptFrom,
  summarisePos,
  type SapPo,
  type SapStatus,
} from '../rrsm/sap';

describe('poReleaseFrom', () => {
  it('is released only when every live line is', () => {
    expect(poReleaseFrom([{ state: 'Released', deleted: false }])).toBe('released');
    expect(
      poReleaseFrom([
        { state: 'Released', deleted: false },
        { state: 'Under Release', deleted: false },
      ]),
    ).toBe('under_release');
  });
  it('lets a draft line win over under release', () => {
    expect(
      poReleaseFrom([
        { state: 'Under Release', deleted: false },
        { state: 'Draft', deleted: false },
      ]),
    ).toBe('draft');
  });
  it('ignores deleted lines, and calls an all-deleted PO deleted', () => {
    expect(
      poReleaseFrom([
        { state: 'Under Release', deleted: true },
        { state: 'Released', deleted: false },
      ]),
    ).toBe('released');
    expect(poReleaseFrom([{ state: 'Released', deleted: true }])).toBe('deleted');
  });
});

describe('receiptFrom', () => {
  it('reads a service PO by its GR date, not its "Closed, no GRN" state', () => {
    const base = {
      release: 'released' as const,
      isService: true,
      receiptStates: ['Closed, no GRN'],
    };
    expect(receiptFrom({ ...base, hasReceiptDate: false })).toBe('no_service_entry');
    expect(receiptFrom({ ...base, hasReceiptDate: true })).toBe('service_posted');
  });
  it('reads a material PO by its receipt states', () => {
    const base = { release: 'released' as const, isService: false, hasReceiptDate: true };
    expect(receiptFrom({ ...base, receiptStates: ["Fully GRN'ed"] })).toBe('received');
    expect(receiptFrom({ ...base, receiptStates: ["Fully GRN'ed", "Not GRN'ed"] })).toBe('partial');
    expect(receiptFrom({ ...base, receiptStates: ["Partially GRN'ed"] })).toBe('partial');
    expect(receiptFrom({ ...base, receiptStates: ["Not GRN'ed"] })).toBe('not_received');
  });
  it('says nothing about receipt before the PO is approved', () => {
    expect(
      receiptFrom({
        release: 'under_release',
        isService: true,
        receiptStates: [],
        hasReceiptDate: true,
      }),
    ).toBe('unapproved');
  });
});

describe('prReleaseFrom', () => {
  it('takes the least advanced line', () => {
    expect(prReleaseFrom(['Fully Released'])).toBe('released');
    expect(prReleaseFrom(['Fully Released', 'Under Release'])).toBe('under_release');
    expect(prReleaseFrom(['Not Submitted', 'Under Release'])).toBe('not_submitted');
    expect(prReleaseFrom([])).toBe('not_submitted');
  });
});

describe('summarisePos', () => {
  const po = (p: Partial<SapPo> & Pick<SapPo, 'po'>): SapPo => ({
    release: 'released',
    waitingWith: null,
    daysWaiting: null,
    receipt: 'no_service_entry',
    value: null,
    currency: 'AED',
    createdOn: '',
    releasedOn: '',
    lastReceiptOn: '',
    ...p,
  });
  const sap: SapStatus = {
    ...EMPTY_SAP,
    pos: {
      '1': po({ po: '1' }),
      '2': po({ po: '2', receipt: 'service_posted' }),
      '3': po({ po: '3', release: 'under_release', receipt: 'unapproved' }),
    },
  };
  it('counts each PO once and finds the ones SAP does not have', () => {
    expect(summarisePos(['1', '1', ' 2 ', '3', '9', ''], sap)).toEqual({
      total: 4,
      released: 2,
      underRelease: 1,
      notInSap: 1,
      serviceEntered: 1,
    });
  });
});

describe('lineSap', () => {
  const pr = (p: Partial<SapPr> & Pick<SapPr, 'pr'>): SapPr => ({
    release: 'released',
    converted: false,
    waitingWith: null,
    daysWaiting: null,
    convertedOn: '',
    pos: [],
    ...p,
  });
  const sap: SapStatus = {
    ...EMPTY_SAP,
    prs: {
      '1': pr({ pr: '1', release: 'under_release', waitingWith: 'MSALAH1' }),
      '2': pr({ pr: '2' }),
      '3': pr({ pr: '3', converted: true, convertedOn: '2026-11-17' }),
      '4': pr({ pr: '4', converted: true, convertedOn: '2026-11-12', pos: ['5150009399'] }),
      '5': pr({ pr: '5', converted: true, convertedOn: '2026-11-12', pos: ['51', '52'] }),
      '6': pr({ pr: '6', release: 'not_submitted' }),
    },
  };
  const at = (prNumber: string, poNumber = '') => lineSap({ prNumber, poNumber }, sap);

  it('walks a PR from raised to on a PO', () => {
    expect(at('').stage).toBe('no_pr');
    expect(at('99').stage).toBe('pr_not_found');
    expect(at('6').stage).toBe('pr_not_submitted');
    expect(at('1').stage).toBe('pr_under_release');
    expect(at('2').stage).toBe('pr_released');
    expect(at('3').stage).toBe('converted_po_pending');
    expect(at('4')).toMatchObject({ stage: 'po', pos: ['5150009399'], autoPo: '5150009399' });
  });
  it('does not guess a PO when SAP split the PR into several', () => {
    expect(at('5')).toMatchObject({ stage: 'po', pos: ['51', '52'], autoPo: null });
  });
  it('keeps a recorded PO and never auto-fills over it', () => {
    expect(at('4', '777')).toMatchObject({ stage: 'po', pos: ['777'], autoPo: null });
  });
});

describe('rankCandidates', () => {
  const c = (pr: string, value: number | null, createdOn: string): PrCandidate => ({
    pr,
    pos: [],
    value,
    currency: 'AED',
    createdOn,
    description: '',
  });
  it('puts the nearest amount first, then the newest', () => {
    const ranked = rankCandidates(
      [
        c('a', 900, '2026-11-01'),
        c('b', 1000, '2026-10-30'),
        c('c', null, '2026-11-15'),
        c('d', 1000, '2026-11-05'),
      ],
      1000,
    );
    expect(ranked.map((r) => r.pr)).toEqual(['d', 'b', 'a', 'c']);
  });
});

describe('cleanPrNumber', () => {
  it('accepts digits, drops spaces and leading zeros, refuses the rest', () => {
    expect(cleanPrNumber(' 1016 006595 ')).toBe('1016006595');
    expect(cleanPrNumber('0010160065')).toBe('10160065');
    expect(cleanPrNumber('PR-123')).toBeNull();
    expect(cleanPrNumber('123')).toBeNull();
  });
});
