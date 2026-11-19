-- RRSM 010: reminders to suppliers who were invited and have not submitted.
--
-- Sent by a buyer from the Supplier validation page, one supplier or all of them at once; there
-- is no automatic reminder (user decision, 19 Nov 2026). The link records the last one and how
-- many, so the page can say "Reminded 21 Nov (2)" and nobody chases twice in a morning.

ALTER TABLE rrsm_supplier_links
  ADD COLUMN IF NOT EXISTS reminded_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0;
