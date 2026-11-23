-- RRSM 013: send recurrent-service reminders, per country, separately from showing the module.
--
-- HQ Dubai's services were loaded with 55 of 56 past expiry (the sheet held previous terms).
-- Switching the module on must not mail 55 "expired" reminders before buyers have corrected the
-- dates (user decision, 23 Nov 2026). So the reminders have their own switch, OFF by default, and
-- an admin turns it on once the register is right.

ALTER TABLE rrsm_countries
  ADD COLUMN IF NOT EXISTS recurrent_reminders BOOLEAN NOT NULL DEFAULT FALSE;
