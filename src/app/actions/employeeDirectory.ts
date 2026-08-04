'use server';

import empDirectoryPool from '@/lib/db-emp-directory';
import { COUNTRY_OPTIONS } from '@/lib/laptopProcurement-utils';

// The directory's `country` values don't line up with COUNTRY_OPTIONS (extra
// countries the form doesn't list, and ambiguous variants like "Dubai"/
// "UAE-Dubai" that could mean either "United Arab Emirates (UAE)" or "HQ
// Dubai"). Only alias unambiguous cases; anything else is left unmapped so a
// bad guess is never silently written into the request.
const COUNTRY_ALIASES: Record<string, string> = {
  'united arab emirates': 'United Arab Emirates (UAE)',
  'iraq north': 'Iraq',
  'iraq south': 'Iraq',
};

function normalizeDirectoryCountry(rawCountry: string | null): string | null {
  if (!rawCountry) return null;
  const trimmed = rawCountry.trim();
  if (!trimmed) return null;
  const exact = COUNTRY_OPTIONS.find(o => o.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;
  return COUNTRY_ALIASES[trimmed.toLowerCase()] ?? null;
}

export interface EmployeeDirectoryEntry {
  name: string;
  email: string;
  jobTitle: string | null;
  department: string | null;
  country: string | null;
}

// Autocomplete search over the Azure AD employee directory. Matches on name or email,
// prioritises email-prefix hits and corporate domains, and returns a small deduped list.
// Degrades to an empty list if the directory DB is not configured (e.g. local dev).
export async function searchEmployees(query: string): Promise<EmployeeDirectoryEntry[]> {
  const q = (query || '').trim();
  if (q.length < 2) return [];

  try {
    const like = `%${q}%`;
    const prefix = `${q}%`;
    const { rows } = await empDirectoryPool.query(
      `SELECT DISTINCT ON (LOWER(mail)) display_name, mail, job_title, department, country
       FROM azure_ad_users_staging
       WHERE mail IS NOT NULL AND mail <> ''
         AND (display_name ILIKE $1 OR mail ILIKE $1)
       ORDER BY LOWER(mail),
                (mail ILIKE $2) DESC,
                (job_title IS NOT NULL) DESC,
                display_name ASC
       LIMIT 40`,
      [like, prefix],
    );

    // Re-rank across the deduped set (DISTINCT ON forces mail ordering first) and cap the list.
    const ranked = rows
      .map(r => ({
        name: (r.display_name as string) || (r.mail as string),
        email: r.mail as string,
        jobTitle: (r.job_title as string) ?? null,
        department: (r.department as string) ?? null,
        country: (r.country as string) ?? null,
      }))
      .sort((a, b) => {
        const aPrefix = a.email.toLowerCase().startsWith(q.toLowerCase()) || a.name.toLowerCase().startsWith(q.toLowerCase());
        const bPrefix = b.email.toLowerCase().startsWith(q.toLowerCase()) || b.name.toLowerCase().startsWith(q.toLowerCase());
        if (aPrefix !== bPrefix) return aPrefix ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 10);

    return ranked;
  } catch (err) {
    console.error('[searchEmployees]', err);
    return [];
  }
}

export interface EmployeeDirectoryDefaults {
  employeeId: string | null;
  country: string | null;
  department: string | null;
  position: string | null;
  companyCode: string | null;
  costCenter: string | null;
}

const EMPTY_DEFAULTS: EmployeeDirectoryDefaults = {
  employeeId: null,
  country: null,
  department: null,
  position: null,
  companyCode: null,
  costCenter: null,
};

function blank(value: unknown): string | null {
  const s = (value as string | null | undefined) ?? null;
  return s && s.trim() ? s.trim() : null;
}

// Looks up the requester's own HR record to auto-fill self-service request
// forms, minimizing manual typing for fields the directory already knows.
// Country is only filled when it maps unambiguously onto COUNTRY_OPTIONS —
// see normalizeDirectoryCountry. Segment and company name have no reliable
// source in this table, so they aren't included; degrades to all-null if the
// directory DB is unreachable or the person has no record on file.
export async function getEmployeeDirectoryDefaults(email: string): Promise<EmployeeDirectoryDefaults> {
  const mail = (email || '').trim();
  if (!mail) return EMPTY_DEFAULTS;

  try {
    const { rows } = await empDirectoryPool.query(
      `SELECT employee_id, country, department, job_title, company_code, cost_center
       FROM azure_ad_users_staging WHERE LOWER(mail) = LOWER($1) LIMIT 1`,
      [mail],
    );
    const row = rows[0];
    if (!row) return EMPTY_DEFAULTS;

    return {
      employeeId: blank(row.employee_id),
      country: normalizeDirectoryCountry(blank(row.country)),
      department: blank(row.department),
      position: blank(row.job_title),
      companyCode: blank(row.company_code),
      costCenter: blank(row.cost_center),
    };
  } catch (err) {
    console.error('[getEmployeeDirectoryDefaults]', err);
    return EMPTY_DEFAULTS;
  }
}
