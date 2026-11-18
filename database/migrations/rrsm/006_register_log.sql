-- Who changed the register, and what they changed.
--
-- The register is where rates live, and a rate is money: "who moved this from 250 to 310, and
-- when" is a question an auditor asks and the row itself cannot answer, because it only holds the
-- current value. `rrsm_activity_log` is about cycle lines and stages, so the register gets its own
-- trail rather than a second meaning squeezed into that one.
--
-- `changes` holds only the fields that moved, as {"field": [before, after]}, so a log of a
-- one-field edit reads as one field and not as a copy of the whole row.
--
-- No foreign key to rrsm_service_lines: a line created by mistake can be deleted (only while no
-- cycle refers to it), and the record that it existed and who removed it should outlive it.
CREATE TABLE IF NOT EXISTS rrsm_register_log (
  id              BIGSERIAL PRIMARY KEY,
  country_code    TEXT,
  service_line_id INTEGER,
  supplier_code   TEXT,
  actor           TEXT NOT NULL,
  action          TEXT NOT NULL
                  CHECK (action IN ('line_created', 'line_updated', 'line_off_hired',
                                    'line_reinstated', 'line_deleted',
                                    'supplier_created', 'supplier_updated')),
  changes         JSONB NOT NULL DEFAULT '{}'::JSONB,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rrsm_register_log_line
  ON rrsm_register_log (service_line_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rrsm_register_log_country
  ON rrsm_register_log (country_code, created_at DESC);
