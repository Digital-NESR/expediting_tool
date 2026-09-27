-- Move the AP mailboxes out of countries.ap_email and into country_users.
--
-- A country has more than one AP contact -- Kuwait has two mailboxes in the source sheet, NESR
-- Kuwait and CPVEN Kuwait -- and who they are changes without a deployment. A single column could
-- hold neither fact. They now sit beside the champions in one list that /admin maintains and the
-- access-request flow adds to, and the outreach CC reads that list rather than a column.
--
-- Seeded from the "AP Group Emails" sheet of the SOA Format workbook. Names are the sheet's own
-- team names. These are group mailboxes rather than people, which is exactly why they belong in a
-- list an administrator curates: nobody can request access on behalf of a shared inbox.

-- One row per person per role per country. Without this, approving the same request twice, or an
-- admin adding somebody already there, silently duplicates them into the CC line.
CREATE UNIQUE INDEX IF NOT EXISTS country_users_unique
  ON country_users (LOWER(email), country_id, role);

INSERT INTO country_users (email, name, country_id, role)
SELECT v.email, v.name, v.country_id, 'ap'::soa_user_role
  FROM (VALUES
    ('invoices.ksa@nesr.com',              'Invoices KSA',                   'SA'),
    ('Payable.EOS@nesr.com',               'EOS Accounts Payable',           'EOS'),
    ('Payable.EOS@nesr.com',               'EOS Accounts Payable',           'DMCC'),
    ('ap.finance.oman@gulfenergy-int.com', 'Accounts Payable Finance Oman',  'OM'),
    ('ap.finance.oman@gulfenergy-int.com', 'Accounts Payable Finance Oman',  'YE'),
    ('Payable.algeria@nesr.com',           'Algeria Accounts Payable',       'DZ'),
    -- Both Kuwait mailboxes from the sheet; the second is the CPVEN entity.
    ('financeteam.kuwait@nesr.com',        'NESR Kuwait',                    'KW'),
    ('financeteam.kuwait@cpvenkuwait.com', 'CPVEN Kuwait',                   'KW'),
    ('financeteam.kuwait@nesr.com',        'NESR Kuwait',                    'JO'),
    ('finance.auh@nesr.com',               'Finance AUH',                    'AUH'),
    ('Payable.Egypt@nesr.com',             'Egypt Accounts Payable',         'EG'),
    ('Payable.iraq@nesr.com',              'Payable Iraq',                   'IQ'),
    ('accountspayable.dubai@nesr.com',     'Accounts Payable Finance Dubai', 'HQ'),
    ('Payable.Libya@nesr.com',             'Libya Accounts Payable',         'LY'),
    ('Payable.qatar@nesr.com',             'Payable Qatar',                  'QA'),
    ('Payable.Indonesia@nesr.com',         'Invoices Indonesia',             'ID'),
    ('Payable.India@nesr.com',             'India Accounts Payable',         'IN'),
    -- SSA covers both in the workbook's own filing; Chad and Congo have no mailbox of their own.
    ('Payable.SSA@nesr.com',               'SSA Accounts Payable',           'TD'),
    ('Payable.SSA@nesr.com',               'SSA Accounts Payable',           'CG')
  ) AS v(email, name, country_id)
 WHERE EXISTS (SELECT 1 FROM countries c WHERE c.id = v.country_id)
ON CONFLICT DO NOTHING;

-- The column it replaces. Keeping it would leave two answers to "where do we reply to?".
ALTER TABLE countries DROP COLUMN IF EXISTS ap_email;
