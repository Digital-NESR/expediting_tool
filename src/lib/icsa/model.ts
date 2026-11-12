import {
  ICSA_SECTIONS,
  type IcsaQuestion,
  type IcsaSection,
  type IcsaSectionKey,
} from './questions';

/**
 * ICSA domain rules that both the server and the browser need: response options, scoring,
 * completeness checks, cycle progress against the admin's threshold. Pure functions only; no
 * database, no React, so they are unit-tested directly.
 */

export { ICSA_SECTIONS };
export type { IcsaQuestion, IcsaSection, IcsaSectionKey };

/* ─── Countries ─────────────────────────────────────────────────────────────────────────── */

/**
 * The locations a champion can be appointed for: the "active scope" list of the original ICSA
 * workbook. Most are countries; the UAE is split into the sites that run their own controls
 * (Abu Dhabi, HQ Dubai and the two EOS free-zone entities).
 */
export const ICSA_COUNTRIES = [
  'Saudi Arabia',
  'EOS Jafza',
  'Oman',
  'Algeria',
  'Kuwait',
  'Abu Dhabi',
  'Egypt',
  'Iraq',
  'HQ Dubai',
  'Libya',
  'Qatar',
  'Indonesia',
  'EOS DMCC',
  'Jordan',
  'Chad',
  'India',
  'Congo',
  'Yemen',
] as const;

/**
 * The Azure AD directory spells some locations per site ("UAE-Abu Dhabi", "Iraq South"). These
 * are the directory values that belong to each ICSA location, so a champion filtering their
 * location sees everybody in it. A location not listed here matches itself only. The Dubai
 * entities share one directory country, so a champion narrows them by department or name.
 */
export const DIRECTORY_COUNTRY_ALIASES: Record<string, string[]> = {
  'Abu Dhabi': ['UAE-Abu Dhabi', 'Abu Dhabi'],
  'HQ Dubai': ['UAE-Dubai', 'Dubai', 'United Arab Emirates'],
  'EOS Jafza': ['UAE-Dubai', 'Dubai', 'United Arab Emirates', 'EOS Jafza'],
  'EOS DMCC': ['UAE-Dubai', 'Dubai', 'United Arab Emirates', 'EOS DMCC'],
  Iraq: ['Iraq South', 'Iraq North', 'Iraq'],
  Congo: ['Congo', 'DRC', 'Democratic Republic of the Congo'],
};

export function directoryCountriesFor(country: string): string[] {
  return DIRECTORY_COUNTRY_ALIASES[country] ?? [country];
}

/* ─── Cycles ────────────────────────────────────────────────────────────────────────────── */

export const FREQUENCIES = ['monthly', 'quarterly', 'half-yearly', 'yearly', 'ad-hoc'] as const;
export type IcsaFrequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABEL: Record<IcsaFrequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'half-yearly': 'Half-yearly',
  yearly: 'Yearly',
  'ad-hoc': 'Ad hoc',
};

export type EnrollmentStatus = 'open' | 'closed' | 'force_closed';

export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  open: 'Open',
  closed: 'Closed',
  force_closed: 'Force-closed',
};

/* ─── Assessments ───────────────────────────────────────────────────────────────────────── */

export type AssessmentStatus =
  | 'nominated'
  | 'requested'
  | 'in_progress'
  | 'submitted'
  | 'returned'
  | 'reviewed'
  | 'not_completed';

export const ASSESSMENT_STATUS_LABEL: Record<AssessmentStatus, string> = {
  nominated: 'Not sent',
  requested: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
  returned: 'Returned',
  reviewed: 'Reviewed',
  not_completed: 'Not completed',
};

/** A respondent may edit their form in these states. */
export const EDITABLE_STATUSES: AssessmentStatus[] = ['requested', 'in_progress', 'returned'];

/** These count as a response toward the cycle threshold. */
export const RESPONDED_STATUSES: AssessmentStatus[] = ['submitted', 'reviewed'];

/** Waiting on the respondent, so a reminder makes sense. */
export const AWAITING_RESPONDENT: AssessmentStatus[] = ['requested', 'in_progress', 'returned'];

export const RESPONSES = ['Yes', 'No', 'Partial', 'N/A'] as const;
export type Response = (typeof RESPONSES)[number];

/**
 * One answer. Short keys are deliberate: answers are stored as one JSONB object per assessment
 * and a 100-question form saved every few seconds should stay small.
 *   r  response        m  remarks        rf evidence reference (document name or link)
 *   ac action plan     ow action owner   du action due date (yyyy-mm-dd)
 */
export interface Answer {
  r?: Response | '';
  m?: string;
  rf?: string;
  ac?: string;
  ow?: string;
  du?: string;
}
export type Answers = Record<string, Answer>;

export const ANSWER_FIELDS = ['r', 'm', 'rf', 'ac', 'ow', 'du'] as const;
export const ANSWER_FIELD_MAX = 4000;

/** Evidence limits. Bigger files belong on SharePoint, linked from the evidence reference. */
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_QUESTION = 5;

/** "Q4.12" → "q4_12": the JSON key an answer is stored under. */
export function answerKey(ref: string): string {
  return ref.toLowerCase().replace('.', '_');
}

export function questionText(q: IcsaQuestion, country: string | null | undefined): string {
  return q.text.replace('{country}', country || 'your country');
}

export function sectionsByKeys(keys: readonly string[]): IcsaSection[] {
  return ICSA_SECTIONS.filter((s) => keys.includes(s.key));
}

export function isSectionKey(key: string): key is IcsaSectionKey {
  return ICSA_SECTIONS.some((s) => s.key === key);
}

export function isGap(r: Answer['r']): boolean {
  return r === 'No' || r === 'Partial';
}

/* ─── Scoring ───────────────────────────────────────────────────────────────────────────── */

export interface Tally {
  n: number;
  Yes: number;
  No: number;
  Partial: number;
  'N/A': number;
  /** Unanswered. */
  un: number;
  /** No / Partial without remarks. */
  miss: number;
  done: number;
  /** Share answered, 0..1. */
  comp: number;
  /** Compliance: Yes ÷ (Yes + No + Partial). Null when nothing scoreable was answered. */
  rate: number | null;
  /** No + Partial. */
  open: number;
}

function emptyTally(): Tally {
  return {
    n: 0,
    Yes: 0,
    No: 0,
    Partial: 0,
    'N/A': 0,
    un: 0,
    miss: 0,
    done: 0,
    comp: 0,
    rate: null,
    open: 0,
  };
}

function finish(t: Tally): Tally {
  t.done = t.n - t.un;
  t.comp = t.n ? t.done / t.n : 0;
  const scored = t.Yes + t.No + t.Partial;
  t.rate = scored ? t.Yes / scored : null;
  t.open = t.No + t.Partial;
  return t;
}

export interface Score {
  per: { section: IcsaSection; tally: Tally }[];
  total: Tally;
}

/** Score one respondent's answers over the sections they were assigned. */
export function scoreAnswers(answers: Answers | null | undefined, sections: IcsaSection[]): Score {
  const a = answers ?? {};
  const per = sections.map((section) => {
    const t = emptyTally();
    for (const q of section.questions) {
      t.n += 1;
      const ans = a[answerKey(q.ref)];
      const r = ans?.r;
      if (!r) {
        t.un += 1;
        continue;
      }
      t[r] += 1;
      if (isGap(r) && !String(ans?.m ?? '').trim()) t.miss += 1;
    }
    return { section, tally: finish(t) };
  });
  const total = emptyTally();
  for (const { tally } of per) {
    for (const k of ['n', 'Yes', 'No', 'Partial', 'N/A', 'un', 'miss'] as const)
      total[k] += tally[k];
  }
  return { per, total: finish(total) };
}

export interface Issue {
  /** 'details' or a section key: where the respondent goes to fix it. */
  step: string;
  text: string;
}

/** Everything stopping a respondent from submitting. Empty means they may submit. */
export function submissionIssues(
  doc: { designation?: string | null; answers: Answers | null | undefined },
  sections: IcsaSection[],
): Issue[] {
  const issues: Issue[] = [];
  if (!String(doc.designation ?? '').trim()) {
    issues.push({ step: 'details', text: 'Enter your designation.' });
  }
  const { per } = scoreAnswers(doc.answers, sections);
  for (const { section: s, tally: c } of per) {
    if (c.un) {
      issues.push({
        step: s.key,
        text: `Section ${s.id} (${s.short}): ${c.un} unanswered question${c.un > 1 ? 's' : ''}.`,
      });
    }
    if (c.miss) {
      issues.push({
        step: s.key,
        text: `Section ${s.id} (${s.short}): ${c.miss} No/Partial response${c.miss > 1 ? 's' : ''} without remarks.`,
      });
    }
  }
  return issues;
}

/** Band used to colour a compliance figure: 90%+ strong, 70–89% watch, below 70% gap. */
export function complianceBand(rate: number | null): 'strong' | 'watch' | 'gap' | 'none' {
  if (rate === null) return 'none';
  if (rate >= 0.9) return 'strong';
  if (rate >= 0.7) return 'watch';
  return 'gap';
}

export function pct(x: number | null | undefined): string {
  return x === null || x === undefined ? '–' : `${Math.round(x * 100)}%`;
}

/* ─── Cycle progress ────────────────────────────────────────────────────────────────────── */

export interface Progress {
  /** Requests sent (anyone past `nominated`). */
  requested: number;
  /** Submitted or reviewed. */
  responded: number;
  /** responded ÷ requested, 0..1; 0 when nothing has been sent. */
  rate: number;
  thresholdPct: number;
  /** True when the response rate has reached the admin's threshold. */
  met: boolean;
  /** How many more responses the threshold needs; 0 once met. */
  shortBy: number;
}

export function progress(statuses: AssessmentStatus[], thresholdPct: number): Progress {
  const sent = statuses.filter((s) => s !== 'nominated');
  const responded = sent.filter((s) => RESPONDED_STATUSES.includes(s)).length;
  const requested = sent.length;
  const rate = requested ? responded / requested : 0;
  const needed = Math.ceil((thresholdPct / 100) * requested - 1e-9);
  const met = requested > 0 && responded >= needed;
  return {
    requested,
    responded,
    rate,
    thresholdPct,
    met,
    shortBy: met ? 0 : Math.max(0, needed - responded),
  };
}

/* ─── Dates ─────────────────────────────────────────────────────────────────────────────── */

/** Today in Dubai as yyyy-mm-dd. Deadlines are inclusive whole days in that zone. */
export function todayInDubai(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function isPastDeadline(deadline: string, now: Date = new Date()): boolean {
  return todayInDubai(now) > deadline.slice(0, 10);
}

/** Whole days from today (Dubai) to the deadline; negative once it has passed. */
export function daysLeft(deadline: string, now: Date = new Date()): number {
  const a = Date.parse(`${todayInDubai(now)}T00:00:00Z`);
  const b = Date.parse(`${deadline.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ─── Open-item ranking (dashboard) ─────────────────────────────────────────────────────── */

export interface GapRow {
  question: IcsaQuestion;
  sectionKey: IcsaSectionKey;
  no: number;
  partial: number;
  countries: string[];
}

/** Questions answered No or Partial most often across the given assessments. */
export function rankGaps(
  docs: { country: string; answers: Answers | null | undefined; sections: string[] }[],
): GapRow[] {
  const m = new Map<string, GapRow>();
  for (const d of docs) {
    for (const s of sectionsByKeys(d.sections)) {
      for (const q of s.questions) {
        const r = d.answers?.[answerKey(q.ref)]?.r;
        if (!isGap(r)) continue;
        const g = m.get(q.ref) ?? {
          question: q,
          sectionKey: s.key,
          no: 0,
          partial: 0,
          countries: [],
        };
        if (r === 'No') g.no += 1;
        else g.partial += 1;
        if (!g.countries.includes(d.country)) g.countries.push(d.country);
        m.set(q.ref, g);
      }
    }
  }
  return [...m.values()].sort(
    (a, b) =>
      b.no + b.partial - (a.no + a.partial) ||
      b.no - a.no ||
      a.question.ref.localeCompare(b.question.ref, undefined, { numeric: true }),
  );
}
