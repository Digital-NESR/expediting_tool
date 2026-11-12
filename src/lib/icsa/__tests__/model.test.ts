import { describe, expect, it } from 'vitest';
import {
  ICSA_SECTIONS,
  answerKey,
  complianceBand,
  daysLeft,
  directoryCountriesFor,
  isPastDeadline,
  progress,
  rankGaps,
  scoreAnswers,
  sectionsByKeys,
  submissionIssues,
  type Answers,
} from '../model';

describe('question bank', () => {
  it('carries the artifact over whole: seven sections, a hundred questions, unique refs', () => {
    expect(ICSA_SECTIONS).toHaveLength(7);
    const refs = ICSA_SECTIONS.flatMap((s) => s.questions.map((q) => q.ref));
    expect(refs).toHaveLength(100);
    expect(new Set(refs).size).toBe(100);
    expect(new Set(refs.map(answerKey)).size).toBe(100);
  });
});

describe('scoreAnswers', () => {
  const grn = sectionsByKeys(['grn']);
  const [q1, q2, q3, q4] = grn[0].questions;

  it('counts compliance as Yes over Yes+No+Partial, leaving N/A and blanks out', () => {
    const answers: Answers = {
      [answerKey(q1.ref)]: { r: 'Yes' },
      [answerKey(q2.ref)]: { r: 'No', m: 'no 3-way match' },
      [answerKey(q3.ref)]: { r: 'Partial' },
      [answerKey(q4.ref)]: { r: 'N/A', m: 'no warehouse' },
    };
    const { total } = scoreAnswers(answers, grn);
    expect(total.n).toBe(grn[0].questions.length);
    expect(total.done).toBe(4);
    expect(total.rate).toBeCloseTo(1 / 3);
    expect(total.open).toBe(2);
    expect(total.miss).toBe(1); // the Partial has no remarks
  });

  it('only scores the sections the respondent was assigned', () => {
    const answers: Answers = { [answerKey('Q1.1')]: { r: 'No' } };
    expect(scoreAnswers(answers, grn).total.No).toBe(0);
  });

  it('has no compliance figure when nothing scoreable is answered', () => {
    expect(scoreAnswers({}, grn).total.rate).toBeNull();
  });
});

describe('submissionIssues', () => {
  it('blocks on designation, unanswered questions and gaps without remarks', () => {
    const s = sectionsByKeys(['policy']);
    const answers: Answers = Object.fromEntries(
      s[0].questions.map((q) => [answerKey(q.ref), { r: 'Yes' as const }]),
    );
    expect(submissionIssues({ designation: 'Buyer', answers }, s)).toEqual([]);

    answers[answerKey(s[0].questions[0].ref)] = { r: 'No' };
    delete answers[answerKey(s[0].questions[1].ref)];
    const issues = submissionIssues({ designation: '', answers }, s);
    expect(issues.map((i) => i.step)).toEqual(['details', 'policy', 'policy']);
  });
});

describe('progress against the threshold', () => {
  it('ignores people the champion has not sent the request to yet', () => {
    const p = progress(['nominated', 'submitted', 'requested'], 50);
    expect(p.requested).toBe(2);
    expect(p.responded).toBe(1);
    expect(p.met).toBe(true);
  });

  it('needs the ceiling of the threshold, so 70% of 3 is 3 responses', () => {
    const p = progress(['submitted', 'reviewed', 'in_progress'], 70);
    expect(p.met).toBe(false);
    expect(p.shortBy).toBe(1);
  });

  it('70% of 10 is exactly 7', () => {
    const statuses = [...Array(7).fill('submitted'), ...Array(3).fill('requested')] as Parameters<
      typeof progress
    >[0];
    expect(progress(statuses, 70).met).toBe(true);
  });

  it('is never met with nobody asked', () => {
    expect(progress([], 70).met).toBe(false);
  });
});

describe('deadlines are whole days in Dubai', () => {
  // 21:30 UTC on 1 Mar is already 2 Mar in Dubai (UTC+4).
  const lateEvening = new Date('2026-03-01T21:30:00Z');

  it('a deadline of the 1st has passed once Dubai reaches the 2nd', () => {
    expect(isPastDeadline('2026-03-01', lateEvening)).toBe(true);
    expect(isPastDeadline('2026-03-02', lateEvening)).toBe(false);
  });

  it('counts days left from the Dubai date', () => {
    expect(daysLeft('2026-03-02', lateEvening)).toBe(0);
    expect(daysLeft('2026-03-05', lateEvening)).toBe(3);
  });
});

describe('helpers', () => {
  it('bands compliance', () => {
    expect(complianceBand(0.95)).toBe('strong');
    expect(complianceBand(0.7)).toBe('watch');
    expect(complianceBand(0.69)).toBe('gap');
    expect(complianceBand(null)).toBe('none');
  });

  it('expands a country to every directory spelling of it', () => {
    expect(directoryCountriesFor('HQ Dubai')).toContain('UAE-Dubai');
    expect(directoryCountriesFor('Oman')).toEqual(['Oman']);
  });

  it('ranks the most common gaps first and lists each country once', () => {
    const doc = (country: string, r: 'No' | 'Partial') => ({
      country,
      sections: ['policy'],
      answers: { [answerKey('Q1.1')]: { r }, [answerKey('Q1.2')]: { r: 'Yes' as const } },
    });
    const ranked = rankGaps([doc('Oman', 'No'), doc('Oman', 'Partial'), doc('Kuwait', 'No')]);
    expect(ranked[0].question.ref).toBe('Q1.1');
    expect(ranked[0]).toMatchObject({ no: 2, partial: 1, countries: ['Oman', 'Kuwait'] });
  });
});
