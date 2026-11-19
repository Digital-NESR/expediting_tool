import { describe, expect, it } from 'vitest';
import {
  MAX_DOC_BYTES,
  checkDoc,
  hasProposal,
  missingDocs,
  proposalAgainst,
} from '../rrsm/submission';

describe('checkDoc', () => {
  it('takes the type from the extension, not the browser', () => {
    expect(checkDoc({ name: 'DN Nov.PDF', size: 1000 })).toEqual({
      ok: true,
      contentType: 'application/pdf',
      name: 'DN Nov.PDF',
    });
    expect(checkDoc({ name: 'timesheet.xlsx', size: 10 })).toMatchObject({ ok: true });
  });
  it('refuses unknown types, empty files and files over 4 MB', () => {
    expect(checkDoc({ name: 'run.exe', size: 10 }).ok).toBe(false);
    expect(checkDoc({ name: 'noextension', size: 10 }).ok).toBe(false);
    expect(checkDoc({ name: 'a.pdf', size: 0 }).ok).toBe(false);
    expect(checkDoc({ name: 'a.pdf', size: MAX_DOC_BYTES + 1 }).ok).toBe(false);
  });
  it('strips path separators and line breaks from the stored name', () => {
    const r = checkDoc({ name: '..\\..\\evil\r\n.pdf', size: 5 });
    expect(r.ok && r.name).toBe('.._.._evil__.pdf');
  });
});

describe('missingDocs', () => {
  it('lists only required documents not uploaded', () => {
    expect(missingDocs({ deliveryNote: true, timesheet: true }, [])).toEqual([
      'delivery_note',
      'timesheet',
    ]);
    expect(missingDocs({ deliveryNote: true, timesheet: true }, ['timesheet'])).toEqual([
      'delivery_note',
    ]);
    expect(missingDocs({ deliveryNote: false, timesheet: true }, [])).toEqual(['timesheet']);
    expect(missingDocs({ deliveryNote: false, timesheet: false }, [])).toEqual([]);
  });
});

describe('proposalAgainst', () => {
  const agreed = { rate: 250, uom: 'month' };
  it('is no proposal when the supplier leaves the terms as they are', () => {
    const p = proposalAgainst(agreed, { rate: 250, uom: 'month' });
    expect(p).toEqual({ rate: null, uom: null });
    expect(hasProposal(p)).toBe(false);
    expect(proposalAgainst(agreed, { rate: 250.0004, uom: 'month' })).toEqual({
      rate: null,
      uom: null,
    });
  });
  it('keeps only what differs', () => {
    expect(proposalAgainst(agreed, { rate: 290, uom: 'month' })).toEqual({ rate: 290, uom: null });
    expect(proposalAgainst(agreed, { rate: 250, uom: 'day' })).toEqual({ rate: null, uom: 'day' });
    expect(hasProposal(proposalAgainst(agreed, { rate: 12, uom: 'day' }))).toBe(true);
  });
  it('treats a rate given where none was agreed as a proposal', () => {
    expect(proposalAgainst({ rate: null, uom: 'month' }, { rate: 100, uom: 'month' }).rate).toBe(
      100,
    );
  });
});
