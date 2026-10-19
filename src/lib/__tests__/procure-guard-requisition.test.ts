import { describe, expect, it } from 'vitest';
import {
  allowsFreeTextRequisition,
  formatRequisitionNumbers,
  parseRequisitionNumbers,
  requireRequisitionNumbers,
  requisitionError,
  usedHqDubaiException,
} from '@/lib/procure-guard/requisition';

/**
 * What an adhoc requisition field may contain.
 *
 * The cases below are not invented: every string marked "live" is one a requester actually typed
 * into the free-text field this replaces, taken from the 110 adhoc requests on record. That is
 * what the rule has to handle, and what it has to refuse.
 */

describe('a single requisition number', () => {
  it('takes ten digits', () => {
    expect(parseRequisitionNumbers('1010010287').numbers).toEqual(['1010010287']);
    expect(requisitionError('1010010287')).toBeNull();
  });

  it('trims what was pasted', () => {
    expect(parseRequisitionNumbers('  1010010287  ').numbers).toEqual(['1010010287']);
  });

  /* Live: one adhoc request carries a 5-prefixed number. Prefixes are not the rule, length is. */
  it('does not care which digit it starts with', () => {
    expect(requisitionError('5180008611')).toBeNull();
  });

  it('refuses nine digits and eleven', () => {
    expect(requisitionError('101001028')).toContain('exactly 10 digits');
    expect(requisitionError('10100102877')).toContain('exactly 10 digits');
  });
});

describe('the values that made this necessary', () => {
  /* All live. Each of these reached an approver's inbox as the reference to look up in SAP. */
  it.each(['NA', 'n/a', '0', '07-2026', '/', 'Rawnd Alshikhi'])('refuses %j', (raw) => {
    expect(requisitionError(raw)).not.toBeNull();
  });

  /* Live: `PR 1010010287`. The number is in there, but accepting it would mean deciding that
     "PR" is noise and something else is not. The requester is asked for the number alone. */
  it('refuses a number with a label stuck to it', () => {
    const message = requisitionError('PR 1010010287');
    expect(message).toContain('"PR"');
  });

  it('names what was wrong rather than just refusing', () => {
    expect(requisitionError('07-2026')).toContain('"07-2026"');
    expect(requisitionError('07-2026')).toContain('1010010287');
  });

  /* A long list of rubbish is still one thing to fix. Listing all of it buries the example that
     shows what a good value looks like. */
  it('shows three bad values at most', () => {
    const message = requisitionError('a b c d e') ?? '';
    expect(message).toContain('and 2 more');
    expect(message).not.toContain('"e"');
  });

  it('refuses an empty field', () => {
    expect(requisitionError('')).toContain('At least one');
    expect(requisitionError('   ')).toContain('At least one');
    expect(requisitionError(null)).toContain('At least one');
  });
});

describe('several requisitions in one field', () => {
  /* Live: `1005034844/1005035231/1005034844` - and note the first number appears twice. */
  it('splits the slash-separated one from the live data, and keeps the repeat once', () => {
    const parsed = parseRequisitionNumbers('1005034844/1005035231/1005034844');
    expect(parsed.numbers).toEqual(['1005034844', '1005035231']);
    expect(parsed.duplicates).toEqual(['1005034844']);
    expect(parsed.invalid).toEqual([]);
  });

  /* Live: `1010010158 - 1010010157`, `4160010356 & 4160010534`, and comma-separated. */
  it.each([
    ['1010010158 - 1010010157', ['1010010158', '1010010157']],
    ['4160010356 & 4160010534', ['4160010356', '4160010534']],
    ['1010010158, 1010010157', ['1010010158', '1010010157']],
    ['1010010158; 1010010157', ['1010010158', '1010010157']],
    ['1010010158 1010010157', ['1010010158', '1010010157']],
    ['1010010158 and 1010010157', ['1010010158', '1010010157']],
  ])('splits %j', (raw, expected) => {
    expect(parseRequisitionNumbers(raw).numbers).toEqual(expected);
  });

  /* A tight hyphen is NOT a separator. Splitting on it would turn one wrong number into two
     plausible-looking ones, which is worse than refusing: the requester would never be told. */
  it('refuses a tight hyphen rather than guessing where to cut', () => {
    const parsed = parseRequisitionNumbers('1010010158-1010010157');
    expect(parsed.numbers).toEqual([]);
    expect(parsed.invalid).toEqual(['1010010158-1010010157']);
  });

  it('keeps the order they were given in', () => {
    expect(parseRequisitionNumbers('1010010157, 1010010158, 1010010156').numbers).toEqual([
      '1010010157',
      '1010010158',
      '1010010156',
    ]);
  });

  it('rejects the whole field when one of several is wrong', () => {
    expect(requisitionError('1010010157, NA')).toContain('"NA"');
  });
});

describe('what gets stored', () => {
  it('is one spelling of the list, whatever arrived', () => {
    expect(requireRequisitionNumbers('1005034844/1005035231')).toBe('1005034844, 1005035231');
    expect(requireRequisitionNumbers('  1010010287  ')).toBe('1010010287');
    expect(requireRequisitionNumbers('1010010158 & 1010010157')).toBe('1010010158, 1010010157');
  });

  it('drops a repeat rather than storing it twice', () => {
    expect(requireRequisitionNumbers('1005034844/1005035231/1005034844')).toBe(
      '1005034844, 1005035231',
    );
  });

  /* The guard, not the courtesy: this runs inside a server action, where the browser's check
     means nothing. */
  it('throws on anything the form would have refused', () => {
    expect(() => requireRequisitionNumbers('NA')).toThrow(/exactly 10 digits/);
    expect(() => requireRequisitionNumbers('')).toThrow(/At least one/);
  });

  it('says the same sentence the field said', () => {
    const typed = 'PR 1010010287';
    expect(() => requireRequisitionNumbers(typed)).toThrow(requisitionError(typed) as string);
  });

  it('round-trips through the stored form', () => {
    const stored = requireRequisitionNumbers('1005034844/1005035231');
    expect(requisitionError(stored)).toBeNull();
    expect(formatRequisitionNumbers(parseRequisitionNumbers(stored).numbers)).toBe(stored);
  });
});

/**
 * HQ Dubai's exemption.
 *
 * Its requests do not always sit behind an SAP requisition, so there the field takes any text.
 * The exemption is by country and nothing else: there is no per-user override and no checkbox,
 * so the only way to reach it is to be raising an HQ Dubai request. What the tests below pin is
 * that it does not leak to any other country, and that "free text" still does not mean "blank".
 */
describe('the HQ Dubai exemption', () => {
  it('applies to HQ Dubai and to nothing else', () => {
    expect(allowsFreeTextRequisition('HQ Dubai')).toBe(true);
    expect(allowsFreeTextRequisition('Kuwait')).toBe(false);
    expect(allowsFreeTextRequisition('Saudi Arabia (KSA)')).toBe(false);
    expect(allowsFreeTextRequisition('')).toBe(false);
    expect(allowsFreeTextRequisition(null)).toBe(false);
  });

  /* A country arriving in another case would otherwise silently lose its exemption and refuse a
     perfectly good request. */
  it('is not defeated by case or padding', () => {
    expect(allowsFreeTextRequisition('  hq dubai  ')).toBe(true);
  });

  it('accepts text that would be refused anywhere else', () => {
    expect(requisitionError('Verbal approval from FD, no PR raised', 'HQ Dubai')).toBeNull();
    expect(requisitionError('NA', 'HQ Dubai')).toBeNull();
    expect(requisitionError('NA', 'Kuwait')).not.toBeNull();
  });

  /* The one thing the exemption does not cover. A request with no reference at all is not an
     exception, it is an omission. */
  it('still refuses an empty field', () => {
    expect(requisitionError('', 'HQ Dubai')).toContain('required');
    expect(requisitionError('   ', 'HQ Dubai')).toContain('required');
  });

  /* Prose must not be reordered and comma-joined by the number formatter. */
  it('stores free text as typed, only trimmed', () => {
    expect(requireRequisitionNumbers('  PR raised verbally by Ops  ', 'HQ Dubai')).toBe(
      'PR raised verbally by Ops',
    );
  });

  /* A real PR number from HQ Dubai is still a PR number and is tidied like one. */
  it('still tidies a proper number from HQ Dubai', () => {
    expect(requireRequisitionNumbers('1010010287', 'HQ Dubai')).toBe('1010010287');
  });

  it('leaves every other country on the ten-digit rule', () => {
    expect(() => requireRequisitionNumbers('no PR', 'Kuwait')).toThrow(/exactly 10 digits/);
    expect(() => requireRequisitionNumbers('no PR', undefined)).toThrow(/exactly 10 digits/);
  });
});

describe('telling a free-text reference from a bad number', () => {
  /* The question an audit asks, which the stored value alone cannot answer: was this deliberate
     or malformed? Derived rather than stored, so it cannot go stale. */
  it('flags HQ Dubai free text', () => {
    expect(usedHqDubaiException('Verbal approval', 'HQ Dubai')).toBe(true);
  });

  it('does not flag a proper number, whatever the country', () => {
    expect(usedHqDubaiException('1010010287', 'HQ Dubai')).toBe(false);
    expect(usedHqDubaiException('1010010287', 'Kuwait')).toBe(false);
  });

  it('does not flag another country, which could not have used it', () => {
    expect(usedHqDubaiException('Verbal approval', 'Kuwait')).toBe(false);
  });

  it('does not flag an empty value', () => {
    expect(usedHqDubaiException('', 'HQ Dubai')).toBe(false);
  });
});
