'use server';

import { logger } from '@/lib/logger';
import { requireSoaActor, requireSoaCountry } from '@/lib/soa/access';
import {
  PLACEHOLDERS,
  highlightPlaceholders,
  sanitizeTemplateHtml,
  unknownTokens,
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

/** The letter for a country, shown with its placeholders marked rather than filled. */
export async function getSoaTemplate(countryId: string): Promise<SoaResult<TemplateView>> {
  try {
    await requireSoaCountry(countryId, 'champion');
    const [stored, ctx] = await Promise.all([loadTemplate(countryId), letterContext(countryId)]);
    return {
      success: true,
      data: {
        ...stored,
        previewHtml: highlightPlaceholders(stored.bodyHtml),
        previewSubject: stored.subject,
        unknown: [...unknownTokens(stored.bodyHtml), ...unknownTokens(stored.subject)],
        apEmailMissing: !ctx.apEmails.length,
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
    await requireSoaCountry(input.countryId, 'champion');
    const clean = sanitizeTemplateHtml(input.bodyHtml);
    return {
      success: true,
      data: {
        subject: input.subject,
        html: highlightPlaceholders(clean),
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
