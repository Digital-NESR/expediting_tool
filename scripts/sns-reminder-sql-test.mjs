// Throwaway: exercises the n8n fetch query against the live schema, inside a
// transaction that is always rolled back. Creates a record, walks its expiry
// date across the whole ladder, and checks exactly one rung fires per position.
import fs from 'node:fs';
import { Client } from 'pg';

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('='); if (i < 0) continue;
  let v = t.slice(i + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[t.slice(0, i).trim()] ??= v;
}

const c = new Client({
  host: process.env.DB_HOST, port: 5432, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
  database: process.env.SnS_DB,
});
await c.connect();

const FETCH = fs.readFileSync('database/sns_reminder_queries.sql', 'utf8')
  .split('-- [2]')[0]
  .split('WITH live AS');
const base = 'WITH live AS' + FETCH[1].split('ORDER BY g.days_left;')[0] + 'ORDER BY g.days_left';
// Real life holds expiry_date still and lets the clock move. Swap CURRENT_DATE
// for a parameter so the test can walk "today" forward without touching the
// record — moving expiry_date instead would change cycle_expiry every step,
// which is exactly the key that stops a rung being sent twice.
const query = base.replaceAll('CURRENT_DATE', '($1)::date');

await c.query('BEGIN');
try {
  const rec = await c.query(
    `INSERT INTO sns_record (registry_id, classification, country, country_code, scope_level,
        supplier_id, supplier_name, base_status, expiry_date, created_by)
     VALUES ('TEST-SQL-0001','SGL','Kuwait','KWT','Family','999','SQL Test Supplier',
             'Active', DATE '2027-01-01', 'tester@nesr.com')
     RETURNING rid`);
  const rid = rec.rows[0].rid;
  await c.query(
    `INSERT INTO sns_record_node (record_rid, category, sub_category, family, commodity)
     VALUES ($1,'Chemicals','Commodities Chemicals','Cement','Class G Cement')`, [rid]);

  const EXPIRY = new Date(Date.UTC(2027, 0, 1));
  const dayAt = (daysLeft) => new Date(EXPIRY.getTime() - daysLeft * 86400000).toISOString().slice(0, 10);

  const fired = [];
  // Walk "today" from 70 days out to 60 days overdue, one day at a time,
  // sending whatever is due and logging it, exactly as the workflow would.
  for (let d = 70; d >= -60; d--) {
    const { rows } = await c.query(query, [dayAt(d)]);
    const mine = rows.filter(r => r.rid === rid);
    if (mine.length > 1) { console.log(`FAIL: ${mine.length} rows at day ${d}`); break; }
    if (mine.length === 1) {
      const r = mine[0];
      fired.push([d, r.days_before_expiry]);
      await c.query(
        `INSERT INTO sns_notification_log (record_rid, days_before_expiry, cycle_expiry, status, recipients)
         VALUES ($1,$2,$3,'sent',$4)
         ON CONFLICT (record_rid, cycle_expiry, days_before_expiry) DO NOTHING`,
        [rid, r.days_before_expiry, r.expiry_date, [r.requestor_email]]);
    }
  }

  console.log('Rungs fired (day-of-run -> days_before_expiry):');
  console.log(fired.map(([d, m]) => `${d >= 0 ? ' ' : ''}${d} -> ${m}`).join('\n'));
  console.log('\nRung sequence:', fired.map(f => f[1]).join(', '));

  // Renewal: push expiry a year out. Every rung must become eligible again.
  await c.query(`UPDATE sns_record SET expiry_date = DATE '2028-01-01' WHERE rid = $1`, [rid]);
  // Rung 60 was already sent for the old cycle. If cycle_expiry did not key the
  // log, this would stay silent forever — it must fire again under the new date.
  const NEW_EXPIRY = new Date(Date.UTC(2028, 0, 1));
  const newDayAt = (dl) => new Date(NEW_EXPIRY.getTime() - dl * 86400000).toISOString().slice(0, 10);
  const after = await c.query(query, [newDayAt(60)]);
  const mine = after.rows.filter(r => r.rid === rid);
  console.log('\nAfter renewal, 60 days before the NEW expiry, due rung:',
    mine.length ? mine[0].days_before_expiry : 'NONE  <-- BUG: ladder did not restart');

  // Closing must silence it.
  await c.query(`UPDATE sns_record SET base_status='Closed' WHERE rid=$1`, [rid]);
  const closed = await c.query(query, [dayAt(-60)]);
  console.log('After closing, rows for this record:', closed.rows.filter(r => r.rid === rid).length);

  // Shape check on the payload the Code node will consume.
  await c.query(`UPDATE sns_record SET base_status='Active', expiry_date = DATE '2027-01-01' WHERE rid=$1`, [rid]);
  await c.query(`DELETE FROM sns_notification_log WHERE record_rid=$1`, [rid]);
  const sample = (await c.query(query, [dayAt(30)])).rows.filter(r => r.rid === rid)[0];
  console.log('\nSample row for the Code node:');
  console.log(JSON.stringify(sample, null, 2));
} finally {
  await c.query('ROLLBACK');
  await c.end();
  console.log('\n(rolled back — nothing written)');
}
