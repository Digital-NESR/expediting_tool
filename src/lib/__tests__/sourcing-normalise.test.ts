import { describe, expect, it } from 'vitest';
import { clusterKey, clusterLabel, normaliseDescription } from '@/lib/sourcing/normalise';

describe('normaliseDescription', () => {
  it('collapses the three spellings of one item', () => {
    // Found in the warehouse as WD-40 (92x), WD40 (34x) and WD 40 (32x).
    const keys = ['WD-40', 'WD40', 'WD 40'].map(normaliseDescription);
    expect(new Set(keys).size).toBe(1);
  });

  it('merges the twelve monthly diesel clusters into one', () => {
    // One $40M+ opportunity was fragmented into twelve pieces by the month prefix alone.
    const months = ['NOV', 'APR', 'OCT', 'JAN', 'SEPT'].map(
      (m) => `${m} SITE DIESEL SUPPLY`,
    );
    const keys = months.map(normaliseDescription);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe('SITE DIESEL SUPPLY');
  });

  it('strips French month names too, for Algeria', () => {
    expect(normaliseDescription('JANVIER TRANSPORT HASSI')).toBe('TRANSPORT HASSI');
  });

  it('removes digits and punctuation that split identical items', () => {
    expect(normaliseDescription('ELBOW 90° LR 3\'\' FIG 602 (WXT)')).toBe('ELBOW LR FIG WXT');
  });

  it('upper-cases and collapses whitespace', () => {
    expect(normaliseDescription('  Defensive   Driving  Training ')).toBe('DEFENSIVE DRIVING TRAINING');
  });

  it('returns an empty key for empty input rather than throwing', () => {
    expect(normaliseDescription(null)).toBe('');
    expect(normaliseDescription(undefined)).toBe('');
    expect(normaliseDescription('   ')).toBe('');
  });

  it('does not strip a month name embedded inside a word', () => {
    // "DECANTER" begins with DEC; a careless regex would mangle it.
    expect(normaliseDescription('DECANTER CENTRIFUGE')).toBe('DECANTER CENTRIFUGE');
  });
});

describe('clusterKey', () => {
  it('accepts a genuine description', () => {
    expect(clusterKey('Confined Space Entry & Inspection')).toMatchObject({ usable: true });
  });

  it('rejects non-addressable spend that otherwise ranks top by value', () => {
    // Payroll and customs duty were among the highest-value clusters in the warehouse.
    for (const text of [
      'PAYROLL MAY DIRECT SALARY',
      'CUSTOMS DUTY',
      'VISA RENEWAL CHARGES',
      'OFFICE RENT QUARTERLY',
      'MEDICAL INSURANCE PREMIUM',
      'AIR FREIGHT CHARGES',
    ]) {
      expect(clusterKey(text)).toMatchObject({ usable: false, reason: 'non-addressable' });
    }
  });

  it('rejects short codes and abbreviations', () => {
    for (const text of ['SAl', 'WD-40', 'CRC', 'D/O', 'RNB', 'Vat']) {
      expect(clusterKey(text).usable).toBe(false);
    }
  });

  it('rejects placeholders', () => {
    for (const text of ['TBD', 'MISC', 'Various', 'as per attachment']) {
      expect(clusterKey(text)).toMatchObject({ usable: false });
    }
  });

  it('rejects a string that is mostly digits', () => {
    expect(clusterKey('PR 4500123456 / 10').usable).toBe(false);
  });

  it('rejects blank input', () => {
    expect(clusterKey('')).toMatchObject({ usable: false, reason: 'blank' });
  });

  it('keeps a real item even when it contains a number', () => {
    expect(clusterKey('CALCIUM CHLORIDE 97% TON').usable).toBe(true);
  });

  it('does not let a French description be rejected for being foreign', () => {
    // It will never merge with its English twin, but it is a valid country-local cluster.
    expect(clusterKey('AZOTE LIQUIDE VRAC').usable).toBe(true);
  });
});

describe('clusterLabel', () => {
  it('shows the most common original spelling, not the stripped key', () => {
    const label = clusterLabel(['WD-40', 'WD-40', 'WD 40', 'WD40']);
    expect(label).toBe('WD-40');
  });

  it('breaks a tie on the most descriptive spelling', () => {
    const label = clusterLabel(['Diesel', 'Diesel supply to site']);
    expect(label).toBe('Diesel supply to site');
  });

  it('survives an empty list', () => {
    expect(clusterLabel([])).toBe('(no description)');
    expect(clusterLabel(['  '])).toBe('(no description)');
  });
});
