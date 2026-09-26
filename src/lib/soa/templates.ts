import type { QueryResultRow } from 'pg';
import { ensureSoaSchema, sql } from './db';
import { DEFAULT_BODY_HTML, DEFAULT_SUBJECT, sanitizeTemplateHtml } from './email-template';

/**
 * Storage for the outreach letter.
 *
 * A plain module, not `'use server'` — see the note in `./db`.
 *
 * Two levels: one row with a NULL country is the global default, and a row per country overrides
 * it. A country with no row of its own inherits, so a wording change made once in /admin reaches
 * every country that has not deliberately diverged. Resetting a country deletes its row rather
 * than copying the default back into it, which keeps that inheritance alive.
 */

export interface StoredTemplate {
  subject: string;
  bodyHtml: string;
  /** Where the text being shown actually came from. */
  source: 'country' | 'global' | 'builtin';
  updatedAt: string | null;
  updatedBy: string | null;
}

const BUILTIN: StoredTemplate = {
  subject: DEFAULT_SUBJECT,
  bodyHtml: DEFAULT_BODY_HTML,
  source: 'builtin',
  updatedAt: null,
  updatedBy: null,
};

function toTemplate(row: QueryResultRow, source: 'country' | 'global'): StoredTemplate {
  return {
    subject: String(row.subject),
    bodyHtml: String(row.body_html),
    source,
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : null,
    updatedBy: (row.updated_by as string | null) ?? null,
  };
}

/**
 * The letter a country will actually send: its own if it has one, otherwise the global default,
 * otherwise the approved text compiled into the build.
 *
 * The built-in fallback means a fresh database still sends the right letter rather than an empty
 * one — the seed is code, not a migration, so correcting the wording ships with a deploy.
 */
export async function loadTemplate(countryId: string | null): Promise<StoredTemplate> {
  await ensureSoaSchema();

  if (countryId) {
    const own = await sql<QueryResultRow[]>(
      `SELECT subject, body_html, updated_at, updated_by FROM soa_email_templates WHERE country_id = ?`,
      [countryId],
    );
    if (own.length) return toTemplate(own[0], 'country');
  }

  const global = await sql<QueryResultRow[]>(
    `SELECT subject, body_html, updated_at, updated_by FROM soa_email_templates WHERE country_id IS NULL`,
  );
  return global.length ? toTemplate(global[0], 'global') : BUILTIN;
}

/** Save a country's letter, or the global default when `countryId` is null. */
export async function saveTemplate(input: {
  countryId: string | null;
  subject: string;
  bodyHtml: string;
  actor: string;
}): Promise<void> {
  await ensureSoaSchema();
  const subject = input.subject.trim();
  const bodyHtml = sanitizeTemplateHtml(input.bodyHtml);

  // The unique index is over COALESCE(country_id, '*'), which ON CONFLICT cannot name, so the
  // upsert is spelled out. Both halves are single statements against one row.
  const updated = await sql<QueryResultRow[]>(
    `UPDATE soa_email_templates
        SET subject = ?, body_html = ?, updated_at = NOW(), updated_by = ?
      WHERE COALESCE(country_id, '*') = COALESCE(?::TEXT, '*')
      RETURNING id`,
    [subject, bodyHtml, input.actor, input.countryId],
  );
  if (updated.length) return;

  await sql(
    `INSERT INTO soa_email_templates (country_id, subject, body_html, updated_by)
     VALUES (?, ?, ?, ?)`,
    [input.countryId, subject, bodyHtml, input.actor],
  );
}

/** Drop a country's own wording so it inherits the global default again. */
export async function resetTemplate(countryId: string): Promise<void> {
  await ensureSoaSchema();
  await sql(`DELETE FROM soa_email_templates WHERE country_id = ?`, [countryId]);
}

/** The country- and cycle-level values the letter needs; the per-vendor and sender bits are added
 *  by the caller, which is the only part that differs between previewing and sending. */
export interface LetterContext {
  countryName: string;
  cycleLabel: string;
  statementPeriodEnd: string;
  replyBy: string;
  apEmail: string;
  championName: string;
}

function formatDay(value: unknown): string {
  if (!value) return '';
  const d = new Date(value as string);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Resolved once per country rather than once per vendor: sending a country's batch renders the
 * same dates and the same AP mailbox 61 times, and only the vendor's name changes between them.
 */
export async function letterContext(countryId: string): Promise<LetterContext> {
  await ensureSoaSchema();
  const rows = await sql<QueryResultRow[]>(
    `SELECT co.name AS country_name, co.ap_email, cy.label AS cycle_label,
            cy.period_end, cy.submission_deadline,
            (SELECT cu.name FROM country_users cu
              WHERE cu.country_id = co.id AND cu.role = 'champion' ORDER BY cu.name LIMIT 1) AS champion
       FROM countries co JOIN cycles cy ON cy.is_active
      WHERE co.id = ?`,
    [countryId],
  );
  const r = rows[0] ?? {};
  return {
    countryName: (r.country_name as string) ?? countryId,
    cycleLabel: (r.cycle_label as string) ?? '',
    statementPeriodEnd: formatDay(r.period_end),
    replyBy: formatDay(r.submission_deadline),
    apEmail: (r.ap_email as string) ?? '',
    championName: (r.champion as string) ?? '',
  };
}
