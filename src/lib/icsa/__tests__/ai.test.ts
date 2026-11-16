import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  actionSuggestionPrompt,
  aiWebhookUrl,
  countryGaps,
  extractJson,
  gapReviewPrompt,
  normalizeReview,
  normalizeSuggestions,
} from '../ai';

afterEach(() => vi.unstubAllEnvs());

const docs: Parameters<typeof countryGaps>[1] = [
  {
    respondentName: 'Ahmed',
    respondentEmail: 'a@x.com',
    jobTitle: 'Storekeeper',
    sections: ['grn'],
    answers: {
      q5_1: { r: 'No' as const, m: 'No GRN check', ac: 'Introduce checklist' },
      q5_2: { r: 'Partial' as const, m: 'Sometimes' },
      q5_3: { r: 'Yes' as const },
    },
  },
  {
    respondentName: null,
    respondentEmail: 'n@x.com',
    jobTitle: null,
    sections: ['grn'],
    answers: { q5_2: { r: 'No' as const, m: 'Never done' } },
  },
];

describe('countryGaps', () => {
  it('collects No and Partial answers per question, worst first', () => {
    const gaps = countryGaps('Kuwait', docs);
    /* Both have one No; Q5.2 also has a Partial, so it is worse. */
    expect(gaps.map((g) => g.ref)).toEqual(['Q5.2', 'Q5.1']);
    const q52 = gaps.find((g) => g.ref === 'Q5.2')!;
    expect(q52.no).toBe(1);
    expect(q52.partial).toBe(1);
    expect(q52.askedOf).toBe(2);
    expect(q52.responses.map((r) => r.respondent)).toEqual(['Ahmed', 'n@x.com']);
    const q51 = gaps.find((g) => g.ref === 'Q5.1')!;
    expect(q51.responses[0].proposedAction).toBe('Introduce checklist');
  });

  it('ignores Yes and unanswered questions', () => {
    expect(countryGaps('Kuwait', docs).some((g) => g.ref === 'Q5.3')).toBe(false);
  });
});

describe('prompts', () => {
  it('the review prompt names the country and every gap', () => {
    const gaps = countryGaps('Kuwait', docs);
    const { prompt, system } = gapReviewPrompt({
      country: 'Kuwait',
      cycleLabel: 'Q1 2027',
      forms: 2,
      compliance: 0.5,
      gaps,
    });
    expect(system).toMatch(/JSON/);
    expect(prompt).toContain('Country: Kuwait');
    expect(prompt).toContain('50%');
    for (const g of gaps) expect(prompt).toContain(g.ref);
    expect(prompt).toContain('proposed action: Introduce checklist');
  });

  it('the suggestion prompt carries the reviewer finding when there is one', () => {
    const gap = countryGaps('Kuwait', docs)[0];
    const { prompt } = actionSuggestionPrompt({
      country: 'Kuwait',
      gap,
      finding: 'No 3-way match',
    });
    expect(prompt).toContain(gap.ref);
    expect(prompt).toContain("Reviewer's finding: No 3-way match");
  });
});

describe('reading the AI answer', () => {
  it('finds the JSON inside a fenced answer', () => {
    expect(extractJson('Here:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(() => extractJson('no json here')).toThrow(/did not return JSON/);
  });

  it('keeps only known question refs and valid values in a review', () => {
    const r = normalizeReview(
      {
        summary: 'Weak receiving controls.',
        rating: 'terrible',
        themes: [{ title: 'Receiving', detail: 'Q5.1 and Q5.2' }, { detail: 'no title' }],
        gaps: [
          { ref: 'q5.1', severity: 'high', finding: 'No check', risk: 'Loss' },
          { ref: 'Q9.9', severity: 'high', finding: 'Invented', risk: '' },
          { ref: 'Q5.1', severity: 'low', finding: 'Duplicate', risk: '' },
          { ref: 'Q5.2', severity: 'urgent', finding: 'Partial', risk: 'Delay' },
        ],
      },
      ['Q5.1', 'Q5.2'],
    );
    expect(r.rating).toBe('adequate');
    expect(r.themes).toHaveLength(1);
    expect(r.gaps.map((g) => [g.ref, g.severity])).toEqual([
      ['Q5.1', 'high'],
      ['Q5.2', 'medium'],
    ]);
  });

  it('refuses an empty review', () => {
    expect(() => normalizeReview({ rating: 'weak' }, [])).toThrow(/empty/);
  });

  it('cleans suggestions and bounds the due date', () => {
    const s = normalizeSuggestions({
      suggestions: [
        { action: 'Do a weekly count', owner: 'Supervisor', dueInDays: 900 },
        { action: '', owner: 'x' },
        { action: 'Train staff', dueInDays: 'soon' },
      ],
    });
    expect(s).toHaveLength(2);
    expect(s[0].dueInDays).toBe(365);
    expect(s[1].dueInDays).toBe(30);
  });
});

describe('aiWebhookUrl', () => {
  it('uses its own setting first, else the mail webhook renamed', () => {
    vi.stubEnv('N8N_ICSA_AI_WEBHOOK_URL', '');
    vi.stubEnv('N8N_ICSA_WEBHOOK_URL', 'https://n8n.nesr.com/webhook/icsa-mail');
    expect(aiWebhookUrl()).toBe('https://n8n.nesr.com/webhook/icsa-ai');
    vi.stubEnv('N8N_ICSA_AI_WEBHOOK_URL', '"https://n8n.example/webhook/other"');
    expect(aiWebhookUrl()).toBe('https://n8n.example/webhook/other');
    vi.stubEnv('N8N_ICSA_AI_WEBHOOK_URL', '');
    vi.stubEnv('N8N_ICSA_WEBHOOK_URL', '');
    expect(aiWebhookUrl()).toBeNull();
  });
});
