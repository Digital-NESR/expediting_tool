/**
 * Turning free-text PO line descriptions into something groupable.
 *
 * Pure — no pool, no database, unit-tested against hand-built strings.
 *
 * 545,469 PO lines carry no SAP material number, covering $3,518.3M. They are services and
 * direct orders, and `short_text` is the only description they have — `material_desc` is
 * material-master-derived and blank on every one of them. Grouping them is the only way to see
 * repeat service buying at all.
 *
 * ── THE TEXT IS CLEANER THAN EXPECTED; THE CARDINALITY IS THE PROBLEM ───────────────────────
 * Profiling found zero blank descriptions, a median length of 29 characters, and only ~2.1% of
 * lines that look like junk. What makes the field hard is 415,148 distinct strings for 545,469
 * lines. Normalisation is not about cleaning dirt, it is about collapsing spellings:
 * `WD-40`, `WD40` and `WD 40` are one item written three ways.
 *
 * ── THE THREE DEFECTS THAT SHAPED THIS MODULE ───────────────────────────────────────────────
 * 1. MONTH NAMES SHATTER CLUSTERS. "NOV SITE DIESEL SUPPLY", "APR SITE DIESEL SUPPLY" and ten
 *    siblings are one $40M+ opportunity fragmented into twelve monthly pieces, each too small
 *    to clear a threshold. Stripping month names is the single highest-value step here.
 * 2. NON-ADDRESSABLE SPEND RANKS TOP. Payroll, customs duty and tax were among the highest-value
 *    clusters found. You cannot run a sourcing event on a tax. The blocklist still leaves 84%
 *    of no-material spend in scope, so it is cheap.
 * 3. MULTILINGUAL. Algeria's descriptions are largely French — "AZOTE LIQUIDE" is liquid
 *    nitrogen. No normalisation will ever merge that with its English twin, which is why
 *    clusters are built per country and never across them. Stated so nobody later reads a
 *    country gap as a data error.
 *
 * Stripping digits and punctuation more than doubles usable multi-supplier clusters against raw
 * upper-casing (5,650 → 8,570) and adds $285M of covered spend. Token-sorting gains a further
 * 25% but costs 19.5s against 7.7s, which is too slow to run per filter change — so it is not
 * done here.
 */

/** Month names and abbreviations, English and French, which fragment otherwise-identical text. */
const MONTH_WORDS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
  'JAN', 'FEB', 'MAR', 'APR', 'JUN', 'JUL', 'AUG', 'SEP', 'SEPT', 'OCT', 'NOV', 'DEC',
  'JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET',
  'AOUT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DECEMBRE',
];

const MONTH_RE = new RegExp(`\\b(${MONTH_WORDS.join('|')})\\b`, 'g');

/**
 * Spend that exists but cannot be sourced.
 *
 * Each of these was found near the top of the value ranking during profiling. Payroll and
 * customs duty were the #4 to #8 clusters by spend — real money, entirely un-negotiable by a
 * category manager.
 */
const NON_ADDRESSABLE = [
  /\bPAYROLL\b/, /\bSALAR/, /\bWAGE/, /\bGRATUIT/, /\bBONUS\b/, /\bPENSION\b/,
  /\bCUSTOM/, /\bDUTY\b/, /\bDUTIES\b/, /\bTAX\b/, /\bVAT\b/, /\bZAKAT\b/, /\bFINE\b/, /\bPENALT/,
  /\bVISA\b/, /\bIQAMA\b/, /\bPERMIT\b/, /\bLICENSE\b/, /\bLICENCE\b/, /\bSPONSORSHIP\b/,
  /\bINSURANCE\b/, /\bMEDICAL INSURANCE\b/,
  /\bRENT\b/, /\bRENTAL\b/, /\bLEASE\b/,
  /\bFREIGHT\b/, /\bCLEARANCE\b/, /\bDEMURRAGE\b/, /\bCOURIER\b/,
  /\bADVANCE PAYMENT\b/, /\bPETTY CASH\b/, /\bREIMBURS/,
];

/** Placeholders that carry no meaning even when they repeat. */
const PLACEHOLDER = new Set([
  'TBD', 'TBA', 'NA', 'N A', 'MISC', 'MISCELLANEOUS', 'VARIOUS', 'OTHER', 'OTHERS',
  'ITEM', 'ITEMS', 'SERVICE', 'SERVICES', 'CHARGES', 'CHARGE', 'SUNDRY', 'GENERAL',
  'AS PER ATTACHMENT', 'AS PER QUOTATION', 'AS PER ATTACHED', 'AS DISCUSSED',
]);

/** Below this, a description is a code or an abbreviation rather than a description. */
const MIN_USEFUL_LENGTH = 8;
/** A description needs some actual words, not just a part number with a letter in it. */
const MIN_LETTERS = 6;

/**
 * The grouping key for a description.
 *
 * Upper-case, strip everything that is not a letter or a space, remove month names, collapse
 * whitespace. Digits go because part numbers and quantities embedded in free text are the main
 * reason two identical items fail to group.
 */
export function normaliseDescription(raw: string | null | undefined): string {
  const text = (raw ?? '').toUpperCase();
  if (!text.trim()) return '';
  return text
    .replace(/[^A-Z\s]/g, ' ')
    .replace(MONTH_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type RejectReason = 'blank' | 'too-short' | 'too-few-letters' | 'placeholder' | 'non-addressable';

export interface ClusterKey {
  key: string;
  usable: boolean;
  reason?: RejectReason;
}

/**
 * Normalise, then decide whether the result is worth grouping on.
 *
 * The brief was explicit: ignore unclear descriptions rather than guess at them. This errs
 * toward rejection — a cluster built on a vague key produces a project nobody can act on, which
 * costs more credibility than the missed opportunity costs money.
 */
export function clusterKey(raw: string | null | undefined): ClusterKey {
  const key = normaliseDescription(raw);
  if (!key) return { key, usable: false, reason: 'blank' };
  if (PLACEHOLDER.has(key)) return { key, usable: false, reason: 'placeholder' };
  if (key.length < MIN_USEFUL_LENGTH) return { key, usable: false, reason: 'too-short' };

  const letters = key.replace(/\s/g, '').length;
  if (letters < MIN_LETTERS) return { key, usable: false, reason: 'too-few-letters' };

  if (NON_ADDRESSABLE.some((re) => re.test(key))) {
    return { key, usable: false, reason: 'non-addressable' };
  }

  return { key, usable: true };
}

/**
 * How a cluster is labelled on the board.
 *
 * The normalised key is upper-case with its digits removed, which reads badly. The most common
 * original spelling is shown instead — it is what the buyer actually wrote, so it is what they
 * will recognise. Ties break on the longest, which tends to be the most descriptive.
 */
export function clusterLabel(originals: string[]): string {
  if (!originals.length) return '(no description)';
  const counts = new Map<string, number>();
  for (const o of originals) {
    const t = o.trim();
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  if (!counts.size) return '(no description)';
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || b[0].length - a[0].length,
  )[0][0];
}

export const REJECT_LABEL: Record<RejectReason, string> = {
  blank: 'No description',
  'too-short': 'Description too short to identify',
  'too-few-letters': 'Description is a code, not a description',
  placeholder: 'Placeholder description',
  'non-addressable': 'Not sourceable (payroll, tax, rent, permits, freight)',
};
