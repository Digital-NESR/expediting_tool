import { describe, expect, it } from 'vitest';

import {
  MATCH_THRESHOLD,
  levenshtein,
  matchScore,
  norm,
  tokenScore,
  tokenize,
} from '@/lib/sg-fuzzy';

describe('norm / tokenize', () => {
  it('lowercases and reduces punctuation to single spaces', () => {
    expect(norm('Drilling Fluids')).toBe('drilling fluids');
    expect(norm('  Valves & Fittings (High-Pressure)  ')).toBe('valves fittings high pressure');
    expect(norm('PO#12345/A')).toBe('po 12345 a');
  });

  it('is empty for empty or punctuation-only input', () => {
    expect(norm('')).toBe('');
    expect(norm('---')).toBe('');
    expect(norm(undefined as unknown as string)).toBe('');
  });

  it('tokenizes into words and never yields an empty token', () => {
    expect(tokenize('Valves & Fittings')).toEqual(['valves', 'fittings']);
    expect(tokenize('   ')).toEqual([]);
    expect(tokenize('---')).toEqual([]);
    expect(tokenize('a')).toEqual(['a']);
  });
});

describe('levenshtein', () => {
  it('is 0 for identical strings', () => {
    expect(levenshtein('valve', 'valve')).toBe(0);
    expect(levenshtein('', '')).toBe(0);
  });

  it("is the other string's length against an empty string", () => {
    expect(levenshtein('', 'valve')).toBe(5);
    expect(levenshtein('valve', '')).toBe(5);
  });

  it('counts substitutions, insertions and deletions', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('valve', 'valv')).toBe(1);
    expect(levenshtein('valve', 'vlave')).toBe(2);
    expect(levenshtein('cementing', 'cemnting')).toBe(1);
  });

  it('is symmetric', () => {
    for (const [a, b] of [
      ['kitten', 'sitting'],
      ['drilling', 'driling'],
      ['abc', 'xyz'],
    ]) {
      expect(levenshtein(a, b)).toBe(levenshtein(b, a));
    }
  });
});

describe('tokenScore ordering', () => {
  it('ranks exact above prefix above substring above reverse-prefix', () => {
    const exact = tokenScore('valve', 'valve');
    const prefix = tokenScore('valve', 'valves');
    const substring = tokenScore('valve', 'microvalves');
    const reversePrefix = tokenScore('valves', 'valv');

    expect(exact).toBe(1);
    expect(prefix).toBe(0.9);
    expect(substring).toBe(0.72);
    expect(reversePrefix).toBe(0.6);
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(reversePrefix);
  });

  it('scores a typo below every structural match but above nothing', () => {
    const typo = tokenScore('cemnting', 'cementing');
    expect(typo).toBeGreaterThan(0);
    expect(typo).toBeLessThan(tokenScore('valve', 'microvalves'));
  });

  it('gives 0 when either side is empty', () => {
    expect(tokenScore('', 'valve')).toBe(0);
    expect(tokenScore('valve', '')).toBe(0);
  });

  it('refuses typo tolerance for short query tokens', () => {
    // Tokens of 3 characters or fewer must match exactly, by prefix or by
    // substring — one edit on a 3-letter token is too much signal to lose.
    expect(tokenScore('abc', 'abd')).toBe(0);
    expect(tokenScore('abc', 'abc')).toBe(1);
    expect(tokenScore('abc', 'abcd')).toBe(0.9);
  });

  it('rejects a distant longer token outright', () => {
    expect(tokenScore('cementing', 'wireline')).toBe(0);
  });
});

describe('matchScore ranking', () => {
  it('scores an exact primary match highest, then prefix, then substring', () => {
    const exact = matchScore('valves', 'Valves');
    const prefix = matchScore('valves', 'Valves and Fittings');
    const substring = matchScore('valves', 'Industrial Valves Package');
    const unrelated = matchScore('valves', 'Cementing Services');

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(unrelated);
    expect(unrelated).toBe(0);
  });

  it('puts an exact match well above the match threshold', () => {
    expect(matchScore('valves', 'Valves')).toBeGreaterThan(MATCH_THRESHOLD);
    expect(MATCH_THRESHOLD).toBe(0.42);
  });

  it('produces a stable descending ranking for a realistic candidate list', () => {
    const candidates = [
      'Cementing Services',
      'Industrial Valves Package',
      'Valves',
      'Valves and Fittings',
      'Wireline Logging',
    ];
    const ranked = candidates
      .map((name) => ({ name, score: matchScore('valves', name) }))
      .filter((x) => x.score >= MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.name);

    expect(ranked).toEqual(['Valves', 'Valves and Fittings', 'Industrial Valves Package']);
  });

  it('is order-insensitive in the query but still prefers the exact phrase', () => {
    const exactPhrase = matchScore('drilling fluids', 'Drilling Fluids');
    const reordered = matchScore('fluids drilling', 'Drilling Fluids');
    expect(reordered).toBeGreaterThan(MATCH_THRESHOLD);
    expect(exactPhrase).toBeGreaterThan(reordered);
  });

  it('tolerates a single-character typo on a long token', () => {
    expect(matchScore('cemnting', 'Cementing Services')).toBeGreaterThan(MATCH_THRESHOLD);
  });

  it('returns 0 for an empty or punctuation-only query', () => {
    expect(matchScore('', 'Valves')).toBe(0);
    expect(matchScore('   ', 'Valves')).toBe(0);
    expect(matchScore('---', 'Valves')).toBe(0);
  });

  it('rejects a query whose tokens mostly land nowhere', () => {
    // Coverage rule: at least 60% of the query tokens must hit something.
    expect(matchScore('valves zzzz qqqq wwww', 'Valves')).toBe(0);
  });

  it('weighs a primary-field hit above the same hit in the extra text', () => {
    const inPrimary = matchScore('cementing', 'Cementing Services', 'Wireline category');
    const inExtra = matchScore('cementing', 'Wireline Logging', 'Cementing category');
    expect(inPrimary).toBeGreaterThan(inExtra);
    expect(inExtra).toBeGreaterThan(0);
  });

  it('lets the extra text rescue a match the primary field misses', () => {
    expect(matchScore('cementing', 'Wireline Logging')).toBe(0);
    expect(matchScore('cementing', 'Wireline Logging', 'cementing keywords')).toBeGreaterThan(0);
  });

  it('ignores punctuation and casing differences between query and field', () => {
    expect(matchScore('valves & fittings', 'Valves and Fittings')).toBeGreaterThan(MATCH_THRESHOLD);
    expect(matchScore('VALVES', 'valves')).toBe(matchScore('valves', 'Valves'));
  });

  it('is deterministic — the same inputs always score the same', () => {
    const first = matchScore('drilling fluids', 'Drilling Fluids and Additives', 'chemicals');
    for (let i = 0; i < 5; i++) {
      expect(matchScore('drilling fluids', 'Drilling Fluids and Additives', 'chemicals')).toBe(
        first,
      );
    }
  });

  it('does not let a longer field name outscore an exact one', () => {
    // A short exact hit must beat a long field that merely contains the query.
    const scores = [
      'Valves',
      'Valves Valves Valves',
      'Assorted Industrial Valves and Fittings Package',
    ].map((name) => matchScore('valves', name));
    expect(scores[0]).toBeGreaterThanOrEqual(scores[1]);
    expect(scores[0]).toBeGreaterThan(scores[2]);
  });
});
