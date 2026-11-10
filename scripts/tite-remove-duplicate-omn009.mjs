/**
 * Remove the duplicated TI-TE shipment OMN-009, the migration copy of OMN-030.
 *
 *   node --env-file=.env scripts/tite-remove-duplicate-omn009.mjs            # dry run
 *   node --env-file=.env scripts/tite-remove-duplicate-omn009.mjs --apply
 *   node --env-file=.env scripts/tite-remove-duplicate-omn009.mjs --rollback
 *
 * WHY THE DUPLICATE EXISTS, AND WHY NOTHING CAUGHT IT. Both rows are the same shipment: same
 * invoice number (NESR-3509-OIL&GAS-2025) and the same invoice value (140,384.72). OMN-009 was
 * written by the Oman migration on 09 Jun 2026; OMN-030 was entered by hand on 01 Sep 2026.
 * They never collided because OMN-030's customs reference carries a trailing TAB --
 * `DECTIM04062510850058\t`, 21 characters against 20 -- so every exact comparison, including any
 * duplicate check, saw two different references. It is the only such value in the table.
 *
 * WHY OMN-009 IS THE ONE TO GO. It holds nothing: no documents and no activity. OMN-030 is the
 * live record with 5 documents and 2 activity entries behind it.
 *
 * THE CASCADE IS WHY THIS IS A SCRIPT AND NOT A DELETE. Four tables reference `shipments` with
 * ON DELETE CASCADE -- documents, activity log, notification contacts and notification log -- and
 * a TI-TE delete has destroyed 8 attachments here before by not looking first. OMN-009 takes 2
 * notification contacts and 3 notification-log rows with it. Those are the record that three
 * emails were actually sent, so every one is copied out before the delete and `--rollback` puts
 * the whole thing back.
 *
 * It also trims the stray tab on OMN-030, so the reference it keeps is the one people search for.
 */

import { Client } from 'pg';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');

const DOOMED = 'OMN-009';
const KEEPER = 'OMN-030';
const SUFFIX = 'bak_dup_omn009';

function connect() {
  const sslFlag = (process.env.PGSSL ?? process.env.DB_SSL ?? '').toLowerCase();
  return new Client({
    host: process.env.POSTGRES_HOST ?? process.env.DB_HOST,
    port: Number(process.env.POSTGRES_PORT ?? process.env.DB_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? process.env.DB_USER,
    password: process.env.POSTGRES_PASSWORD ?? process.env.DB_PASSWORD,
    database: process.env.TITE_DB_NAME || 'nesr_tite_db',
    ssl:
      sslFlag === 'true' || sslFlag === 'require' || sslFlag === '1'
        ? { rejectUnauthorized: false }
        : false,
  });
}

/** Every table that cascades off `shipments`, so each is copied before the parent goes. */
const CHILDREN = [
  'shipment_documents',
  'shipment_activity_log',
  'shipment_notification_contacts',
  'notification_log',
];

async function main() {
  const c = connect();
  await c.connect();

  if (ROLLBACK) {
    const present = await c.query(`SELECT to_regclass($1) AS t`, [`public.shipments_${SUFFIX}`]);
    if (!present.rows[0].t) {
      console.log(`No shipments_${SUFFIX} table — nothing to roll back.`);
      await c.end();
      return;
    }
    await c.query('BEGIN');
    const ship = await c.query(
      `INSERT INTO shipments SELECT * FROM shipments_${SUFFIX} ON CONFLICT (id) DO NOTHING`,
    );
    let restored = 0;
    for (const child of CHILDREN) {
      const r = await c.query(
        `INSERT INTO ${child} SELECT * FROM ${child}_${SUFFIX} ON CONFLICT (id) DO NOTHING`,
      );
      restored += r.rowCount ?? 0;
    }
    await c.query(
      `SELECT setval(pg_get_serial_sequence('shipments','id'), GREATEST((SELECT MAX(id) FROM shipments), 1))`,
    );
    await c.query('COMMIT');
    console.log(`Restored ${ship.rowCount} shipment and ${restored} child rows.`);
    await c.end();
    return;
  }

  const { rows: both } = await c.query(
    `SELECT id, reference_number, country, segment, from_country, to_country, mot,
            invoice_number, invoice_value_usd, deposit_usd, import_date, expiry_date,
            status, created_by, customs_reference_number,
            length(customs_reference_number) AS customs_len
       FROM shipments WHERE reference_number = ANY($1) ORDER BY created_at`,
    [[DOOMED, KEEPER]],
  );
  const doomed = both.find((r) => r.reference_number === DOOMED);
  const keeper = both.find((r) => r.reference_number === KEEPER);

  if (!doomed) {
    console.log(`${DOOMED} is not present. Nothing to do.`);
    await c.end();
    return;
  }
  if (!keeper) {
    console.log(`REFUSING: ${KEEPER} is missing, so ${DOOMED} may be the only copy left.`);
    await c.end();
    process.exitCode = 1;
    return;
  }

  /* The two must still look like the same shipment. If someone has edited one of them since this
     was written, deleting on yesterday's reasoning would destroy a record that is no longer a
     duplicate. */
  if (
    (doomed.invoice_number ?? '') !== (keeper.invoice_number ?? '') ||
    String(doomed.invoice_value_usd) !== String(keeper.invoice_value_usd)
  ) {
    console.log('REFUSING: these no longer agree on invoice number and value.');
    console.table(both);
    await c.end();
    process.exitCode = 1;
    return;
  }

  const counts = {};
  for (const child of CHILDREN) {
    const r = await c.query(`SELECT count(*)::int AS n FROM ${child} WHERE shipment_id = $1`, [
      doomed.id,
    ]);
    counts[child] = r.rows[0].n;
  }
  const keeperCounts = {};
  for (const child of CHILDREN) {
    const r = await c.query(`SELECT count(*)::int AS n FROM ${child} WHERE shipment_id = $1`, [
      keeper.id,
    ]);
    keeperCounts[child] = r.rows[0].n;
  }

  console.log('deleting:');
  console.log(
    `  ${doomed.reference_number} (id ${doomed.id}) — created by ${doomed.created_by}, deposit ${doomed.deposit_usd}`,
  );
  console.log('keeping:');
  console.log(
    `  ${keeper.reference_number} (id ${keeper.id}) — created by ${keeper.created_by}, deposit ${keeper.deposit_usd}`,
  );
  console.log('\nrows that cascade away with the deleted shipment:');
  for (const child of CHILDREN)
    console.log(
      `  ${child.padEnd(32)} ${counts[child]}   (kept record has ${keeperCounts[child]})`,
    );

  if (counts.shipment_documents > 0) {
    console.log(
      `\nREFUSING: ${DOOMED} holds ${counts.shipment_documents} document(s). This script is only for the empty migration copy.`,
    );
    await c.end();
    process.exitCode = 1;
    return;
  }

  const needsTrim = keeper.customs_reference_number !== keeper.customs_reference_number.trim();
  if (needsTrim)
    console.log(
      `\nwill also trim ${KEEPER}'s customs reference: ${keeper.customs_len} chars -> ${keeper.customs_reference_number.trim().length}`,
    );

  if (!APPLY) {
    console.log('\nDry run — nothing was written. Re-run with --apply.');
    await c.end();
    return;
  }

  await c.query('BEGIN');
  await c.query(
    `CREATE TABLE IF NOT EXISTS shipments_${SUFFIX} (LIKE shipments INCLUDING DEFAULTS)`,
  );
  await c.query(`INSERT INTO shipments_${SUFFIX} SELECT * FROM shipments WHERE id = $1`, [
    doomed.id,
  ]);
  for (const child of CHILDREN) {
    await c.query(
      `CREATE TABLE IF NOT EXISTS ${child}_${SUFFIX} (LIKE ${child} INCLUDING DEFAULTS)`,
    );
    await c.query(`INSERT INTO ${child}_${SUFFIX} SELECT * FROM ${child} WHERE shipment_id = $1`, [
      doomed.id,
    ]);
  }
  const del = await c.query(`DELETE FROM shipments WHERE id = $1`, [doomed.id]);
  if (needsTrim)
    await c.query(
      `UPDATE shipments SET customs_reference_number = btrim(customs_reference_number, E' \\t\\r\\n') WHERE id = $1`,
      [keeper.id],
    );
  await c.query('COMMIT');

  console.log(`\nDeleted ${del.rowCount} shipment and its cascading rows.`);
  console.log(`Copies kept in shipments_${SUFFIX} and <child>_${SUFFIX}. Undo with --rollback.`);
  await c.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
