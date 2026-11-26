-- Approval before sending. A communication is saved and submitted for approval; the country's
-- supply chain manager approves it, then one final approver (either of them is enough); only
-- then can the sender email the suppliers. A rejection at either step carries a comment, which
-- is emailed to the sender.
--
-- The SCM per country is copied from ProcureGuard's approver matrix ("Country SCM"), so the two
-- tools start the same; from here it is kept in Admin, ComplyConnect, Approvers.

CREATE TABLE IF NOT EXISTS ss_approvers (
  id          BIGSERIAL   PRIMARY KEY,
  -- 'scm': the country's supply chain manager. 'final': the last approval, for every country.
  step        TEXT        NOT NULL CHECK (step IN ('scm', 'final')),
  country_id  VARCHAR(8)  REFERENCES ss_countries(id),
  email       TEXT        NOT NULL,
  name        TEXT,
  created_by  TEXT        NOT NULL DEFAULT 'migration',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((step = 'scm') = (country_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ss_approvers_unique
  ON ss_approvers (step, COALESCE(country_id, ''), LOWER(email));

INSERT INTO ss_approvers (step, country_id, email, name) VALUES
  ('scm', 'SA',  'wsharabash@nesr.com',  'Wael Sharabash'),
  ('scm', 'AUH', 'zfehri@nesr.com',      'Zied Fehri'),
  ('scm', 'HQ',  'ashakri@nesr.com',     'Aamil Shakri'),
  ('scm', 'EOS', 'jjose@nesr.com',       'Joby Jose'),
  ('scm', 'KW',  'taladwani@nesr.com',   'Talal Aladwani'),
  ('scm', 'OM',  'suhail.almoosa@gulfenergy-int.com', 'Suhail Jafar Al Moosa'),
  ('scm', 'IQ',  'msarem@nesr.com',      'Mazen Sarem'),
  ('scm', 'EG',  'myounis1@sapesco.com', 'Mohamed Younis'),
  ('scm', 'DZ',  'mcherchali@nesr.com',  'Mahmoud Cherchali'),
  ('scm', 'LY',  'mhbarat@nesr.com',     'Mohamed Hbarat'),
  ('scm', 'IN',  'spaul@nesr.com',       'Swegesh Chinnan Paul'),
  ('scm', 'ID',  'sdwiyanti@nesr.com',   'Shinta Dwiyanti'),
  ('final', NULL, 'ashakri@nesr.com',    'Aamil Shakri'),
  ('final', NULL, 'aaljamal@nesr.com',   'Ahmad Aljamal')
ON CONFLICT DO NOTHING;

-- Where the communication is in the chain. `status` stays draft until it is emailed.
ALTER TABLE ss_communications
  ADD COLUMN IF NOT EXISTS approval TEXT NOT NULL DEFAULT 'not_submitted'
    CHECK (approval IN ('not_submitted', 'pending_scm', 'pending_final', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS submitted_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scm_decided_by     TEXT,
  ADD COLUMN IF NOT EXISTS scm_decided_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_decided_by   TEXT,
  ADD COLUMN IF NOT EXISTS final_decided_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_step     TEXT,
  ADD COLUMN IF NOT EXISTS rejection_comment  TEXT;

-- Anything already emailed went out before approvals existed.
UPDATE ss_communications SET approval = 'approved' WHERE status <> 'draft' AND approval = 'not_submitted';

-- Approval history (submitted, approved, rejected) is kept on the communication's events.
CREATE INDEX IF NOT EXISTS ss_events_communication ON ss_events (communication_id);
