// Seeds the S&S Registry's Level 1 approvers (Country Supply Chain Managers)
// from ProcureGuard's approved SCM Managers.
//
//   node scripts/sns-seed-approvers.mjs          # apply
//   node scripts/sns-seed-approvers.mjs --dry    # show the mapping, write nothing
//
// Idempotent: one row per country, upserted on re-run. Safe to re-run after
// ProcureGuard's roster changes.
//
// The two registries do not name countries identically — ProcureGuard tracks
// commercial entities ("United Arab Emirates (UAE)", "Jordan, Kuwait"), the S&S
// Registry tracks the operating countries a record can be raised for. MAPPING
// below is that translation, and is deliberately explicit rather than fuzzy:
// assigning the wrong approver to a country is a silent, compliance-relevant
// failure, so every pairing is stated and anything unstated is skipped.

import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const dryRun = process.argv.includes('--dry');

const envPath = path.join(process.cwd(), '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i < 0) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[t.slice(0, i).trim()] ??= v;
}

/**
 * S&S country -> the ProcureGuard `country` value whose SCM Manager covers it.
 *
 * ProcureGuard countries not listed here (Chad, Indonesia, Malaysia, Jordan,
 * Qatar, Yemen) have no S&S counterpart and are ignored.
 */
const MAPPING = {
  'Algeria':         'Algeria',
  'Kuwait':          'Jordan, Kuwait',
  'Abu Dhabi (UAE)': 'United Arab Emirates (UAE)',
  'Iraq':            'Iraq',
  'KSA':             'Bahrain, Saudi Arabia (KSA)',
  'India':           'India',
  'HQ':              'HQ Dubai',
  'Bahrain':         'Bahrain, Saudi Arabia (KSA)',
  'Egypt':           'Egypt',
  'Libya':           'Libya',
  'Oman':            'Oman, Yemen',
  'EOS':             'EOS',
};

/**
 * Global is not an operating country and has no SCM Manager of its own, so it
 * cannot be derived — it is named directly. Aamil Shakri also covers HQ, which
 * is why the same person appears twice; the table is unique on country, not on
 * approver.
 */
const GLOBAL_APPROVER = { name: 'Aamil Shakri', email: 'ashakri@nesr.com' };

const base = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

// 1. Read ProcureGuard's approved SCM Managers.
const pg = new Client({ ...base, database: process.env.PROCURE_GUARD_DB_NAME ?? 'procureguard_db' });
await pg.connect();
const { rows: scmRows } = await pg.query(
  `SELECT user_email, display_name, country
     FROM procure_guard_access_requests
    WHERE COALESCE(approved_role, requested_role) = 'SCM Manager'
      AND status = 'Approved'`,
);
await pg.end();

const scmByCountry = new Map();
for (const r of scmRows) {
  if (r.country) scmByCountry.set(String(r.country), { name: String(r.display_name ?? ''), email: String(r.user_email) });
}

// 2. Resolve each S&S country against it.
const sns = new Client({ ...base, database: process.env.SnS_DB ?? 'sns_registry_db' });
await sns.connect();
const { rows: countryRows } = await sns.query(
  `SELECT code, name FROM sns_country WHERE active ORDER BY sort_order, name`,
);

const resolved = [];
const unresolved = [];

for (const row of countryRows) {
  const country = String(row.name);
  const code = String(row.code);
  if (country === 'Global') {
    resolved.push({ country, code, ...GLOBAL_APPROVER, source: 'named directly' });
    continue;
  }
  const pgCountry = MAPPING[country];
  if (!pgCountry) { unresolved.push({ country, why: 'no mapping defined' }); continue; }
  const scm = scmByCountry.get(pgCountry);
  if (!scm) { unresolved.push({ country, why: `no approved SCM Manager for "${pgCountry}"` }); continue; }
  resolved.push({ country, code, name: scm.name, email: scm.email, source: pgCountry });
}

console.log('=== Level 1 approvers to write ===');
console.table(resolved);
if (unresolved.length) {
  console.log('\n=== Not assigned ===');
  console.table(unresolved);
}

if (dryRun) {
  console.log('\nDry run — nothing written.');
  await sns.end();
  process.exit(0);
}

// 3. Upsert. One transaction, so a partial roster is never left behind.
await sns.query('BEGIN');
try {
  for (const r of resolved) {
    await sns.query(
      `INSERT INTO sns_country_manager (country_code, manager_name, manager_email, manager_title)
       VALUES ($1, $2, $3, 'Country Supply Chain Manager')
       ON CONFLICT (country_code) DO UPDATE
         SET manager_name  = EXCLUDED.manager_name,
             manager_email = EXCLUDED.manager_email,
             manager_title = EXCLUDED.manager_title,
             active        = TRUE,
             updated_at    = CURRENT_TIMESTAMP`,
      [r.code, r.name, r.email.toLowerCase()],
    );
  }
  await sns.query('COMMIT');
} catch (err) {
  await sns.query('ROLLBACK');
  throw err;
}

const { rows: final } = await sns.query(
  `SELECT m.country_code, c.name AS country, m.manager_name, m.manager_email, m.active
     FROM sns_country_manager m
     LEFT JOIN sns_country c ON c.code = m.country_code
    ORDER BY c.name`,
);
console.log(`\nWrote ${resolved.length} country managers. Table now holds:`);
console.table(final);

await sns.end();
