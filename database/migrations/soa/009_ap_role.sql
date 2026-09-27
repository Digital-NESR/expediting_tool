-- migrate:no-transaction
-- Accounts Payable becomes a role people hold, not a column on the country.
--
-- Postgres refuses ALTER TYPE ... ADD VALUE inside a transaction block, so this file runs its
-- statements standalone and does nothing else. The seeding that uses the new value is 010, because
-- a value added in one transaction cannot be used by another until the first commits.
ALTER TYPE soa_user_role ADD VALUE IF NOT EXISTS 'ap';
