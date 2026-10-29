-- The declaration behind a "New Computer (Self)" request.
--
-- An existing employee receiving a company computer for the first time has no new-hire record
-- to point at and no old device to replace, so neither of the two existing paths fits: the New
-- Employee form is HR naming somebody else, and Upgrade/Replacement asks for the serial number
-- of a machine they do not have. The new request type is the third case, and the thing that
-- makes it answerable is the requester saying, on the record, that they have not had one
-- before.
--
-- A column rather than a line appended to `special_requirements`, because it is evidence. An
-- approver asked why this person is getting a first machine needs to see that the declaration
-- was made, by whom and when -- not find it buried in free text where it can be edited away
-- without trace.
--
-- Deliberately NOT cross-checked against this table's own history. Decided explicitly: a
-- laptop issued in 2019 and handed back is a legitimate case for this form, and the database
-- cannot tell that from a laptop still in someone's bag. The declaration stands on its own.
ALTER TABLE laptop_requests
  ADD COLUMN IF NOT EXISTS first_computer_declared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_computer_declared_by VARCHAR(320);

COMMENT ON COLUMN laptop_requests.first_computer_declared_at IS
  'When the requester declared they have never been assigned a company computer. Set only on '
  'request_type = ''New Computer (Self)''. Re-stamped on every edit, because the declaration '
  'is made against what was actually submitted and an edited request is not that.';

COMMENT ON COLUMN laptop_requests.first_computer_declared_by IS
  'The email of whoever ticked the declaration. Normally the requester; an admin backfilling a '
  'request on somebody''s behalf is the exception, and recording who makes the claim is the '
  'point of keeping it in a column rather than in free text.';
