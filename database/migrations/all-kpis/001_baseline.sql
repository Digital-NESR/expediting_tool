-- The Supply Chain Health Board's numbers. Rules: src/lib/health-board/RULES.md.
--
-- One row per KPI x year x period x country in kpi_values. Every file that ever fed it is a
-- kpi_loads row, every line of that file is kept in kpi_source_rows with what became of it, and
-- every value an upload replaced is kept in kpi_value_history. So any number on the board can be
-- traced to the line it came from, and nothing that was overwritten is lost.

CREATE TABLE IF NOT EXISTS kpi_loads (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('initial-load', 'upload')),
  file_name text NOT NULL,
  loaded_by text NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  rows_in_file integer NOT NULL,
  rows_added integer NOT NULL,
  rows_changed integer NOT NULL,
  rows_unchanged integer NOT NULL,
  rows_rejected integer NOT NULL,
  note text
);

CREATE TABLE IF NOT EXISTS kpi_values (
  id bigserial PRIMARY KEY,
  kpi text NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  period text NOT NULL CHECK (
    period IN ('Baseline', 'Target', 'YTD', 'January', 'February', 'March', 'April', 'May', 'June',
               'July', 'August', 'September', 'October', 'November', 'December')
  ),
  country text NOT NULL,
  country_raw text NOT NULL,
  -- numeric, not float: the value is stored exactly as it was written.
  value numeric,
  target_words text,
  category text NOT NULL,
  source_ref text,
  source_modified timestamptz,
  load_id bigint NOT NULL REFERENCES kpi_loads (id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  CONSTRAINT kpi_values_cell UNIQUE (kpi, year, period, country)
);

CREATE INDEX IF NOT EXISTS kpi_values_year ON kpi_values (year);

CREATE TABLE IF NOT EXISTS kpi_source_rows (
  id bigserial PRIMARY KEY,
  load_id bigint NOT NULL REFERENCES kpi_loads (id),
  line integer NOT NULL,
  cells jsonb NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('added', 'changed', 'unchanged', 'superseded', 'rejected')),
  reason text
);

CREATE INDEX IF NOT EXISTS kpi_source_rows_load ON kpi_source_rows (load_id);

CREATE TABLE IF NOT EXISTS kpi_value_history (
  id bigserial PRIMARY KEY,
  kpi text NOT NULL,
  year integer NOT NULL,
  period text NOT NULL,
  country text NOT NULL,
  old_value numeric,
  new_value numeric,
  old_target_words text,
  new_target_words text,
  old_category text,
  new_category text,
  load_id bigint NOT NULL REFERENCES kpi_loads (id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL
);

CREATE INDEX IF NOT EXISTS kpi_value_history_cell ON kpi_value_history (kpi, year, period, country);
