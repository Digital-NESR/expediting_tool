import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COUNTRY_STATUS_OPTIONS,
  effectiveCycleDeadline,
  effectiveSubmissionDeadline,
  isCountryStatus,
} from '@/lib/soa/deadlines';

/**
 * Per-country deadlines.
 *
 * The collection deadline is printed in the letter every supplier receives, shown on the upload
 * page that letter links to, counted down on the country's dashboard, and used to decide whether
 * a champion below the coverage target may hand off. Four of those read it from four different
 * queries. If one of them reads `cycles.submission_deadline` while the rest resolve an override,
 * a supplier is told one date and shown another on the page that date links to — and nobody
 * reports it, because each screen looks right on its own.
 *
 * So the second block here reads the source. It is the same guard the exclusions have, for the
 * same reason: the risk is not that the resolution is wrong, it is that a query skips it.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('the deadline fragments', () => {
  it('prefers the country"s own date and falls back to the cycle"s', () => {
    const sql = effectiveSubmissionDeadline('cy', 'cc.country_id');
    expect(sql).toContain('COALESCE');
    expect(sql).toContain('country_cycle_deadlines');
    expect(sql).toContain('ccd.country_id = cc.country_id');
    /* The fallback, and the reason this is a COALESCE over a subquery rather than a join: a
       country with no override row at all still has to get the cycle's date. */
    expect(sql).toContain('cy.submission_deadline');
  });

  it('resolves the closing date the same way, from its own column', () => {
    const sql = effectiveCycleDeadline('cy', 'cc.country_id');
    expect(sql).toContain('ccd.cycle_deadline');
    expect(sql).toContain('cy.cycle_deadline');
    expect(sql).not.toContain('submission_deadline');
  });

  it('takes a cycle id expression when the alias is not the cycles row', () => {
    /* The rollup joins `cycles` for this alone, and the evidence pack passes a placeholder. */
    expect(effectiveSubmissionDeadline('cy', 'p.country_id', '$1')).toContain('ccd.cycle_id = $1');
  });

  it('defaults the cycle id to the alias"s own', () => {
    expect(effectiveSubmissionDeadline('cy', 'c.id')).toContain('ccd.cycle_id = cy.id');
  });
});

describe('every reader of a deadline', () => {
  /* The files that put a deadline in front of somebody. Each one must resolve the country's
     override rather than read the cycle's column directly. */
  const FILES = [
    'src/lib/soa/read.ts',
    'src/lib/soa/templates.ts',
    'src/lib/soa/upload-access.ts',
    'src/app/actions/soa/workflow.ts',
    'src/app/api/soa/evidence-pack/[country]/route.ts',
  ];

  it.each(FILES)('%s resolves the country"s deadline rather than reading the cycle"s', (file) => {
    /* Scanning SOURCE, where the resolver appears only as `${effectiveSubmissionDeadline(...)}`
       — its COALESCE is built at runtime and is not in the file. So interpolations are stripped
       first, and anything left mentioning a cycle's deadline column is literal SQL this file
       wrote by hand. A GROUP BY may legitimately name the column; a SELECT may not. */
    const src = read(file);
    expect(src, `${file} does not use the resolver`).toMatch(/effective(Submission|Cycle)Deadline/);

    const literalSql = src.replace(/\$\{[^}]*\}/g, '«resolved»');
    const selected =
      literalSql.match(/\n\s+(cy|c|cycles)\.(submission|cycle)_deadline\s*(,|\n)/g) ?? [];
    expect(
      selected,
      `${file} selects a cycle deadline without resolving it:${selected.join('')}`,
    ).toHaveLength(0);

    const aliased =
      literalSql.match(/(cy|c|cycles)\.(submission|cycle)_deadline\s+AS\s+\w*deadline/gi) ?? [];
    expect(
      aliased,
      `${file} aliases a raw cycle deadline as the country's: ${aliased.join(', ')}`,
    ).toHaveLength(0);
  });
});

describe('the statuses an administrator may set', () => {
  /* Exactly the `country_cycle_status` enum, checked against the tool's own CountryStatus
     union by the type system. A seventh option here would be accepted by the action and then
     rejected by Postgres, which is a 500 rather than a message. */
  it('is the six a country can be in', () => {
    expect(COUNTRY_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      'not_started',
      'in_progress',
      'requests_sent',
      'reminders_sent',
      'consolidating',
      'handed_off',
    ]);
  });

  it('gives every option a label and an explanation', () => {
    for (const o of COUNTRY_STATUS_OPTIONS) {
      expect(o.label.length, `${o.value} has no label`).toBeGreaterThan(0);
      expect(o.hint.length, `${o.value} has no hint`).toBeGreaterThan(10);
    }
  });

  it('refuses a per-vendor status that shares the underlying enum family', () => {
    /* `nil_balance` and `non_responder` are vendor statuses. A country set to one would render
       as a blank badge nobody could explain. */
    expect(isCountryStatus('nil_balance')).toBe(false);
    expect(isCountryStatus('non_responder')).toBe(false);
    expect(isCountryStatus('received')).toBe(false);
    expect(isCountryStatus('')).toBe(false);
    expect(isCountryStatus('handed_off')).toBe(true);
  });
});
