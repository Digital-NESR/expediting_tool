'use server';

import empDirectoryPool from '@/lib/db-emp-directory';
import { logger } from '@/lib/logger';
import { requireIcsaManager } from '@/lib/icsa/access';
import { directoryCountriesFor } from '@/lib/icsa/model';
import { DEMO_USERS } from '@/lib/icsa/demo';

const log = logger('icsa-directory');

/**
 * People search for nominating respondents, over the Azure AD directory sync
 * (azure_ad_users_staging). Unlike the platform's name autocomplete it filters by country,
 * department and job title, which is how a champion actually finds "the storekeepers in Oman".
 * Champions and administrators only.
 */

export interface DirectoryPerson {
  name: string;
  email: string;
  jobTitle: string | null;
  department: string | null;
  country: string | null;
}

export interface DirectoryFilter {
  /** An ICSA country; expanded to every directory spelling of it. */
  country?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  /** Name or email fragment. */
  q?: string | null;
}

const LIMIT = 200;

/** A demo session searches the demo people, never the real directory. */
function demoPeople(): DirectoryPerson[] {
  return DEMO_USERS.map((d) => ({
    name: d.name,
    email: d.email,
    jobTitle: d.jobTitle,
    department: d.department,
    country: d.country,
  }));
}

function matches(value: string | null, fragment: string | null): boolean {
  return !fragment || (value ?? '').toLowerCase().includes(fragment.toLowerCase());
}

export async function searchIcsaDirectory(
  filter: DirectoryFilter,
): Promise<{ people: DirectoryPerson[]; truncated: boolean; error?: string }> {
  try {
    const actor = await requireIcsaManager();
    const country = filter.country?.trim() || null;
    const department = filter.department?.trim() || null;
    const jobTitle = filter.jobTitle?.trim() || null;
    const q = filter.q?.trim() || null;
    if (!country && !department && !jobTitle && (!q || q.length < 2)) {
      return { people: [], truncated: false };
    }
    if (actor.isDemo) {
      const people = demoPeople().filter(
        (p) =>
          (!country || p.country === country) &&
          (!department || p.department === department) &&
          matches(p.jobTitle, jobTitle) &&
          (matches(p.name, q) || matches(p.email, q)),
      );
      return { people, truncated: false };
    }
    const { rows } = await empDirectoryPool.query(
      `SELECT DISTINCT ON (LOWER(mail)) display_name, mail, job_title, department, country
         FROM azure_ad_users_staging
        WHERE mail IS NOT NULL AND mail <> ''
          AND ($1::text[] IS NULL OR country = ANY($1::text[]))
          AND ($2::text IS NULL OR department = $2)
          AND ($3::text IS NULL OR job_title ILIKE '%' || $3 || '%')
          AND ($4::text IS NULL OR display_name ILIKE '%' || $4 || '%' OR mail ILIKE '%' || $4 || '%')
        ORDER BY LOWER(mail)
        LIMIT ${LIMIT + 1}`,
      [country ? directoryCountriesFor(country) : null, department, jobTitle, q],
    );
    const people = rows
      .map((r) => ({
        name: (r.display_name as string) || (r.mail as string),
        email: String(r.mail).toLowerCase(),
        jobTitle: (r.job_title as string) ?? null,
        department: (r.department as string) ?? null,
        country: (r.country as string) ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { people: people.slice(0, LIMIT), truncated: people.length > LIMIT };
  } catch (err) {
    log.error('searchIcsaDirectory.failed', err);
    return { people: [], truncated: false, error: 'The directory could not be searched.' };
  }
}

/** Departments present in the directory, for the filter dropdown. */
export async function icsaDirectoryDepartments(country?: string | null): Promise<string[]> {
  try {
    const actor = await requireIcsaManager();
    if (actor.isDemo) {
      return [
        ...new Set(
          demoPeople()
            .filter((p) => !country || p.country === country)
            .map((p) => p.department!),
        ),
      ].sort();
    }
    const { rows } = await empDirectoryPool.query(
      `SELECT DISTINCT department FROM azure_ad_users_staging
        WHERE department IS NOT NULL AND department <> ''
          AND ($1::text[] IS NULL OR country = ANY($1::text[]))
        ORDER BY department`,
      [country ? directoryCountriesFor(country) : null],
    );
    return rows.map((r) => String(r.department));
  } catch (err) {
    log.error('icsaDirectoryDepartments.failed', err);
    return [];
  }
}
