'use server';

import type { QueryResultRow } from 'pg';
import { getEmployeeDirectoryDefaults } from '@/app/actions/employeeDirectory';
import { logger } from '@/lib/logger';
import { requireSoaActor, requireSoaCountry } from '@/lib/soa/access';
import { sql } from '@/lib/soa/db';
import {
  PLACEHOLDERS,
  renderTemplate,
  sanitizeTemplateHtml,
  unknownTokens,
  type TemplateVars,
} from '@/lib/soa/email-template';
import {
  letterContext,
  loadTemplate,
  resetTemplate,
  saveTemplate,
  type StoredTemplate,
} from '@/lib/soa/templates';

/**
 * Endpoints for the outreach letter.
 *
 * Every export here is a public POST endpoint, so each one starts with its own guard rather than
 * relying on the screen that calls it. Editing a country's letter is a champion act; editing the
 * global default every country inherits is an admin one.
 */

const log = logger('soa-templates');

export type SoaResult<T = undefined> = { success: boolean; error?: string; data?: T };

function fail(where: string, err: unknown): SoaResult<never> {
  const message = err instanceof Error ? err.message : 'Something went wrong.';
  log.error(`${where}.failed`, err);
  return { success: false, error: message };
}

export interface TemplateView extends StoredTemplate {
  /** Rendered with real values for the largest vendor in the country, so the preview is honest. */
  previewHtml: string;
  previewSubject: string;
  /** Tokens in the text that nothing can fill. */
  unknown: string[];
  /** Blocks sending: the letter tells the vendor where to reply. */
  apEmailMissing: boolean;
  placeholders: typeof PLACEHOLDERS;
}

/**
 * Everything the letter needs, resolved for one country.
 *
 * The preview uses the country's largest vendor rather than invented text: a champion approving a
 * letter should be looking at the letter that will actually go out, and a placeholder that fails
 * to resolve is only obvious when the rest of it is real.
 */
async function varsFor(
  countryId: string,
  actor: { email: string; name: string },
): Promise<TemplateVars> {
  const [ctx, top, directory] = await Promise.all([
    letterContext(countryId),
    sql<QueryResultRow[]>(
      `SELECT v.name, v.vendor_no
         FROM country_cycles cc
         JOIN cycles cy ON cy.id = cc.cycle_id AND cy.is_active
         JOIN vendor_cycle_entries e ON e.country_cycle_id = cc.id
         JOIN vendors v ON v.id = e.vendor_id
        WHERE cc.country_id = ?
        ORDER BY e.open_po_amount DESC NULLS LAST LIMIT 1`,
      [countryId],
    ),
    getEmployeeDirectoryDefaults(actor.email).catch(() => null),
  ]);

  return {
    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    vendorName: (top[0]?.name as string) ?? 'the vendor',
    vendorNo: (top[0]?.vendor_no as string) ?? '',
    countryName: ctx.countryName,
    cycleLabel: ctx.cycleLabel,
    statementPeriodEnd: ctx.statementPeriodEnd,
    replyBy: ctx.replyBy,
    apEmail: ctx.apEmail,
    championName: ctx.championName || actor.name,
    senderName: actor.name,
    senderTitle: directory?.position ?? '',
    // The directory carries no phone number; a champion who wants one types it into the letter.
    senderMobile: '',
    senderEmail: actor.email,
  };
}

/** The letter for a country, with a preview rendered against its largest vendor. */
export async function getSoaTemplate(countryId: string): Promise<SoaResult<TemplateView>> {
  try {
    const actor = await requireSoaCountry(countryId, 'champion');
    const stored = await loadTemplate(countryId);
    const vars = await varsFor(countryId, actor);
    return {
      success: true,
      data: {
        ...stored,
        previewHtml: renderTemplate(stored.bodyHtml, vars),
        previewSubject: renderTemplate(stored.subject, vars),
        unknown: [...unknownTokens(stored.bodyHtml), ...unknownTokens(stored.subject)],
        apEmailMissing: !vars.apEmail,
        placeholders: PLACEHOLDERS,
      },
    };
  } catch (err) {
    return fail('getSoaTemplate', err);
  }
}

/** Render arbitrary draft text without saving it — what the editor's live preview calls. */
export async function previewSoaTemplate(input: {
  countryId: string;
  subject: string;
  bodyHtml: string;
}): Promise<SoaResult<{ subject: string; html: string; unknown: string[] }>> {
  try {
    const actor = await requireSoaCountry(input.countryId, 'champion');
    const vars = await varsFor(input.countryId, actor);
    const clean = sanitizeTemplateHtml(input.bodyHtml);
    return {
      success: true,
      data: {
        subject: renderTemplate(input.subject, vars),
        html: renderTemplate(clean, vars),
        unknown: [...unknownTokens(input.bodyHtml), ...unknownTokens(input.subject)],
      },
    };
  } catch (err) {
    return fail('previewSoaTemplate', err);
  }
}

/** Save a country's letter. */
export async function saveSoaTemplate(input: {
  countryId: string;
  subject: string;
  bodyHtml: string;
}): Promise<SoaResult> {
  try {
    const actor = await requireSoaCountry(input.countryId, 'champion');
    if (!input.subject.trim()) return { success: false, error: 'The subject cannot be empty.' };
    const clean = sanitizeTemplateHtml(input.bodyHtml);
    if (!clean) return { success: false, error: 'The letter cannot be empty.' };

    await saveTemplate({
      countryId: input.countryId,
      subject: input.subject,
      bodyHtml: clean,
      actor: actor.email,
    });
    log.info('template.saved', { countryId: input.countryId, by: actor.email });
    return { success: true };
  } catch (err) {
    return fail('saveSoaTemplate', err);
  }
}

/** Drop a country's own wording so it inherits the global default again. */
export async function resetSoaTemplate(countryId: string): Promise<SoaResult> {
  try {
    const actor = await requireSoaCountry(countryId, 'champion');
    await resetTemplate(countryId);
    log.info('template.reset', { countryId, by: actor.email });
    return { success: true };
  } catch (err) {
    return fail('resetSoaTemplate', err);
  }
}

/** The global default, editable only by an administrator. */
export async function saveSoaDefaultTemplate(input: {
  subject: string;
  bodyHtml: string;
}): Promise<SoaResult> {
  try {
    const actor = await requireSoaActor('admin');
    const clean = sanitizeTemplateHtml(input.bodyHtml);
    if (!input.subject.trim() || !clean)
      return { success: false, error: 'The subject and letter are both required.' };

    await saveTemplate({
      countryId: null,
      subject: input.subject,
      bodyHtml: clean,
      actor: actor.email,
    });
    log.info('template.defaultSaved', { by: actor.email });
    return { success: true };
  } catch (err) {
    return fail('saveSoaDefaultTemplate', err);
  }
}
