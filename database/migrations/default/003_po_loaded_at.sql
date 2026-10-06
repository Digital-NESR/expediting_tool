/*
 * When each open-PO row arrived from SAP.
 *
 * `sap_open_po_master` carried twenty columns and not one timestamp, so there was no way to
 * answer "how fresh is this report". The dashboard's existing "Last updated 14:32" is the moment
 * the PAGE queried the database, which is a different fact and reads like this one: a buyer
 * looking at a stale report sees a recent time and has no reason to doubt it.
 *
 * The nearest thing available was `pg_stat_user_tables.last_autoanalyze`, which fires shortly
 * after a bulk insert and so trails a load by minutes. That is a database-maintenance artefact,
 * not a record: autovacuum is not guaranteed to run, and the first time it does not, the figure
 * is quietly wrong rather than absent.
 *
 * DEFAULT NOW() on purpose, so the n8n loader needs no change at all. It truncates and re-inserts
 * nightly, and every inserted row stamps itself. Nothing to remember, nothing to configure, and
 * no second place the freshness could come from.
 *
 * The rows already in the table take the migration's own timestamp, which is not when they
 * actually arrived. That is a lie with a life of one day: the next nightly load replaces every
 * row in this table, and with it every value in this column.
 */
ALTER TABLE sap_open_po_master
  ADD COLUMN IF NOT EXISTS loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

/* The dashboard asks for one value, the newest, over every row it can see. Without this that is
   a sequential scan of 22,000 rows on every page load, for a single line of text. */
CREATE INDEX IF NOT EXISTS idx_sap_open_po_master_loaded_at
  ON sap_open_po_master (loaded_at DESC);
