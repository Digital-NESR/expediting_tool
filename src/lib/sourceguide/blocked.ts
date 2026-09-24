/**
 * Reading SAP's central purchasing block off `supplier_avl`.
 *
 * `central_block_status` is free text arriving from a Power BI feed, so it is
 * read defensively: anything that is not plainly a "not blocked" marker counts
 * as blocked. Over-flagging a vendor costs a buyer one extra check; letting a
 * blocked one through a sourcing decision unmarked costs rather more.
 *
 * Until Sep 2026 the feed only carried suppliers that were blocked in at least
 * one purchasing organisation, which hid two thirds of the vendor master. It now
 * carries the whole master, which is why the blocked ones need marking rather
 * than filtering — a vendor that is absent looks identical to one that does not
 * exist, and that is the failure this replaced.
 */
export function isCentrallyBlocked(status: unknown): boolean {
  const s = String(status ?? '').trim();
  return s !== '' && !/^(none|no|active|not blocked)$/i.test(s);
}
