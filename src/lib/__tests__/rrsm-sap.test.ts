import { describe, expect, it } from 'vitest';
import {
  EMPTY_SAP,
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
