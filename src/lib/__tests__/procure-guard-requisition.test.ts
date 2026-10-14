import { describe, expect, it } from 'vitest';
import {
  formatRequisitionNumbers,
  parseRequisitionNumbers,
  requireRequisitionNumbers,
  requisitionError,
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
