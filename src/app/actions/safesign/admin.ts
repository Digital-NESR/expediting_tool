'use server';

import { revalidatePath } from 'next/cache';
import type { QueryResultRow } from 'pg';
import { AccessError, normalizeEmail } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { listCountries, requireSafeSignAdmin, type Country } from '@/lib/safesign/access';
import { safesignPool, ensureSafeSignSchema } from '@/lib/safesign/db';
import { listTopics, type Topic } from '@/lib/safesign/read';

/**
 * SafeSign's admin panel (/admin/safesign): who sends for which country, and the topics.
 * Admins only (ADMIN_EMAILS / SAFESIGN_ADMIN_EMAILS); every export checks.
 */

const log = logger('safesign-admin');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Result = { success: boolean; error?: string };

function fail(err: unknown, event: string): Result {
  if (err instanceof AccessError) return { success: false, error: err.message };
  if ((err as { code?: string })?.code === '23505') return { success: false, error: 'That name is already in use.' };
  log.error(event, err);
  return { success: false, error: 'Something went wrong. Try again.' };
}

export interface CountryMember {
  email: string;
  name: string;
  countryId: string;
  addedBy: string;
}

export async function getSafeSignCountryTeam(): Promise<{ countries: Country[]; members: CountryMember[] }> {
  await requireSafeSignAdmin();
  const [countries, { rows }] = await Promise.all([
    listCountries(),
    safesignPool.query<QueryResultRow>(
      `SELECT email, COALESCE(name, '') AS name, country_id, created_by
         FROM ss_country_users ORDER BY country_id, name, email`,
    ),
  ]);
  return {
    countries,
    members: rows.map((r) => ({
      email: String(r.email),
      name: String(r.name),
      countryId: String(r.country_id),
      addedBy: String(r.created_by),
    })),
  };
}

/** Let someone send for a country. Admins already have every country. */
export async function addSafeSignCountryUser(input: { email: string; name?: string; countryId: string }): Promise<Result> {
  try {
    const actor = await requireSafeSignAdmin();
    await ensureSafeSignSchema();
    const email = normalizeEmail(input?.email);
    if (!EMAIL.test(email)) return { success: false, error: 'Choose a person.' };
    const countries = await listCountries();
    if (!countries.some((c) => c.id === input?.countryId)) return { success: false, error: 'Choose a country.' };
    await safesignPool.query(
      `INSERT INTO ss_country_users (email, name, country_id, created_by) VALUES ($1, NULLIF($2, ''), $3, $4)
       ON CONFLICT (email, country_id) DO UPDATE SET name = COALESCE(EXCLUDED.name, ss_country_users.name)`,
      [email, String(input?.name ?? '').trim(), input.countryId, actor.email],
    );
    revalidatePath('/admin/safesign');
    return { success: true };
  } catch (err) {
    return fail(err, 'addSafeSignCountryUser.failed');
  }
}

export async function removeSafeSignCountryUser(input: { email: string; countryId: string }): Promise<Result> {
  try {
    await requireSafeSignAdmin();
    await ensureSafeSignSchema();
    await safesignPool.query(`DELETE FROM ss_country_users WHERE LOWER(email) = $1 AND country_id = $2`, [
      normalizeEmail(input?.email),
      String(input?.countryId ?? ''),
    ]);
    revalidatePath('/admin/safesign');
    return { success: true };
  } catch (err) {
    return fail(err, 'removeSafeSignCountryUser.failed');
  }
}

export async function getSafeSignTopics(): Promise<Topic[]> {
  await requireSafeSignAdmin();
  return listTopics(true);
}

/** Topics are shared by every country, so only admins change them. */
export async function saveSafeSignTopic(input: { id?: number; name: string; description?: string }): Promise<Result> {
  try {
    const actor = await requireSafeSignAdmin();
    await ensureSafeSignSchema();
    const name = String(input?.name ?? '').trim();
    if (!name) return { success: false, error: 'Enter a topic name.' };
    const description = String(input?.description ?? '').trim();
    if (input.id) {
      await safesignPool.query(`UPDATE ss_topics SET name = $2, description = NULLIF($3, '') WHERE id = $1`, [
        input.id,
        name,
        description,
      ]);
    } else {
      await safesignPool.query(
        `INSERT INTO ss_topics (name, description, created_by) VALUES ($1, NULLIF($2, ''), $3)`,
        [name, description, actor.email],
      );
    }
    revalidatePath('/safesign', 'layout');
    return { success: true };
  } catch (err) {
    return fail(err, 'saveSafeSignTopic.failed');
  }
}

export async function setSafeSignTopicArchived(id: number, archived: boolean): Promise<Result> {
  try {
    await requireSafeSignAdmin();
    await ensureSafeSignSchema();
    await safesignPool.query(`UPDATE ss_topics SET archived = $2 WHERE id = $1`, [Number(id), Boolean(archived)]);
    revalidatePath('/safesign', 'layout');
    return { success: true };
  } catch (err) {
    return fail(err, 'setSafeSignTopicArchived.failed');
  }
}

/* ── Approvers ───────────────────────────────────────────────────────────────── */

export interface ApproverRow {
  id: number;
  step: 'scm' | 'final';
  countryId: string | null;
  email: string;
  name: string;
}

/** The country SCMs and the final approvers (see src/lib/safesign/approvals.ts). */
export async function getSafeSignApprovers(): Promise<{ countries: Country[]; approvers: ApproverRow[] }> {
  await requireSafeSignAdmin();
  await ensureSafeSignSchema();
  const [countries, { rows }] = await Promise.all([
    listCountries(),
    safesignPool.query<QueryResultRow>(
      `SELECT id, step, country_id, email, COALESCE(name, email) AS name
         FROM ss_approvers ORDER BY step, country_id, name`,
    ),
  ]);
  return {
    countries,
    approvers: rows.map((r) => ({
      id: Number(r.id),
      step: r.step === 'final' ? 'final' : 'scm',
      countryId: r.country_id ? String(r.country_id) : null,
      email: String(r.email),
      name: String(r.name),
    })),
  };
}

export async function addSafeSignApprover(input: {
  step: 'scm' | 'final';
  countryId?: string;
  email: string;
  name?: string;
}): Promise<Result> {
  try {
    const actor = await requireSafeSignAdmin();
    await ensureSafeSignSchema();
    const step = input?.step === 'final' ? 'final' : 'scm';
    const email = normalizeEmail(input?.email);
    if (!EMAIL.test(email)) return { success: false, error: 'Choose a person.' };
    let countryId: string | null = null;
    if (step === 'scm') {
      const countries = await listCountries();
      if (!countries.some((c) => c.id === input?.countryId)) return { success: false, error: 'Choose a country.' };
      countryId = String(input.countryId);
    }
    await safesignPool.query(
      `INSERT INTO ss_approvers (step, country_id, email, name, created_by)
       VALUES ($1, $2, $3, NULLIF($4, ''), $5) ON CONFLICT DO NOTHING`,
      [step, countryId, email, String(input?.name ?? '').trim(), actor.email],
    );
    revalidatePath('/admin/safesign');
    return { success: true };
  } catch (err) {
    return fail(err, 'addSafeSignApprover.failed');
  }
}

export async function removeSafeSignApprover(id: number): Promise<Result> {
  try {
    await requireSafeSignAdmin();
    await ensureSafeSignSchema();
    await safesignPool.query(`DELETE FROM ss_approvers WHERE id = $1`, [Number(id)]);
    revalidatePath('/admin/safesign');
    return { success: true };
  } catch (err) {
    return fail(err, 'removeSafeSignApprover.failed');
  }
}
