import { describe, expect, it } from 'vitest';
import { feedCountryKey } from '@/lib/rrsm/released-prs';

/**
 * The country names RFx Officer's feed actually carries on service rows, read from production
 * on 12 Nov 2026. Pinned here because the whole point of `feedCountryKey` is to reconcile two
 * lists that disagree, and a test written against invented names would prove nothing.
 */
const FEED_COUNTRIES = [
  'United Arab Emirates',
  'Egypt',
  'Saudi Arabia',
  'Algeria',
  'Oman',
  'Iraq',
  'Kuwait',
  'Libya',
  'Syria',
  'Chad',
  'Qatar',
  'India',
];

/** As `rrsm_countries` spells them, which is Catalog Manager's list. */
const RRSM_NAMES = [
  'Algeria',
  'Bahrain',
  'Chad',
  'Congo',
  'Egypt',
  'EOS',
  'HQ Dubai',
  'India',
  'Indonesia',
  'Iraq',
  'Jordan',
  'Kuwait',
  'Libya',
  'Malaysia',
  'Oman',
  'Qatar',
  'Saudi Arabia (KSA)',
  'United Arab Emirates (UAE)',
  'Yemen',
];

describe('feedCountryKey', () => {
  it('drops the parenthetical suffix the two lists disagree about', () => {
    expect(feedCountryKey('Saudi Arabia (KSA)')).toBe('saudi arabia');
    expect(feedCountryKey('United Arab Emirates (UAE)')).toBe('united arab emirates');
  });

  it('matches the feed spelling for every country that exists in both lists', () => {
    const feed = new Set(FEED_COUNTRIES.map(feedCountryKey));
    const matched = RRSM_NAMES.filter((n) => feed.has(feedCountryKey(n)));

    /* The eleven that genuinely overlap. If this list moves, one of the two country lists has
       been edited and the mapping needs looking at rather than the test needing updating. */
    expect(matched.sort()).toEqual([
      'Algeria',
      'Chad',
      'Egypt',
      'India',
      'Iraq',
      'Kuwait',
      'Libya',
      'Oman',
      'Qatar',
      'Saudi Arabia (KSA)',
      'United Arab Emirates (UAE)',
    ]);
  });

  it('matches nothing for the two entries that are entities rather than countries', () => {
    const feed = new Set(FEED_COUNTRIES.map(feedCountryKey));
    expect(feed.has(feedCountryKey('HQ Dubai'))).toBe(false);
    expect(feed.has(feedCountryKey('EOS'))).toBe(false);
  });

  it('leaves Syria unreachable by country filter, because RRSM has no such country', () => {
    const rrsm = new Set(RRSM_NAMES.map(feedCountryKey));
    expect(rrsm.has(feedCountryKey('Syria'))).toBe(false);
  });

  it('is case and whitespace insensitive, so a stored value with padding still matches', () => {
    expect(feedCountryKey('  KUWAIT  ')).toBe('kuwait');
    expect(feedCountryKey('kuwait')).toBe(feedCountryKey('Kuwait'));
  });

  it('is empty for nothing, which is what switches the country filter off', () => {
    expect(feedCountryKey(null)).toBe('');
    expect(feedCountryKey(undefined)).toBe('');
    expect(feedCountryKey('   ')).toBe('');
  });
});
