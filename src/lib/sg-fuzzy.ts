/**
 * Lightweight, dependency-free fuzzy text matching for SourceGuide search.
 *
 * pg_trgm is not allow-listed on the Azure Postgres instance, so relevance
 * ranking happens in the application layer over small cached indexes. The
 * scorer tolerates typos (Levenshtein), partial words, and word-order changes.
 */

export function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function tokenize(s: string): string[] {
  const n = norm(s);
  return n ? n.split(' ') : [];
}

/** Classic Levenshtein edit distance (iterative, two-row). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  let prev = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    const cur = new Array<number>(bl + 1);
    cur[0] = i;
    const ac = a.charCodeAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cost = ac === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[bl];
}

/** How well a single query token matches a single field token (0..1). */
export function tokenScore(qt: string, ht: string): number {
  if (!ht || !qt) return 0;
  if (qt === ht) return 1;
  if (ht.startsWith(qt)) return 0.9;
  if (ht.includes(qt)) return 0.72;
  if (qt.length >= 4 && ht.length >= 3 && qt.startsWith(ht)) return 0.6;
  // typo tolerance for longer tokens only (short tokens must match exactly / by substring above)
  const maxLen = Math.max(qt.length, ht.length);
  const ratio = 1 - levenshtein(qt, ht) / maxLen;
  const minRatio = qt.length <= 3 ? 2 : qt.length <= 5 ? 0.6 : 0.5;
  return ratio >= minRatio ? ratio * 0.7 : 0;
}

function bestTokenScore(qt: string, tokens: string[]): number {
  let best = 0;
  for (const ht of tokens) {
    const s = tokenScore(qt, ht);
    if (s > best) { best = s; if (best >= 1) break; }
  }
  return best;
}

/** Minimum score for a row to be considered a match. */
export const MATCH_THRESHOLD = 0.42;

/**
 * Score how well `query` matches an entry with a primary field (e.g. commodity
 * name) and optional extra searchable text (category, keywords, code...).
 * Returns 0 for a non-match; substring/prefix hits on the primary score > 1.
 */
export function matchScore(query: string, primary: string, extra = ''): number {
  const qTokens = tokenize(query);
  if (!qTokens.length) return 0;
  const nq = norm(query);
  const nPrimary = norm(primary);
  const primaryTokens = tokenize(primary);
  const extraTokens = extra ? tokenize(extra) : [];
  const allTokens = extraTokens.length ? primaryTokens.concat(extraTokens) : primaryTokens;

  let covered = 0, primarySum = 0, allSum = 0;
  for (const qt of qTokens) {
    const bAll = bestTokenScore(qt, allTokens);
    const bPrimary = extraTokens.length ? bestTokenScore(qt, primaryTokens) : bAll;
    if (bAll >= 0.4) covered++;
    allSum += bAll;
    primarySum += bPrimary;
  }
  // most query tokens must land somewhere, otherwise it is noise
  if (covered < Math.ceil(qTokens.length * 0.6)) return 0;

  // primary-field matches weigh more than extra-only matches
  let score = (primarySum + (allSum - primarySum) * 0.35) / qTokens.length;

  // whole-query boosts on the primary field
  if (nPrimary === nq) score += 2;
  else if (nPrimary.startsWith(nq)) score += 1.2;
  else if (nq.length >= 2 && nPrimary.includes(nq)) score += 0.7;

  return score;
}
