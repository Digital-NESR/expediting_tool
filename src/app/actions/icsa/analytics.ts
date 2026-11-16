'use server';

import type { QueryResultRow } from 'pg';
import { revalidatePath } from 'next/cache';
import { AccessError } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { exec, sql } from '@/lib/icsa/db';
import { requireIcsaActor } from '@/lib/icsa/access';
import { logEvent } from '@/lib/icsa/lifecycle';
import { countrySnapshot } from '@/lib/icsa/analytics';
import {
  AiNotConfiguredError,
  actionSuggestionPrompt,
  askIcsaAi,
  extractJson,
  gapReviewPrompt,
  normalizeReview,
  normalizeSuggestions,
  type ActionSuggestion,
  type GapReview,
} from '@/lib/icsa/ai';
import { todayInDubai } from '@/lib/icsa/model';
import type { IcsaResult } from './cycles';

const log = logger('icsa-analytics');

function fail(err: unknown, fallback: string, event: string): IcsaResult<never> {
  if (err instanceof AccessError || err instanceof AiNotConfiguredError)
    return { success: false, error: err.message };
  if (err instanceof Error && /^The AI/.test(err.message))
    return { success: false, error: err.message };
  log.error(event, err);
  return { success: false, error: fallback };
}

/** The country, if the actor is its champion or an admin. */
async function loadCountry(enrollmentId: number) {
  const actor = await requireIcsaActor();
  const found = await countrySnapshot(actor, enrollmentId);
  if (!found) throw new AccessError('You do not manage that country.', 403);
  return { actor, ...found };
}

/**
 * Ask the AI to review every gap in one country's submitted forms. The review is saved, so the
 * page shows it until someone asks again (after more forms come in, say).
 */
export async function generateIcsaGapReview(
  enrollmentId: number,
): Promise<IcsaResult<{ review: GapReview }>> {
  try {
    const { actor, cycle, snap } = await loadCountry(enrollmentId);
    if (!snap.forms) return { success: false, error: 'No submitted forms to review yet.' };
    if (!snap.gaps.length) {
      return {
        success: false,
        error: 'Every submitted answer is Yes or N/A, so there are no gaps to review.',
      };
    }
    const { system, prompt } = gapReviewPrompt({
      country: snap.enrollment.country,
      cycleLabel: cycle.label,
      forms: snap.forms,
      compliance: snap.compliance,
      gaps: snap.gaps,
    });
    const answer = await askIcsaAi({ task: 'gap-review', system, prompt, maxTokens: 4000 });
    const review = normalizeReview(
      extractJson(answer.text),
      snap.gaps.map((g) => g.ref),
    );
    await exec(
      `INSERT INTO icsa_ai_reviews
         (enrollment_id, review, responses_count, model, input_tokens, output_tokens, created_by)
       VALUES (?, ?::jsonb, ?, ?, ?, ?, ?)`,
      [
        enrollmentId,
        JSON.stringify(review),
        snap.forms,
        answer.model,
        answer.inputTokens,
        answer.outputTokens,
        actor.email,
      ],
    );
    await logEvent(sql, {
      actor: actor.email,
      action: 'ai.review',
      cycleId: cycle.id,
      enrollmentId,
      detail: { forms: snap.forms, gaps: snap.gaps.length, rating: review.rating },
    });
    revalidatePath('/icsa/analytics', 'layout');
    return { success: true, data: { review } };
  } catch (err) {
    return fail(err, 'Could not review the gaps.', 'generateIcsaGapReview.failed');
  }
}

/** Three AI suggestions for closing one gap. Nothing is saved until someone picks one. */
export async function suggestIcsaActions(
  enrollmentId: number,
  questionRef: string,
): Promise<IcsaResult<{ suggestions: ActionSuggestion[] }>> {
  try {
    const { snap } = await loadCountry(enrollmentId);
    const gap = snap.gaps.find((g) => g.ref === questionRef);
    if (!gap) return { success: false, error: 'That question is not a gap in this country.' };
    const finding = snap.review?.review.gaps.find((g) => g.ref === questionRef)?.finding ?? null;
    const { system, prompt } = actionSuggestionPrompt({
      country: snap.enrollment.country,
      gap,
      finding,
    });
    const answer = await askIcsaAi({
      task: 'action-suggestions',
      system,
      prompt,
      maxTokens: 1500,
    });
    return { success: true, data: { suggestions: normalizeSuggestions(extractJson(answer.text)) } };
  } catch (err) {
    return fail(err, 'Could not get suggestions.', 'suggestIcsaActions.failed');
  }
}

export interface ActionPlanInput {
  /** Set to edit an existing plan; omit to add one. */
  id?: number;
  questionRef: string;
  action: string;
  owner: string;
  dueDate: string;
  status: 'open' | 'in_progress' | 'done';
  fromAi: boolean;
}

const STATUSES = ['open', 'in_progress', 'done'];

/** Add or change an action plan for one gap. Champions of the country and admins. */
export async function saveIcsaActionPlan(
  enrollmentId: number,
  input: ActionPlanInput,
): Promise<IcsaResult<{ id: number }>> {
  try {
    const { actor, snap } = await loadCountry(enrollmentId);
    const action = input.action?.trim();
    if (!action) return { success: false, error: 'Describe the action.' };
    if (action.length > 2000)
      return { success: false, error: 'Keep the action under 2000 characters.' };
    if (!snap.gaps.some((g) => g.ref === input.questionRef))
      return { success: false, error: 'That question is not a gap in this country.' };
    if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate))
      return { success: false, error: 'Pick a due date.' };
    if (!input.id && input.dueDate && input.dueDate < todayInDubai())
      return { success: false, error: 'The due date cannot be in the past.' };
    if (!STATUSES.includes(input.status)) return { success: false, error: 'Pick a status.' };
    const owner = input.owner?.trim().slice(0, 200) || null;
    const due = input.dueDate || null;

    let id: number;
    if (input.id) {
      const rows = await sql<QueryResultRow[]>(
        `UPDATE icsa_action_plans
            SET action = ?, owner = ?, due_date = ?::date, status = ?, updated_by = ?, updated_at = NOW()
          WHERE id = ? AND enrollment_id = ? RETURNING id`,
        [action, owner, due, input.status, actor.email, input.id, enrollmentId],
      );
      if (!rows[0]) return { success: false, error: 'That action plan no longer exists.' };
      id = Number(rows[0].id);
    } else {
      const { insertId } = await exec(
        `INSERT INTO icsa_action_plans
           (enrollment_id, question_ref, action, owner, due_date, status, from_ai, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?::date, ?, ?, ?, ?) RETURNING id`,
        [
          enrollmentId,
          input.questionRef,
          action,
          owner,
          due,
          input.status,
          !!input.fromAi,
          actor.email,
          actor.email,
        ],
      );
      id = insertId;
    }
    await logEvent(sql, {
      actor: actor.email,
      action: input.id ? 'action_plan.updated' : 'action_plan.created',
      cycleId: snap.enrollment.cycleId,
      enrollmentId,
      detail: { id, ref: input.questionRef, status: input.status, fromAi: input.fromAi },
    });
    revalidatePath('/icsa/analytics', 'layout');
    return { success: true, data: { id } };
  } catch (err) {
    return fail(err, 'Could not save the action plan.', 'saveIcsaActionPlan.failed');
  }
}

export async function deleteIcsaActionPlan(
  enrollmentId: number,
  planId: number,
): Promise<IcsaResult> {
  try {
    const { actor, snap } = await loadCountry(enrollmentId);
    await exec(`DELETE FROM icsa_action_plans WHERE id = ? AND enrollment_id = ?`, [
      planId,
      enrollmentId,
    ]);
    await logEvent(sql, {
      actor: actor.email,
      action: 'action_plan.deleted',
      cycleId: snap.enrollment.cycleId,
      enrollmentId,
      detail: { id: planId },
    });
    revalidatePath('/icsa/analytics', 'layout');
    return { success: true };
  } catch (err) {
    return fail(err, 'Could not delete the action plan.', 'deleteIcsaActionPlan.failed');
  }
}
