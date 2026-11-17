import { describe, expect, it } from 'vitest';
import { closedPoState, type ClosedPoLine } from '@/app/po-expediting/analytics/_components';

/**
 * The analytics drill-downs render a PO that has left SAP as a row of dashes, which reads as a
 * rendering fault. It usually is not one: `sap_open_po_master` is truncated and reloaded nightly
 * with only the POs still open, so a goods-received PO simply has no live row any more.
 *
 * These pin the two things the badge claims, because both are easy to get subtly wrong and
 * neither is visible to a type-check: a PO is only "closed" when EVERY line has gone, and the
 * detail is only "lost" for work dispatched before the snapshot landed on 14 Sep 2026.
 */

const line = (over: Partial<ClosedPoLine> = {}): ClosedPoLine => ({
  in_sap: true,
  item_description: 'VALVE GATE 6IN CLASS 1500 FLANGED RF',
  open_qty: 2,
  ...over,
});

const closedWithSnapshot = line({ in_sap: false });
const closedAndLost = line({ in_sap: false, item_description: null, open_qty: null });

describe('closedPoState', () => {
  it('says nothing about a PO that is still open', () => {
    expect(closedPoState([line(), line()])).toEqual({ closed: false, detailLost: false });
  });

  it('needs EVERY line to have gone before it calls a PO closed', () => {
    /* One live line means the PO is still live. Badging it "Closed in SAP" because most of it
       has been received would be a worse lie than the dashes this replaces. */
    expect(closedPoState([closedAndLost, line()]).closed).toBe(false);
  });

  it('marks a closed PO whose detail survived', () => {
    /* Dispatched after the snapshot: description, quantity and value are on active_expediting,
       so the reader gets real figures and only needs telling that SAP no longer carries it. */
    expect(closedPoState([closedWithSnapshot])).toEqual({ closed: true, detailLost: false });
  });

  it('marks a closed PO whose detail was never captured', () => {
    expect(closedPoState([closedAndLost, closedAndLost])).toEqual({
      closed: true,
      detailLost: true,
    });
  });

  it('does not call the detail lost when any line still carries some', () => {
    /* A mixed group is the honest middle: the PO has gone, but there is something to read, so
       the stronger "detail not captured" wording must not appear. */
    expect(closedPoState([closedAndLost, closedWithSnapshot])).toEqual({
      closed: true,
      detailLost: false,
    });
  });

  it('treats a zero quantity as captured detail, not as missing', () => {
    /* `open_qty == null` is the test, deliberately not falsiness: a fully-received line can
       legitimately carry 0, and reading that as "nothing was captured" would put the wrong
       wording on a row that has a description right beside it. */
    expect(
      closedPoState([line({ in_sap: false, item_description: null, open_qty: 0 })]).detailLost,
    ).toBe(false);
  });

  it('says nothing for an empty group rather than claiming it is closed', () => {
    /* `[].every(...)` is true, so the naive form badges a PO with no lines at all. */
    expect(closedPoState([])).toEqual({ closed: false, detailLost: false });
  });
});
