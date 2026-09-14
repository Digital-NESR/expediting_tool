/**
 * Shared TI-TE constants.
 *
 * Reference numbers are `<ISO3 country code>-<per-country sequence>`, e.g.
 * `OMN-020`. Both the bulk Excel migration and the Add Shipment form use this
 * map so the two paths cannot drift apart again.
 */

/**
 * The ONE canonical list of TI-TE operating countries.
 *
 * `value` is what is written to `shipments.country`, `country_stakeholders.country`
 * and `access_requests.approved_countries`; `label` is what a picker displays.
 * They are currently identical on purpose — the parenthesised form is already the
 * dominant stored value, and the short forms ('Saudi Arabia', 'UAE') are accepted
 * only as input aliases, never written.
 *
 * Every admin panel, the TI-TE app pages and the Excel migration import this list.
 * When they each kept their own copy they drifted: the Default Notifiers panel wrote
 * 'Saudi Arabia' while the migration wrote 'Saudi Arabia (KSA)', so the stakeholder
 * seed join in `importShipments` matched nothing and migrated shipments were created
 * with no notification recipients at all.
 */
export interface TiteCountryOption {
  /** The stored value. Never change one of these without a data fix. */
  value: string;
  /** What a picker shows. */
  label: string;
}

export const TITE_COUNTRIES: readonly TiteCountryOption[] = [
  { value: 'Saudi Arabia (KSA)',         label: 'Saudi Arabia (KSA)' },
  { value: 'United Arab Emirates (UAE)', label: 'United Arab Emirates (UAE)' },
  { value: 'Qatar',                      label: 'Qatar' },
  { value: 'Kuwait',                     label: 'Kuwait' },
  { value: 'Oman',                       label: 'Oman' },
  { value: 'Bahrain',                    label: 'Bahrain' },
  { value: 'Egypt',                      label: 'Egypt' },
  { value: 'Algeria',                    label: 'Algeria' },
  { value: 'Iraq',                       label: 'Iraq' },
  { value: 'Libya',                      label: 'Libya' },
  { value: 'Indonesia',                  label: 'Indonesia' },
  { value: 'Chad',                       label: 'Chad' },
  { value: 'Congo',                      label: 'Congo' },
  { value: 'Other',                      label: 'Other' },
];

/** Just the stored values, in display order. */
export const TITE_COUNTRY_VALUES: readonly string[] = TITE_COUNTRIES.map(c => c.value);

/**
 * The sentinel country that grants read-everything, write-nothing. Lives here,
 * next to the country list, because the request overlay and the approvals panel
 * are client components and cannot import the server-only `tite-auth` module —
 * which is how a second, drifting copy of this string would get created.
 * `tite-auth` re-exports it so existing importers are unaffected.
 */
export const TITE_VIEW_ALL_COUNTRIES = 'All Countries - View Only';

/** Operating country (as stored in `shipments.country`) → ISO3-style code. */
export const TITE_COUNTRY_CODE: Record<string, string> = {
  'Saudi Arabia (KSA)':          'KSA',
  'United Arab Emirates (UAE)':  'UAE',
  'Qatar':                        'QAT',
  'Kuwait':                       'KWT',
  'Oman':                         'OMN',
  'Bahrain':                      'BHR',
  'Egypt':                        'EGY',
  'Algeria':                      'DZA',
  'Iraq':                         'IRQ',
  'Libya':                        'LBY',
  'Indonesia':                    'IDN',
  'Chad':                         'TCD',
  'Congo':                        'COG',
  'Other':                        'OTH',
};

/**
 * Legacy / short spellings that some pickers used to write, mapped to the value
 * they should have written. Lowercased keys; matched after trim + lowercase.
 */
const TITE_COUNTRY_ALIASES: Record<string, string> = {
  'saudi arabia': 'Saudi Arabia (KSA)',
  'ksa':          'Saudi Arabia (KSA)',
  'united arab emirates': 'United Arab Emirates (UAE)',
  'uae':          'United Arab Emirates (UAE)',
};

/**
 * Normalise any stored or user-entered country spelling to its canonical value,
 * or `null` when it is not a TI-TE operating country at all.
 *
 * Deliberately separate from {@link titeCountryCode}: this one resolves the bare
 * short forms ('UAE', 'KSA') that the old pickers wrote, which the reference-number
 * prefix lookup must NOT (an unknown label there has to fall through to `OTH`).
 */
export function canonicalTiteCountry(country?: string | null): string | null {
  const raw = (country ?? '').trim();
  if (!raw) return null;
  const exact = TITE_COUNTRIES.find(c => c.value === raw);
  if (exact) return exact.value;
  const lower = raw.toLowerCase();
  const alias = TITE_COUNTRY_ALIASES[lower];
  if (alias) return alias;
  const ci = TITE_COUNTRIES.find(c => c.value.toLowerCase() === lower);
  return ci ? ci.value : null;
}

/** True when two country spellings name the same TI-TE operating country. */
export function sameTiteCountry(a?: string | null, b?: string | null): boolean {
  const ca = canonicalTiteCountry(a);
  const cb = canonicalTiteCountry(b);
  if (ca && cb) return ca === cb;
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase() && !!(a ?? '').trim();
}

/** Fallback code for a country that is missing or not in the map. */
export const TITE_FALLBACK_COUNTRY_CODE = 'OTH';

/** Digits in the sequence part of a reference number (`OMN-020`). */
export const TITE_REFERENCE_PAD = 3;

/**
 * Resolve a country label to its reference-number prefix. Tolerates casing and
 * surrounding whitespace, and matches `Saudi Arabia` to `Saudi Arabia (KSA)`
 * so the shorter labels used in some pickers still resolve.
 */
export function titeCountryCode(country?: string | null): string {
  const raw = (country ?? '').trim();
  if (!raw) return TITE_FALLBACK_COUNTRY_CODE;
  if (TITE_COUNTRY_CODE[raw]) return TITE_COUNTRY_CODE[raw];
  const lower = raw.toLowerCase();
  for (const [label, code] of Object.entries(TITE_COUNTRY_CODE)) {
    if (label.toLowerCase() === lower) return code;
    // 'Saudi Arabia' should match 'Saudi Arabia (KSA)'
    if (label.toLowerCase().replace(/\s*\(.*\)$/, '') === lower) return code;
  }
  return TITE_FALLBACK_COUNTRY_CODE;
}

/** Format a reference number from a prefix and a sequence number. */
export function formatTiteReference(code: string, sequence: number): string {
  return `${code}-${String(sequence).padStart(TITE_REFERENCE_PAD, '0')}`;
}
