import { logger } from '@/lib/logger';
import {
  answerKey,
  isGap,
  questionText,
  sectionsByKeys,
  type Answers,
  type Catalog,
  type IcsaQuestion,
} from './model';

const log = logger('icsa-ai');

/**
 * ICSA's AI goes through an n8n workflow ("icsa ai"), the way the GRN tool reaches Claude: the
 * app builds the whole prompt here, n8n only runs it and returns the text. The URL defaults to
 * the mail webhook's with icsa-mail → icsa-ai, and the same X-Webhook-Secret guards both.
 *
 * Nothing here decides anything. A review and a suggestion are advice shown to a champion or an
 * admin, who writes the actual action plan.
 */

export class AiNotConfiguredError extends Error {
  constructor() {
    super('AI is not set up for ICSA yet (no N8N_ICSA_AI_WEBHOOK_URL or N8N_ICSA_WEBHOOK_URL).');
    this.name = 'AiNotConfiguredError';
  }
}

function unquote(v: string | undefined): string {
  const t = (v ?? '').trim();
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))
    ? t.slice(1, -1)
    : t;
}

export function aiWebhookUrl(): string | null {
  const own = unquote(process.env.N8N_ICSA_AI_WEBHOOK_URL);
  if (own) return own;
  const mail = unquote(process.env.N8N_ICSA_WEBHOOK_URL);
  return mail.includes('icsa-mail') ? mail.replace('icsa-mail', 'icsa-ai') : null;
}

export function aiConfigured(): boolean {
  return !!aiWebhookUrl();
}

export interface AiAnswer {
  text: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export async function askIcsaAi(req: {
  task: 'gap-review' | 'action-suggestions';
  system: string;
  prompt: string;
  maxTokens: number;
}): Promise<AiAnswer> {
  const url = aiWebhookUrl();
  if (!url) throw new AiNotConfiguredError();
  const secret = unquote(process.env.N8N_ICSA_WEBHOOK_SECRET);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { 'X-Webhook-Secret': secret } : {}),
      },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    log.warn('ai.unreachable', { task: req.task });
    throw new Error(
      err instanceof Error && err.name === 'TimeoutError'
        ? 'The AI took longer than 90 seconds. Try again.'
        : 'The AI workflow could not be reached.',
    );
  }
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    text?: string;
    model?: string;
    error?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  } | null;
  if (!res.ok || !body?.ok || typeof body.text !== 'string') {
    log.warn('ai.failed', { task: req.task, status: res.status, error: body?.error });
    throw new Error(
      `The AI could not answer (${body?.error || `${res.status} ${res.statusText}`}).`,
    );
  }
  log.info('ai.done', {
    task: req.task,
    model: body.model,
    in: body.usage?.input_tokens,
    out: body.usage?.output_tokens,
  });
  return {
    text: body.text,
    model: body.model ?? null,
    inputTokens: body.usage?.input_tokens ?? null,
    outputTokens: body.usage?.output_tokens ?? null,
  };
}

/** The first {...} object in the text, parsed. Claude is asked for bare JSON, but be lenient. */
export function extractJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The AI did not return JSON.');
  return JSON.parse(t.slice(start, end + 1));
}

/* ─── Gaps in one country ───────────────────────────────────────────────────────────────── */

export interface GapResponse {
  respondent: string;
  role: string | null;
  response: 'No' | 'Partial';
  remarks: string;
  /** What the respondent proposed under "Evidence & action plan", if anything. */
  proposedAction: string;
}

export interface CountryGap {
  ref: string;
  sectionKey: string;
  sectionTitle: string;
  question: string;
  no: number;
  partial: number;
  /** How many submitted forms covered this question. */
  askedOf: number;
  responses: GapResponse[];
}

/**
 * Every question answered No or Partial in the given (submitted) forms, worst first: most No,
 * then most gaps, then question order.
 */
export function countryGaps(
  country: string,
  docs: {
    respondentName: string | null;
    respondentEmail: string;
    jobTitle: string | null;
    sections: string[];
    answers: Answers | null | undefined;
  }[],
  catalog: Catalog,
): CountryGap[] {
  const byRef = new Map<string, CountryGap>();
  const order = new Map<string, number>();
  let i = 0;
  for (const s of catalog) for (const q of s.questions) order.set(q.ref, i++);

  for (const d of docs) {
    for (const s of sectionsByKeys(d.sections, catalog)) {
      for (const q of s.questions) {
        const g = byRef.get(q.ref) ?? newGap(q, s.key, s.title, country);
        g.askedOf += 1;
        byRef.set(q.ref, g);
        const a = d.answers?.[answerKey(q.ref)];
        if (!a || !isGap(a.r)) continue;
        if (a.r === 'No') g.no += 1;
        else g.partial += 1;
        g.responses.push({
          respondent: d.respondentName || d.respondentEmail,
          role: d.jobTitle,
          response: a.r as 'No' | 'Partial',
          remarks: String(a.m ?? '').trim(),
          proposedAction: String(a.ac ?? '').trim(),
        });
      }
    }
  }
  return [...byRef.values()]
    .filter((g) => g.no + g.partial > 0)
    .sort(
      (a, b) =>
        b.no - a.no ||
        b.no + b.partial - (a.no + a.partial) ||
        (order.get(a.ref) ?? 0) - (order.get(b.ref) ?? 0),
    );
}

function newGap(q: IcsaQuestion, sectionKey: string, sectionTitle: string, country: string) {
  return {
    ref: q.ref,
    sectionKey,
    sectionTitle,
    question: questionText(q, country),
    no: 0,
    partial: 0,
    askedOf: 0,
    responses: [],
  } satisfies CountryGap;
}

/* ─── Prompts ───────────────────────────────────────────────────────────────────────────── */

const SYSTEM = `You are an internal controls reviewer for NESR, an oilfield services company, helping run its Supply Chain Self-Assessment: an internal control self-assessment of the Supply Chain function. Respondents answered control questions Yes / No / Partial / N/A with remarks. You review the gaps (No and Partial) for one country.
Be specific and practical: refer to the question references (e.g. Q4.5), name the control weakness and the business risk (fraud, misstatement, loss, non-compliance, delay), and keep each point short. Do not invent facts that are not in the answers; when remarks are thin, say what evidence is missing.
Answer with ONE JSON object only, no markdown and no text around it.`;

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function gapBlock(g: CountryGap): string {
  const lines = g.responses.map(
    (r) =>
      `  - ${r.response} (${r.role || 'role not given'}): ${clip(r.remarks || 'no remarks', 400)}${
        r.proposedAction ? ` | proposed action: ${clip(r.proposedAction, 300)}` : ''
      }`,
  );
  return `${g.ref} [${g.sectionTitle}] ${g.question}\n  ${g.no} No, ${g.partial} Partial out of ${g.askedOf} answering\n${lines.join('\n')}`;
}

export function gapReviewPrompt(input: {
  country: string;
  cycleLabel: string;
  forms: number;
  compliance: number | null;
  gaps: CountryGap[];
}): { system: string; prompt: string } {
  const top = input.gaps.slice(0, 40);
  const prompt = `Country: ${input.country}
Cycle: ${input.cycleLabel}
Submitted forms: ${input.forms}
Overall compliance (Yes ÷ (Yes + No + Partial)): ${
    input.compliance === null ? 'n/a' : `${Math.round(input.compliance * 100)}%`
  }
Gaps (${input.gaps.length} questions answered No or Partial${
    input.gaps.length > top.length ? `; the ${top.length} worst are listed` : ''
  }):

${top.map(gapBlock).join('\n\n')}

Return JSON exactly in this shape:
{
  "summary": "3 to 5 sentences: the overall state of supply chain controls in this country and what matters most",
  "rating": "strong" | "adequate" | "weak",
  "themes": [ { "title": "short theme name", "detail": "1 to 2 sentences, citing question refs" } ],
  "gaps": [ { "ref": "Q4.5", "severity": "high" | "medium" | "low", "finding": "what is wrong, in one sentence", "risk": "the business risk, in one sentence" } ]
}
List every gap above in "gaps", most severe first. 2 to 5 themes.`;
  return { system: SYSTEM, prompt };
}

export function actionSuggestionPrompt(input: {
  country: string;
  gap: CountryGap;
  finding?: string | null;
}): { system: string; prompt: string } {
  const prompt = `Country: ${input.country}
One control gap to close:

${gapBlock(input.gap)}${input.finding ? `\n\nReviewer's finding: ${input.finding}` : ''}

Suggest 3 different action plans the country's supply chain team could take to close this gap. Each should be concrete (who does what, in which system or document), achievable within 90 days, and leave evidence an auditor could check.
Return JSON exactly in this shape:
{ "suggestions": [ { "action": "the action, 1 to 2 sentences", "owner": "the role that should own it, e.g. Warehouse Supervisor", "dueInDays": 30, "evidence": "what will prove it is done", "why": "one sentence on how it closes the gap" } ] }`;
  return {
    system: SYSTEM.replace(/You review the gaps.*country\./, 'You help close the gaps.'),
    prompt,
  };
}

/* ─── Checking what came back ───────────────────────────────────────────────────────────── */

export type ReviewRating = 'strong' | 'adequate' | 'weak';
export type Severity = 'high' | 'medium' | 'low';

export interface GapReview {
  summary: string;
  rating: ReviewRating;
  themes: { title: string; detail: string }[];
  gaps: { ref: string; severity: Severity; finding: string; risk: string }[];
}

export interface ActionSuggestion {
  action: string;
  owner: string;
  dueInDays: number;
  evidence: string;
  why: string;
}

const str = (v: unknown, max: number) => clip(String(v ?? '').trim(), max);

/** Keep only well-formed parts, so a sloppy answer cannot break the page. */
export function normalizeReview(raw: unknown, knownRefs: string[]): GapReview {
  const o = (raw ?? {}) as Record<string, unknown>;
  const rating = ['strong', 'adequate', 'weak'].includes(String(o.rating))
    ? (o.rating as ReviewRating)
    : 'adequate';
  const themes = (Array.isArray(o.themes) ? o.themes : [])
    .map((t) => ({ title: str(t?.title, 120), detail: str(t?.detail, 600) }))
    .filter((t) => t.title)
    .slice(0, 8);
  const refs = new Set(knownRefs.map((r) => r.toUpperCase()));
  const seen = new Set<string>();
  const gaps = (Array.isArray(o.gaps) ? o.gaps : [])
    .map((g) => ({
      ref: str(g?.ref, 12).toUpperCase(),
      severity: (['high', 'medium', 'low'].includes(String(g?.severity))
        ? g.severity
        : 'medium') as Severity,
      finding: str(g?.finding, 400),
      risk: str(g?.risk, 400),
    }))
    .filter((g) => refs.has(g.ref) && g.finding && !seen.has(g.ref) && seen.add(g.ref));
  const summary = str(o.summary, 2000);
  if (!summary) throw new Error('The AI review came back empty.');
  return { summary, rating, themes, gaps };
}

export function normalizeSuggestions(raw: unknown): ActionSuggestion[] {
  const o = (raw ?? {}) as Record<string, unknown>;
  const list = (Array.isArray(o.suggestions) ? o.suggestions : [])
    .map((s) => ({
      action: str(s?.action, 600),
      owner: str(s?.owner, 120),
      dueInDays: Math.min(365, Math.max(1, Math.round(Number(s?.dueInDays) || 30))),
      evidence: str(s?.evidence, 400),
      why: str(s?.why, 400),
    }))
    .filter((s) => s.action)
    .slice(0, 5);
  if (!list.length) throw new Error('The AI did not suggest anything usable.');
  return list;
}
