-- SafeSign has two kinds of user, not three: senders (people like the sourcing team, who send
-- communications and do everything else in the tool) and admins (set in the environment, who
-- also decide who has access). The manager/viewer split in 001 is gone: everyone in ss_users is
-- a sender.

ALTER TABLE ss_users DROP CONSTRAINT IF EXISTS ss_users_role_check;
UPDATE ss_users SET role = 'sender' WHERE role <> 'sender';
ALTER TABLE ss_users ALTER COLUMN role SET DEFAULT 'sender';
ALTER TABLE ss_users ADD CONSTRAINT ss_users_role_check CHECK (role = 'sender');
