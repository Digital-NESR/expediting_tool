import { describe, expect, it } from 'vitest';
import {
  MAX_DOC_BYTES,
  checkDoc,
  docList,
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
  const req = (deliveryNote: boolean, timesheet: boolean, invoice = false) => ({
    deliveryNote,
    timesheet,
    invoice,
  });
  it('lists only required documents not uploaded', () => {
    expect(missingDocs(req(true, true), [])).toEqual(['delivery_note', 'timesheet']);
    expect(missingDocs(req(true, true), ['timesheet'])).toEqual(['delivery_note']);
    expect(missingDocs(req(false, true), [])).toEqual(['timesheet']);
    expect(missingDocs(req(false, false), [])).toEqual([]);
  });
  it('treats the Invoice like the other two', () => {
    expect(missingDocs(req(true, true, true), [])).toEqual([
      'delivery_note',
      'timesheet',
      'invoice',
    ]);
    expect(missingDocs(req(false, false, true), [])).toEqual(['invoice']);
    expect(missingDocs(req(false, false, true), ['invoice'])).toEqual([]);
  });
});

describe('docList', () => {
  it('reads as a sentence', () => {
    expect(docList(['invoice'])).toBe('the Invoice');
    expect(docList(['delivery_note', 'invoice'])).toBe('the Delivery Note and the Invoice');
    expect(docList(['delivery_note', 'timesheet', 'invoice'])).toBe(
      'the Delivery Note, the Timesheet and the Invoice',
    );
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
