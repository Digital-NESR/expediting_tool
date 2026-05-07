export const COUNTRY_CURRENCY: Record<string, string> = {
  'Saudi Arabia':        'SAR',
  'UAE':                 'AED',
  'United Arab Emirates':'AED',
  'Kuwait':              'KWD',
  'Qatar':               'QAR',
  'Oman':                'OMR',
  'Bahrain':             'BHD',
  'Egypt':               'EGP',
  'Cameroon':            'XAF',
  'Algeria':             'DZD',
  'Iraq':                'IQD',
  'Libya':               'LYD',
};

export const DEFAULT_CURRENCY = 'USD';

/** Returns the local currency code for a country, or USD if unknown. */
export function getCurrencyForCountry(country: string | null | undefined): string {
  if (!country) return DEFAULT_CURRENCY;
  return COUNTRY_CURRENCY[country] ?? DEFAULT_CURRENCY;
}
