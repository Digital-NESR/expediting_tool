'use server';

/* ─── Champions, the per-country editors an admin appoints. ─── */

import sourceGuidePool from '@/lib/db-sourceguide';
import { normalizeEmail } from '@/lib/require-access';
import { canReadAdmin, getSgUser } from '@/lib/sourceguide/access';
import { logSafe } from '@/lib/sourceguide/activity';
import { log } from '@/lib/sourceguide/internals';
import type { SgChampion, SgCountryChampions } from '@/lib/sourceguide/types';

export async function getChampionsByCountry(): Promise<SgCountryChampions[]> {
  if (!(await canReadAdmin())) return [];
  try {
    const [countries, champs] = await Promise.all([
      sourceGuidePool.query(`SELECT code, name, tone FROM sg_countries ORDER BY sort_order, name`),
      sourceGuidePool.query(`SELECT id, country_code, name, email FROM sg_champions ORDER BY name`),
    ]);
    const byCountry = new Map<string, SgChampion[]>();
    for (const r of champs.rows) {
      (
        byCountry.get(r.country_code) ?? byCountry.set(r.country_code, []).get(r.country_code)!
      ).push({ id: r.id, countryCode: r.country_code, name: r.name, email: r.email });
    }
    return countries.rows.map((c) => ({
      country: c.code,
      name: c.name,
      tone: c.tone,
      champions: byCountry.get(c.code) ?? [],
    }));
  } catch (err) {
    log.error('getChampionsByCountry.failed', err);
    return [];
  }
}

export async function addChampion(
  countryCode: string,
  name: string,
  email: string | null,
): Promise<{ success: boolean; error?: string }> {
  const user = await getSgUser();
  if (!user?.isAdmin) return { success: false, error: 'Admins only.' };
  const n = (name || '').trim();
  if (!n) return { success: false, error: 'Name is required.' };
  const e = normalizeEmail(email) || null;
  try {
    if (e) {
      const dup = await sourceGuidePool.query(
        `SELECT 1 FROM sg_champions WHERE country_code=$1 AND LOWER(email)=LOWER($2)`,
        [countryCode, e],
      );
      if (dup.rows.length)
        return { success: false, error: 'That email is already a champion for this country.' };
    }
    await sourceGuidePool.query(
      `INSERT INTO sg_champions (country_code, name, email) VALUES ($1, $2, $3)`,
      [countryCode, n, e],
    );
    await logSafe(
      countryCode,
      null,
      'Champion added',
      `${n}${e ? ` (${e})` : ''}`,
      user.name,
      user.email,
    );
    return { success: true };
  } catch (err) {
    log.error('addChampion.failed', err, { countryCode });
    return { success: false, error: 'Failed to add champion.' };
  }
}

export async function updateChampion(
  id: number,
  name: string,
  email: string | null,
): Promise<{ success: boolean; error?: string }> {
  const user = await getSgUser();
  if (!user?.isAdmin) return { success: false, error: 'Admins only.' };
  const n = (name || '').trim();
  if (!n) return { success: false, error: 'Name is required.' };
  const e = normalizeEmail(email) || null;
  try {
    const row = await sourceGuidePool.query(
      `SELECT country_code, name, email FROM sg_champions WHERE id=$1`,
      [id],
    );
    if (!row.rows.length) return { success: false, error: 'Champion not found.' };
    const prev = row.rows[0];
    if (e) {
      const dup = await sourceGuidePool.query(
        `SELECT 1 FROM sg_champions WHERE country_code=$1 AND LOWER(email)=LOWER($2) AND id<>$3`,
        [prev.country_code, e, id],
      );
      if (dup.rows.length)
        return { success: false, error: 'That email is already a champion for this country.' };
    }
    await sourceGuidePool.query(`UPDATE sg_champions SET name=$2, email=$3 WHERE id=$1`, [
      id,
      n,
      e,
    ]);
    await logSafe(
      prev.country_code,
      null,
      'Champion updated',
      `${prev.name}${prev.email ? ` (${prev.email})` : ''} to ${n}${e ? ` (${e})` : ''}`,
      user.name,
      user.email,
    );
    return { success: true };
  } catch (err) {
    log.error('updateChampion.failed', err, { id });
    return { success: false, error: 'Failed to update champion.' };
  }
}

export async function removeChampion(id: number): Promise<{ success: boolean; error?: string }> {
  const user = await getSgUser();
  if (!user?.isAdmin) return { success: false, error: 'Admins only.' };
  try {
    const row = await sourceGuidePool.query(
      `SELECT country_code, name, email FROM sg_champions WHERE id=$1`,
      [id],
    );
    await sourceGuidePool.query(`DELETE FROM sg_champions WHERE id=$1`, [id]);
    const prev = row.rows[0];
    if (prev)
      await logSafe(
        prev.country_code,
        null,
        'Champion removed',
        `${prev.name}${prev.email ? ` (${prev.email})` : ''}`,
        user.name,
        user.email,
      );
    return { success: true };
  } catch (err) {
    log.error('removeChampion.failed', err, { id });
    return { success: false, error: 'Failed to remove champion.' };
  }
}
