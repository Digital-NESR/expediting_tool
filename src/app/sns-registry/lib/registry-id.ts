/**
 * How a Registry ID is spelled.
 *
 * Kept as pure functions, separate from the action that mints them, because the
 * database part (the advisory lock and the "what was the last one" read) is not
 * the part that gets this wrong — the format is. It is typed into SAP by hand
 * and read back by people without the registry open, so every token has to be
 * unambiguous.
 *
 *   {SGL|SOL}-{COUNTRY}-{SAP ID}-{IYIMEYEM}{NN}
 *   SGL-IRQ-0001103296-2609270901
 *
 * The trailing block runs together on purpose: issue 26-09, expiry 27-09,
 * sequence 01 reads as 2609 2709 01. Three hyphens, so the classification,
 * country and supplier stay easy to pick out, and the dates read as one figure
 * rather than four.
 *
 * SGL is single-source, SOL is sole-source. Years are two digits, months are
 * zero-padded, and the pair of year/month tokens is the validity window the ID
 * was issued under.
 */

/** Two-digit year, as the ID spells it: 2026 → "26". */
function yy(d: Date): string {
  return String(d.getFullYear() % 100).padStart(2, '0');
}

/** Zero-padded month, 1-based: January → "01". */
function mm(d: Date): string {
  return String(d.getMonth() + 1).padStart(2, '0');
}

/**
 * Everything up to the sequence, so it can be appended and the same string can
 * be used as a LIKE prefix.
 *
 * The SAP ID keeps its leading zeros — that is how SAP prints supplier codes —
 * but anything non-alphanumeric is stripped, since a stray space or dash would
 * make the hyphen-separated ID impossible to split back apart.
 */
export function registryIdPrefix(
  cls: 'SGL' | 'SOL',
  countryCode: string,
  supplierId: string,
  issue: Date,
  expiry: Date,
): string {
  const supplierToken = supplierId.replace(/[^A-Za-z0-9]/g, '') || 'NOSAP';
  const window = `${yy(issue)}${mm(issue)}${yy(expiry)}${mm(expiry)}`;
  return `${cls}-${countryCode}-${supplierToken}-${window}`;
}

/**
 * The next sequence for a prefix, given the highest ID already issued under it
 * (or null when it is the first).
 *
 * The sequence exists because everything before it can legitimately repeat: the
 * same supplier may hold more than one record in a country for different
 * taxonomy scopes, and two raised in the same month with the same validity
 * would otherwise be byte-identical. `registry_id` is UNIQUE, so the second one
 * could not be published at all.
 */
export function nextRegistryIdFrom(prefix: string, lastId: string | null): string {
  // Whatever follows the eight date digits is the sequence. Positional rather
  // than delimited now, which still reads unambiguously past 99 because the
  // date block is always exactly eight characters.
  const last = lastId ? parseInt(lastId.slice(prefix.length), 10) : 0;
  return prefix + String((Number.isFinite(last) ? last : 0) + 1).padStart(2, '0');
}
