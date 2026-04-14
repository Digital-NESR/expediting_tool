'use server';

import pool from '@/lib/db';

export async function getSupplierContacts(supplierId: string): Promise<{
  defaultEmails: string[];
  additionalEmails: string[];
  supplierName: string | null;
}> {
  try {
    const result = await pool.query<{
      supplier_emails: string | null;
      additional_supplier_email: string | null;
      supplier_name: string | null;
    }>(
      `SELECT supplier_emails, additional_supplier_email, supplier_name
       FROM supplier_contacts WHERE supplier_id = $1`,
      [supplierId]
    );

    if (result.rows.length === 0) {
      return { defaultEmails: [], additionalEmails: [], supplierName: null };
    }

    const { supplier_emails, additional_supplier_email, supplier_name } = result.rows[0];

    const defaultEmails = supplier_emails
      ? supplier_emails.split(',').map((e) => e.trim()).filter(Boolean)
      : [];
    const additionalEmails = additional_supplier_email
      ? additional_supplier_email.split(',').map((e) => e.trim()).filter(Boolean)
      : [];

    return { defaultEmails, additionalEmails, supplierName: supplier_name };
  } catch (err) {
    console.error('[getSupplierContacts]', err);
    return { defaultEmails: [], additionalEmails: [], supplierName: null };
  }
}

export async function addAdditionalSupplierEmail(
  supplierId: string,
  newEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await pool.query<{ additional_supplier_email: string | null }>(
      `SELECT additional_supplier_email FROM supplier_contacts WHERE supplier_id = $1`,
      [supplierId]
    );

    const existing = result.rows[0]?.additional_supplier_email ?? '';
    const currentList = existing
      ? existing.split(',').map((e) => e.trim()).filter(Boolean)
      : [];

    // Deduplicate — no-op if already present
    if (currentList.includes(newEmail.trim())) {
      return { success: true };
    }

    const updated = [...currentList, newEmail.trim()].join(',');

    await pool.query(
      `INSERT INTO supplier_contacts (supplier_id, additional_supplier_email)
       VALUES ($1, $2)
       ON CONFLICT (supplier_id)
       DO UPDATE SET additional_supplier_email = EXCLUDED.additional_supplier_email`,
      [supplierId, updated]
    );

    return { success: true };
  } catch (err) {
    console.error('[addAdditionalSupplierEmail]', err);
    return { success: false, error: 'Failed to save email.' };
  }
}
