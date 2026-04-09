'use server';

import pool from '@/lib/db';

export async function addAdditionalSupplierEmail(
  supplierId: string,
  newEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch the current additional_supplier_email value
    const result = await pool.query<{ additional_supplier_email: string | null }>(
      `SELECT additional_supplier_email FROM supplier_contacts WHERE supplier_id = $1`,
      [supplierId]
    );

    let updated: string;
    if (result.rows.length === 0 || !result.rows[0].additional_supplier_email?.trim()) {
      updated = newEmail;
    } else {
      updated = `${result.rows[0].additional_supplier_email},${newEmail}`;
    }

    await pool.query(
      `UPDATE supplier_contacts SET additional_supplier_email = $1 WHERE supplier_id = $2`,
      [updated, supplierId]
    );

    return { success: true };
  } catch (err) {
    console.error('[addAdditionalSupplierEmail]', err);
    return { success: false, error: 'Failed to save email.' };
  }
}

export async function getSupplierContacts(supplierId: string): Promise<{
  toEmails: string[];
  supplierName: string | null;
}> {
  try {
    const result = await pool.query<{
      additional_supplier_email: string | null;
      supplier_name: string | null;
    }>(
      `SELECT additional_supplier_email, supplier_name FROM supplier_contacts WHERE supplier_id = $1`,
      [supplierId]
    );

    if (result.rows.length === 0) {
      return { toEmails: [], supplierName: null };
    }

    const { additional_supplier_email, supplier_name } = result.rows[0];
    const toEmails = additional_supplier_email
      ? additional_supplier_email.split(',').map((e) => e.trim()).filter(Boolean)
      : [];

    return { toEmails, supplierName: supplier_name };
  } catch (err) {
    console.error('[getSupplierContacts]', err);
    return { toEmails: [], supplierName: null };
  }
}
