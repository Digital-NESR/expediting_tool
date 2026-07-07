'use server';

import empDirectoryPool from '@/lib/db-emp-directory';

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
