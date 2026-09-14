'use server';

import pool from '@/lib/db';
import { requireUser } from '@/lib/require-access';

/**
 * Server-side validation for a supplier contact address. Supplier contacts are
 * external, so a fixed corporate domain allow-list is not usable here; instead
 * the address must be a single, syntactically valid mailbox on a real
 * (dotted, non-local, non-IP-literal) domain. Rejecting commas matters: the
 * column stores a comma-joined list, so one comma would smuggle several
 * recipients into a supplier's default list.
 */
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const BLOCKED_DOMAINS = new Set(['localhost', 'localhost.localdomain', 'example.com', 'test.com', 'invalid']);

function validateSupplierEmail(raw: string): { ok: true; email: string } | { ok: false; error: string } {
  const email = (raw ?? '').trim();
  if (!email) return { ok: false, error: 'Email is required.' };
  if (email.length > 254) return { ok: false, error: 'Email is too long.' };
  if (/[,;\s<>"']/.test(email)) return { ok: false, error: 'Enter a single valid email address.' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  if (BLOCKED_DOMAINS.has(domain)) return { ok: false, error: 'That email domain is not allowed.' };
  return { ok: true, email };
}

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
  await requireUser();

  const validated = validateSupplierEmail(newEmail);
  if (!validated.ok) return { success: false, error: validated.error };
  const cleanEmail = validated.email;

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
    if (currentList.some(e => e.toLowerCase() === cleanEmail.toLowerCase())) {
      return { success: true };
    }

    const updated = [...currentList, cleanEmail].join(',');

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
