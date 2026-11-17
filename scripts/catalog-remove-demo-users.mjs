/**
 * Remove the six fabricated demo accounts from Catalog Repo's `app_user` table.
 *
 *   node --env-file=.env scripts/catalog-remove-demo-users.mjs            # dry run
 *   node --env-file=.env scripts/catalog-remove-demo-users.mjs --apply
 *   node --env-file=.env scripts/catalog-remove-demo-users.mjs --rollback
 *
 * WHY. A fresh database used to be seeded with six invented @nesr.com accounts -- an Admin, two
 * Approvers and three others. The seed is gone from the code, but the rows it already created
 * are still here, and they stopped being harmless the day the access gate went live: before that
 * a row only decided what an admin saw, and now a row IS a grant. Nobody can sign in as them --
 * the addresses do not exist in Azure AD -- but they sit in the access list as six grants that
 * nobody issued, two of them at Approver.
 *
 * THE CASCADE IS THE POINT OF THE BACKUP. `country_approver.user_id` is ON DELETE CASCADE, so
 * deleting these six silently takes three `country_approver` rows with them. All three are
 * `is_active = false` -- superseded records of who used to approve UAE, Kuwait and Saudi Arabia
 * before the real approvers were set -- so no country loses a live approver. They are still
 * deleted history, and this repository has destroyed cascading children before by not checking.
 * Both tables are copied first and `--rollback` puts them back.
 */

import { Client } from 'pg';

const APPLY = process.argv.includes('--apply');
const ROLLBACK = process.argv.includes('--rollback');

const DEMO_EMAILS = [
  'layla.alrashid@nesr.com',
  'omar.haddad@nesr.com',
  'fatima.noor@nesr.com',
  'daniel.reyes@nesr.com',
  'khalid.mansour@nesr.com',
  'priya.menon@nesr.com',
];

function connect() {
  const sslFlag = (process.env.PGSSL ?? process.env.DB_SSL ?? '').toLowerCase();
  return new Client({
    host: process.env.POSTGRES_HOST ?? process.env.DB_HOST,
    port: Number(process.env.POSTGRES_PORT ?? process.env.DB_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? process.env.DB_USER,
    password: process.env.POSTGRES_PASSWORD ?? process.env.DB_PASSWORD,
    database: process.env.CATALOG_MANAGER_DB_NAME || 'catalog_manager_db',
    ssl:
      sslFlag === 'true' || sslFlag === 'require' || sslFlag === '1'
        ? { rejectUnauthorized: false }
        : false,
  });
}

async function main() {
  const c = connect();
  await c.connect();

  if (ROLLBACK) {
    const present = await c.query(`SELECT to_regclass('public.catalog_demo_user_backup') AS t`);
    if (!present.rows[0].t) {
      console.log('No catalog_demo_user_backup table — nothing to roll back.');
      await c.end();
      return;
    }
    await c.query('BEGIN');
    const users = await c.query(
      `INSERT INTO app_user (id, full_name, email, role, country_code, countries)
       SELECT id, full_name, email, role, country_code, countries FROM catalog_demo_user_backup
       ON CONFLICT (id) DO NOTHING`,
    );
    const approvers = await c.query(
      `INSERT INTO country_approver (id, user_id, country_code, spend_category_id, tier, is_active)
       SELECT id, user_id, country_code, spend_category_id, tier, is_active
         FROM catalog_demo_approver_backup
       ON CONFLICT (id) DO NOTHING`,
    );
    /* The id columns were written explicitly, so the sequences must be moved past them or the
       next real insert collides with a restored row. */
    await c.query(
      `SELECT setval(pg_get_serial_sequence('app_user','id'), GREATEST((SELECT MAX(id) FROM app_user), 1))`,
    );
    await c.query(
      `SELECT setval(pg_get_serial_sequence('country_approver','id'), GREATEST((SELECT MAX(id) FROM country_approver), 1))`,
    );
    await c.query('COMMIT');
    console.log(`Restored ${users.rowCount} users and ${approvers.rowCount} approver rows.`);
    await c.end();
    return;
  }

  const { rows: users } = await c.query(
    `SELECT id, full_name, email, role, country_code FROM app_user
      WHERE LOWER(email) = ANY($1) ORDER BY id`,
    [DEMO_EMAILS],
  );
  if (users.length === 0) {
    console.log('None of the six demo accounts are present. Nothing to do.');
    await c.end();
    return;
  }
  const ids = users.map((u) => u.id);

  const { rows: cascading } = await c.query(
    `SELECT ca.id, ca.country_code, ca.is_active, au.email
       FROM country_approver ca JOIN app_user au ON au.id = ca.user_id
      WHERE ca.user_id = ANY($1) ORDER BY ca.country_code`,
    [ids],
  );
  const { rows: liveRisk } = await c.query(
    `SELECT c.name
       FROM country c
       JOIN country_approver ca
         ON ca.country_code = c.code AND ca.spend_category_id IS NULL AND ca.is_active
      WHERE c.status = 'Active'
      GROUP BY c.name
     HAVING count(*) = count(*) FILTER (WHERE ca.user_id = ANY($1))`,
    [ids],
  );

  console.log(`accounts to remove (${users.length}):`);
  for (const u of users)
    console.log(`  ${String(u.id).padStart(3)}  ${u.role.padEnd(12)} ${u.email}`);
  console.log(`\ncountry_approver rows that cascade away (${cascading.length}):`);
  for (const r of cascading)
    console.log(
      `  ${String(r.id).padStart(3)}  ${r.country_code}  active=${r.is_active}  ${r.email}`,
    );

  if (liveRisk.length > 0) {
    console.log(
      `\nREFUSING: these countries would be left with no active approver: ${liveRisk
        .map((r) => r.name)
        .join(', ')}.`,
    );
    console.log('Assign a replacement in Admin -> Catalog Repo -> Country Approvers first.');
    await c.end();
    process.exitCode = 1;
    return;
  }
  console.log('\nNo country loses an active approver.');

  if (!APPLY) {
    console.log('\nDry run — nothing was written. Re-run with --apply.');
    await c.end();
    return;
  }

  await c.query('BEGIN');
  await c.query(
    `CREATE TABLE IF NOT EXISTS catalog_demo_user_backup
       (LIKE app_user INCLUDING DEFAULTS)`,
  );
  await c.query(
    `CREATE TABLE IF NOT EXISTS catalog_demo_approver_backup
       (LIKE country_approver INCLUDING DEFAULTS)`,
  );
  await c.query(`INSERT INTO catalog_demo_user_backup SELECT * FROM app_user WHERE id = ANY($1)`, [
    ids,
  ]);
  await c.query(
    `INSERT INTO catalog_demo_approver_backup SELECT * FROM country_approver WHERE user_id = ANY($1)`,
    [ids],
  );
  const del = await c.query(`DELETE FROM app_user WHERE id = ANY($1)`, [ids]);
  await c.query('COMMIT');

  console.log(
    `\nDeleted ${del.rowCount} accounts and, by cascade, ${cascading.length} approver rows.`,
  );
  console.log('Copies kept in catalog_demo_user_backup and catalog_demo_approver_backup.');
  console.log('Undo with --rollback.');
  await c.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
