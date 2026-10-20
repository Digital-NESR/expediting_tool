-- Per-country deadlines, and a record of a country's status being moved by hand.

-- ── 1. A country's own dates ────────────────────────────────────────────────────────────────
--
-- The cycle's two dates were the only ones there were, and they are the right default: a
-- quarter is opened once, with one collection deadline and one closing deadline for everybody.
-- What it could not express is the ordinary case of one country needing another fortnight while
-- the other twelve close on time. The only lever was to move the cycle, which moves it for all
-- thirteen and tells twelve countries they have longer than they do.
--
-- A separate table rather than two nullable columns on `country_cycles`, for one reason:
-- `country_cycles` is the record that a country has ENROLLED in the quarter. Putting a date on
-- it would mean giving a country a deadline before it has started requires inventing an
-- enrolment, and `scoped` / `not_started` are distinctions the rollup depends on. Here an
-- override is just a date with a country's name on it, and it can be set the day the cycle
-- opens for a country that will not scope until next week.
--
-- NULL in either column means "inherit the cycle's". A row may legitimately hold one override
-- and one NULL: a country given longer to collect usually still closes with everyone else.
CREATE TABLE IF NOT EXISTS country_cycle_deadlines (
  cycle_id            BIGINT      NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  country_id          VARCHAR(16) NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  submission_deadline DATE,
  cycle_deadline      DATE,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by          VARCHAR(320) NOT NULL,
  PRIMARY KEY (cycle_id, country_id),
  -- The same rule the cycle itself is held to: statements have to be in before a country can be
  -- closed. Only checkable when both overrides are present; a mixed row is checked in the action
  -- against whichever date it is inheriting.
  CONSTRAINT country_cycle_deadlines_order_check
    CHECK (submission_deadline IS NULL OR cycle_deadline IS NULL
           OR cycle_deadline >= submission_deadline)
);

COMMENT ON TABLE country_cycle_deadlines IS
  'Per-country overrides of a cycle''s two deadlines. NULL inherits the cycle''s date. Read '
  'through the helpers in src/lib/soa/deadlines.ts, never by reading cycles.* directly in a '
  'query that has a country in hand.';

-- ── 2. Which country a recorded date change was for ─────────────────────────────────────────
--
-- `cycle_deadline_changes` is the audit trail for "these dates moved and here is why". It now
-- has to carry per-country moves as well. NULL keeps its existing meaning — the change was made
-- to the cycle, so it applied to every country that had not overridden it — and every row
-- written before today is exactly that.
ALTER TABLE cycle_deadline_changes
  ADD COLUMN IF NOT EXISTS country_id VARCHAR(16) REFERENCES countries(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cycle_deadline_changes_country
  ON cycle_deadline_changes (cycle_id, country_id);

COMMENT ON COLUMN cycle_deadline_changes.country_id IS
  'The country whose own deadline moved. NULL means the change was made to the cycle and so '
  'applied to every country without an override of its own.';

-- ── 3. A country's status, moved by an administrator ────────────────────────────────────────
--
-- Status normally only advances, driven by the work: scoping sets it, sending sets it, handing
-- off sets it. Handoff is the one that cannot be undone from inside the tool, and it is the one
-- that needs undoing — a country hands off, then finds more suppliers worth chasing, and the
-- quarter is closed to them. Saudi Arabia is in that position today.
--
-- Reverting is therefore an administrator's act and not a champion's, and it is recorded like
-- one. The reason is required and kept beside the two statuses, because "this country was
-- reopened after handoff" is precisely the kind of thing a reader of the evidence pack must not
-- have to infer from a gap in the timestamps.
CREATE TABLE IF NOT EXISTS country_cycle_status_changes (
  id          BIGSERIAL PRIMARY KEY,
  cycle_id    BIGINT      NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  country_id  VARCHAR(16) NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by  VARCHAR(320) NOT NULL,
  reason      TEXT        NOT NULL,
  old_status  TEXT        NOT NULL,
  new_status  TEXT        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_country_cycle_status_changes_lookup
  ON country_cycle_status_changes (cycle_id, country_id, changed_at DESC);

COMMENT ON TABLE country_cycle_status_changes IS
  'Administrator overrides of country_cycles.status, most often reopening a country after '
  'handoff. The statuses are stored as TEXT rather than the enum so a label retired from the '
  'enum later still reads back as what was actually recorded.';
