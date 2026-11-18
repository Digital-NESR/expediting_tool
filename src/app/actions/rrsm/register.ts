'use server';

import type { PoolClient, QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { logger } from '@/lib/logger';
import { canAccessCountry, currentRrsmActor, rolesIn, type RrsmActor } from '@/lib/rrsm/access';
import {
  checkOffHireDate,
  checkServiceLine,
  checkSupplier,
  clean,
  diffValues,
  type FieldErrors,
  type OperatingModel,
  type ServiceLineDraft,
  type ServiceLineValues,
  type SupplierDraft,
} from '@/lib/rrsm/register';

/**
 * Editing the service register: lines and the suppliers they belong to.
 *
 * EVERY EXPORT IS A PUBLIC POST ENDPOINT. The rule, decided with the business: buyers and admins
 * edit the register, Ops read it. The register holds rates and contracts, which are commercial;
 * Ops still record "off hire this month" per cycle on their own screen, which is a different act.
 *
 * Every write re-reads the country from the row it is changing rather than trusting one sent by
 * the caller, and every write lands in `rrsm_register_log` in the same transaction, so a change
 * cannot happen without its record.
 *
 * Each country's register is kept separately for now (UAE first); suppliers are shared, because
 * a SAP vendor code means one company wherever it is used.
 */

const log = logger('rrsm-register');

export type RegisterResult = {
  success: boolean;
  error?: string;
  /** Per-field problems, keyed as the form's fields are. */
  fieldErrors?: Record<string, string>;
  id?: number;
};

export interface RegisterSupplier {
  code: string;
  name: string;
  contactEmails: string[];
  active: boolean;
  /** Lines on this country's register, so the picker can lead with the ones already in use. */
  linesHere: number;
}

export interface RegisterEditorData {
  canEdit: boolean;
  uoms: { code: string; label: string }[];
  suppliers: RegisterSupplier[];
}

export interface RegisterLogEntry {
  id: number;
  actor: string;
  action: string;
  changes: Record<string, [unknown, unknown]>;
  note: string;
  at: string;
}

/* ─── gates ──────────────────────────────────────────────────────────────────────────────── */

async function actorOrThrow(): Promise<RrsmActor> {
  const actor = await currentRrsmActor();
  if (!actor) throw new Error('Not signed in.');
  return actor;
}

function canEditIn(actor: RrsmActor, code: string): boolean {
  return canAccessCountry(actor, code, 'buyer') && rolesIn(actor, code).canBuy;
}

/** The actor, having proved they may edit this country's register. */
async function requireEditor(code: string): Promise<RrsmActor> {
  const actor = await actorOrThrow();
  if (!code || !canEditIn(actor, code))
    throw new Error('Only a buyer or an admin for this country can change the register.');
  return actor;
}

/** A line's country, read from the row. A line id from the browser proves nothing about it. */
async function lineCountry(client: PoolClient, id: number): Promise<QueryResultRow> {
  if (!Number.isInteger(id) || id <= 0) throw new Error('Unknown line.');
  const { rows } = await client.query<QueryResultRow>(
    `SELECT * FROM rrsm_service_lines WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (!rows[0]) throw new Error('That line no longer exists.');
  return rows[0];
}

function dateOnly(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

function str(v: unknown): string | null {
  return v === null || v === undefined || v === '' ? null : String(v);
}

/** A database row in the shape the checks produce, so the two can be diffed field for field. */
function rowToValues(r: QueryResultRow): ServiceLineValues {
  return {
    supplierCode: String(r.supplier_code),
    category: str(r.category),
    description: String(r.description),
    assetRef: str(r.asset_ref),
    serviceNumber: str(r.service_number),
    segment: String(r.segment),
    costCenter: String(r.cost_center),
    costCenterName: str(r.cost_center_name),
    entity: str(r.entity),
    purchasingGroup: str(r.purchasing_group),
    plant: str(r.plant),
    operatingModel: String(r.operating_model) as OperatingModel,
    uom: String(r.uom),
    rate: r.rate === null ? null : Number(r.rate),
    paymentTerms: str(r.payment_terms),
    startsOn: dateOnly(r.starts_on),
    contractEndsOn: dateOnly(r.contract_ends_on),
    ownerEmail: str(r.owner_email),
    requesterEmail: str(r.requester_email),
  };
}

async function writeLog(
  client: PoolClient,
  entry: {
    country: string | null;
    lineId?: number | null;
    supplierCode?: string | null;
    actor: string;
    action: string;
    changes?: Record<string, [unknown, unknown]>;
    note?: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO rrsm_register_log
       (country_code, service_line_id, supplier_code, actor, action, changes, note)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      entry.country,
      entry.lineId ?? null,
      entry.supplierCode ?? null,
      entry.actor,
      entry.action,
      JSON.stringify(entry.changes ?? {}),
      entry.note ?? null,
    ],
  );
}

/** One transaction, rolled back on any throw, with the connection always returned. */
async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await rrsmPool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

class Refusal extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

function fail(err: unknown, where: string, context: Record<string, unknown>): RegisterResult {
  if (err instanceof Refusal) return { success: false, error: err.message, fieldErrors: err.fieldErrors };
  log.error(`${where}.failed`, err, context);
  return { success: false, error: (err as Error).message || 'That did not save.' };
}

function asFieldErrors(e: FieldErrors<string>): Record<string, string> {
  return Object.fromEntries(Object.entries(e).filter(([, v]) => !!v)) as Record<string, string>;
}

/* ─── read ───────────────────────────────────────────────────────────────────────────────── */

/** What the editor needs beyond the rows themselves: whether to show it, units, suppliers. */
export async function getRegisterEditor(countryCode: string): Promise<RegisterEditorData> {
  const empty: RegisterEditorData = { canEdit: false, uoms: [], suppliers: [] };
  try {
    const actor = await actorOrThrow();
    const code = clean(countryCode);
    if (!code || !canAccessCountry(actor, code, 'buyer')) return empty;

    const [uoms, suppliers] = await Promise.all([
      rrsmPool.query<QueryResultRow>(
        `SELECT code, label FROM rrsm_uoms WHERE active ORDER BY sort_order, label`,
      ),
      rrsmPool.query<QueryResultRow>(
        /* Suppliers already used here first. Wrapped, because Postgres will not sort on an
           output alias inside an expression (`ORDER BY lines_here = 0` fails). */
        `SELECT * FROM (
           SELECT s.code, s.name, s.contact_emails, s.active,
                  (SELECT count(*)::int FROM rrsm_service_lines l
                    WHERE l.supplier_code = s.code AND l.country_code = $1) AS lines_here
             FROM rrsm_suppliers s
         ) x
         ORDER BY (x.lines_here = 0), x.name`,
        [code],
      ),
    ]);

    return {
      canEdit: canEditIn(actor, code),
      uoms: uoms.rows.map((r) => ({ code: String(r.code), label: String(r.label) })),
      suppliers: suppliers.rows.map((r) => ({
        code: String(r.code),
        name: String(r.name),
        contactEmails: (r.contact_emails as string[] | null) ?? [],
        active: Boolean(r.active),
        linesHere: Number(r.lines_here ?? 0),
      })),
    };
  } catch (err) {
    log.error('getRegisterEditor.failed', err, { countryCode });
    return empty;
  }
}

/** A line's change history, newest first. Readable by anyone who can see the register. */
export async function getServiceLineHistory(id: number): Promise<RegisterLogEntry[]> {
  try {
    const actor = await actorOrThrow();
    const lineId = Number(id);
    const { rows: line } = await rrsmPool.query<QueryResultRow>(
      `SELECT country_code FROM rrsm_service_lines WHERE id = $1`,
      [lineId],
    );
    if (!line[0] || !canAccessCountry(actor, String(line[0].country_code), 'buyer')) return [];

    const { rows } = await rrsmPool.query<QueryResultRow>(
      `SELECT id, actor, action, changes, COALESCE(note, '') AS note, created_at
         FROM rrsm_register_log WHERE service_line_id = $1
        ORDER BY created_at DESC, id DESC LIMIT 50`,
      [lineId],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      actor: String(r.actor),
      action: String(r.action),
      changes: (r.changes as Record<string, [unknown, unknown]>) ?? {},
      note: String(r.note ?? ''),
      at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
  } catch (err) {
    log.error('getServiceLineHistory.failed', err, { id });
    return [];
  }
}

/* ─── lines ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Create a line (no `id`) or change one.
 *
 * A changed rate does not reach a cycle that is already open: cycle lines copy the rate when the
 * month is opened, which is what stops a renegotiation silently restating a month already worked.
 * The new rate applies from the next month opened.
 *
 * Refused: a plate or serial that another line in this country still on hire already carries.
 * Two lines for one vehicle is a vehicle paid for twice.
 */
export async function saveServiceLine(input: {
  countryCode: string;
  id?: number | null;
  draft: ServiceLineDraft;
}): Promise<RegisterResult> {
  try {
    const id = input?.id ? Number(input.id) : null;

    return await inTransaction(async (client) => {
      /* For an edit, the country is the row's own, whatever the caller said. */
      const before = id ? await lineCountry(client, id) : null;
      const country = before ? String(before.country_code) : clean(input?.countryCode);
      const actor = await requireEditor(country);

      const { rows: uomRows } = await client.query<QueryResultRow>(
        `SELECT code FROM rrsm_uoms WHERE active OR code = $1`,
        [before ? String(before.uom) : ''],
      );
      const checked = checkServiceLine(
        input.draft,
        uomRows.map((r) => String(r.code)),
      );
      if (!checked.ok) throw new Refusal('Some fields need attention.', asFieldErrors(checked.errors));
      const v = checked.value;

      const { rows: sup } = await client.query<QueryResultRow>(
        `SELECT active FROM rrsm_suppliers WHERE code = $1`,
        [v.supplierCode],
      );
      if (!sup[0])
        throw new Refusal('Add the supplier first.', { supplierCode: 'Not a known supplier.' });
      if (!sup[0].active && (!before || String(before.supplier_code) !== v.supplierCode))
        throw new Refusal('That supplier is inactive.', { supplierCode: 'Inactive supplier.' });

      if (v.assetRef) {
        const { rows: dup } = await client.query<QueryResultRow>(
          `SELECT id, description FROM rrsm_service_lines
            WHERE country_code = $1 AND upper(asset_ref) = $2 AND active
              AND off_hire_date IS NULL AND id <> COALESCE($3, -1)
            LIMIT 1`,
          [country, v.assetRef, id],
        );
        if (dup[0])
          throw new Refusal('That asset is already on the register.', {
            assetRef: `Already on hire as line ${dup[0].id}: ${dup[0].description}`,
          });
      }

      const params = [
        v.supplierCode,
        v.description,
        v.assetRef,
        v.serviceNumber,
        v.segment,
        v.costCenter,
        v.costCenterName,
        v.entity,
        v.purchasingGroup,
        v.plant,
        v.operatingModel,
        v.uom,
        v.rate,
        v.paymentTerms,
        v.startsOn,
        v.contractEndsOn,
        v.ownerEmail,
        v.requesterEmail,
        v.category,
      ];

      if (!before) {
        const { rows } = await client.query<QueryResultRow>(
          `INSERT INTO rrsm_service_lines
             (supplier_code, description, asset_ref, service_number, segment, cost_center,
              cost_center_name, entity, purchasing_group, plant, operating_model, uom, rate,
              payment_terms, starts_on, contract_ends_on, owner_email, requester_email,
              category, country_code)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
           RETURNING id`,
          [...params, country],
        );
        const newId = Number(rows[0].id);
        await writeLog(client, {
          country,
          lineId: newId,
          supplierCode: v.supplierCode,
          actor: actor.email,
          action: 'line_created',
          changes: diffValues({} as Partial<ServiceLineValues>, v as Partial<ServiceLineValues>),
        });
        log.info('line.created', { id: newId, country, by: actor.email });
        return { success: true, id: newId };
      }

      const changes = diffValues(rowToValues(before), v);
      if (!Object.keys(changes).length) return { success: true, id: id! };

      await client.query(
        `UPDATE rrsm_service_lines SET
           supplier_code = $1, description = $2, asset_ref = $3, service_number = $4,
           segment = $5, cost_center = $6, cost_center_name = $7, entity = $8,
           purchasing_group = $9, plant = $10, operating_model = $11, uom = $12, rate = $13,
           payment_terms = $14, starts_on = $15, contract_ends_on = $16, owner_email = $17,
           requester_email = $18, category = $19, updated_at = NOW()
         WHERE id = $20`,
        [...params, id],
      );
      await writeLog(client, {
        country,
        lineId: id,
        supplierCode: v.supplierCode,
        actor: actor.email,
        action: 'line_updated',
        changes,
      });
      log.info('line.updated', { id, fields: Object.keys(changes), by: actor.email });
      return { success: true, id: id! };
    });
  } catch (err) {
    return fail(err, 'saveServiceLine', { id: input?.id });
  }
}

/**
 * Record that an asset has gone for good. The line stays, because past cycles refer to it and
 * the date is itself the answer to "when did this stop"; the next month opened leaves it out.
 */
export async function offHireServiceLine(input: {
  id: number;
  date: string;
  note?: string;
}): Promise<RegisterResult> {
  try {
    return await inTransaction(async (client) => {
      const row = await lineCountry(client, Number(input?.id));
      const country = String(row.country_code);
      const actor = await requireEditor(country);
      if (row.off_hire_date) throw new Refusal('That line is already off hire.');

      const date = clean(input?.date);
      const ok = checkOffHireDate(date, dateOnly(row.starts_on), new Date());
      if (!ok.ok) throw new Refusal(ok.error, { date: ok.error });

      await client.query(
        `UPDATE rrsm_service_lines SET off_hire_date = $2, updated_at = NOW() WHERE id = $1`,
        [row.id, date],
      );
      await writeLog(client, {
        country,
        lineId: Number(row.id),
        supplierCode: String(row.supplier_code),
        actor: actor.email,
        action: 'line_off_hired',
        changes: { offHireDate: [null, date] },
        note: clean(input?.note) || null,
      });
      return { success: true, id: Number(row.id) };
    });
  } catch (err) {
    return fail(err, 'offHireServiceLine', { id: input?.id });
  }
}

/** Undo an off-hire, for an asset that came back or was off-hired by mistake. */
export async function reinstateServiceLine(id: number): Promise<RegisterResult> {
  try {
    return await inTransaction(async (client) => {
      const row = await lineCountry(client, Number(id));
      const country = String(row.country_code);
      const actor = await requireEditor(country);
      if (!row.off_hire_date && row.active) throw new Refusal('That line is already on hire.');

      if (row.asset_ref) {
        const { rows: dup } = await client.query<QueryResultRow>(
          `SELECT id FROM rrsm_service_lines
            WHERE country_code = $1 AND upper(asset_ref) = upper($2) AND active
              AND off_hire_date IS NULL AND id <> $3 LIMIT 1`,
          [country, row.asset_ref, row.id],
        );
        if (dup[0])
          throw new Refusal(
            `${row.asset_ref} is already on hire as line ${dup[0].id}. Off-hire that one first.`,
          );
      }

      await client.query(
        `UPDATE rrsm_service_lines SET off_hire_date = NULL, active = TRUE, updated_at = NOW()
          WHERE id = $1`,
        [row.id],
      );
      await writeLog(client, {
        country,
        lineId: Number(row.id),
        supplierCode: String(row.supplier_code),
        actor: actor.email,
        action: 'line_reinstated',
        changes: { offHireDate: [dateOnly(row.off_hire_date), null] },
      });
      return { success: true, id: Number(row.id) };
    });
  } catch (err) {
    return fail(err, 'reinstateServiceLine', { id });
  }
}

/**
 * Remove a line entered by mistake. Only while no cycle has ever carried it: once a month has
 * been worked against a line, deleting it would delete that month's record of what was paid for,
 * so the answer then is to off-hire it.
 */
export async function deleteServiceLine(id: number): Promise<RegisterResult> {
  try {
    return await inTransaction(async (client) => {
      const row = await lineCountry(client, Number(id));
      const country = String(row.country_code);
      const actor = await requireEditor(country);

      const { rows: used } = await client.query<QueryResultRow>(
        `SELECT (SELECT count(*)::int FROM rrsm_cycle_lines WHERE service_line_id = $1) AS cycles,
                (SELECT count(*)::int FROM rrsm_renewals
                  WHERE service_line_id = $1 AND status <> 'pending') AS decided`,
        [row.id],
      );
      if (Number(used[0]?.cycles ?? 0) || Number(used[0]?.decided ?? 0))
        throw new Refusal(
          'This line has been through a cycle or a renewal, so it stays on record. Off-hire it instead.',
        );

      await client.query(`DELETE FROM rrsm_service_lines WHERE id = $1`, [row.id]);
      await writeLog(client, {
        country,
        lineId: Number(row.id),
        supplierCode: String(row.supplier_code),
        actor: actor.email,
        action: 'line_deleted',
        /* The whole row as it was, since the row itself is about to stop existing. */
        changes: Object.fromEntries(
          Object.entries(rowToValues(row)).map(([k, v]) => [k, [v, null]]),
        ) as Record<string, [unknown, unknown]>,
      });
      log.info('line.deleted', { id: row.id, by: actor.email });
      return { success: true };
    });
  } catch (err) {
    return fail(err, 'deleteServiceLine', { id });
  }
}

/* ─── suppliers ──────────────────────────────────────────────────────────────────────────── */

/**
 * Add a supplier, or change one's name and contact addresses.
 *
 * The code is the key and is not editable once saved: lines, links and codes all point at it.
 * A supplier entered under the wrong code is fixed by adding the right one and moving the lines.
 *
 * Suppliers are shared across countries, so `countryCode` here is only who is asking: the caller
 * must be a buyer or admin somewhere the register is edited, and the log records where from.
 */
export async function saveSupplier(input: {
  countryCode: string;
  draft: SupplierDraft;
  /** Present when editing; the code being edited. */
  existingCode?: string | null;
}): Promise<RegisterResult> {
  try {
    const country = clean(input?.countryCode);
    const actor = await requireEditor(country);

    const checked = checkSupplier(input.draft);
    if (!checked.ok) throw new Refusal('Some fields need attention.', asFieldErrors(checked.errors));
    const v = checked.value;

    return await inTransaction(async (client) => {
      const { rows: existing } = await client.query<QueryResultRow>(
        `SELECT code, name, contact_emails FROM rrsm_suppliers WHERE code = $1 FOR UPDATE`,
        [v.code],
      );
      const editing = clean(input?.existingCode);

      if (editing && editing !== v.code)
        throw new Refusal('A supplier’s code cannot be changed once saved.', {
          code: 'Fixed once saved.',
        });

      if (!editing && existing[0])
        throw new Refusal(`${v.code} is already on file as ${existing[0].name}.`, {
          code: `Already on file as ${existing[0].name}.`,
        });

      if (!existing[0]) {
        await client.query(
          `INSERT INTO rrsm_suppliers (code, name, contact_emails) VALUES ($1, $2, $3)`,
          [v.code, v.name, v.contactEmails],
        );
        await writeLog(client, {
          country,
          supplierCode: v.code,
          actor: actor.email,
          action: 'supplier_created',
          changes: { name: [null, v.name], contactEmails: [null, v.contactEmails] },
        });
        return { success: true };
      }

      const before = {
        name: String(existing[0].name),
        contactEmails: ((existing[0].contact_emails as string[] | null) ?? []).join(', '),
      };
      const after = { name: v.name, contactEmails: v.contactEmails.join(', ') };
      const changes = diffValues(before, after);
      if (!Object.keys(changes).length) return { success: true };

      await client.query(
        `UPDATE rrsm_suppliers SET name = $2, contact_emails = $3 WHERE code = $1`,
        [v.code, v.name, v.contactEmails],
      );
      await writeLog(client, {
        country,
        supplierCode: v.code,
        actor: actor.email,
        action: 'supplier_updated',
        changes,
      });
      return { success: true };
    });
  } catch (err) {
    return fail(err, 'saveSupplier', { code: input?.draft?.code });
  }
}
