/**
 * Shared TI-TE constants.
 *
 * Reference numbers are `<ISO3 country code>-<per-country sequence>`, e.g.
 * `OMN-020`. Both the bulk Excel migration and the Add Shipment form use this
 * map so the two paths cannot drift apart again.
 */

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
  'Chad':                         'TCD',
  'Congo':                        'COG',
  'Other':                        'OTH',
};

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
