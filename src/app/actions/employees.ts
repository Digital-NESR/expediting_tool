'use server';

import empPool from '@/lib/db-emp';

export interface Employee {
  id: number;
  display_name: string;
  mail: string;
  job_title: string | null;
  department: string | null;
  office_location: string | null;
}

export async function searchEmployees(
  query: string
): Promise<Employee[]> {
  if (!query || query.trim().length < 2) return [];

  const searchTerm = `%${query.trim()}%`;

  const result = await empPool.query(
    `SELECT id, display_name, mail, job_title,
      department, office_location
     FROM azure_ad_users_staging
     WHERE mail IS NOT NULL
       AND mail != ''
       AND (
         display_name ILIKE $1
         OR mail ILIKE $1
         OR department ILIKE $1
         OR job_title ILIKE $1
       )
     ORDER BY display_name ASC
     LIMIT 10`,
    [searchTerm]
  );

  return result.rows;
}
