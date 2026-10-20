-- Re-file the adhoc recipient rows against the step each role actually owns now.
--
-- Inserting SAP Team verification between the country SCM and the Supply Chain Director moved
-- the Director's adhoc step from `Approved by SCM` to `Verified by SAP Team`. The code knew
-- that (getProcureGuardWorkflowSteps). The recipient directory did not: 18 Supply Chain
-- Director rows were still filed against `Approved by SCM`.
--
-- What that cost: getProcureGuardNotificationRecipients matches a recipient when its stored
-- approval_status is the step's status OR its notification_role is the step's owner. The
-- Director rows satisfied the first half for the SAP TEAM's step, so every adhoc request
-- reaching `Approved by SCM` emailed the Director asking for a verification that is not theirs
-- and that they cannot perform. They were still correctly notified at their own step, by the
-- role half of the match, so nothing stalled — it was a wrong email, not a missing one.
UPDATE procure_guard_notification_recipients
   SET approval_status = 'Verified by SAP Team',
       updated_at = CURRENT_TIMESTAMP
 WHERE request_type = 'adhoc'
   AND notification_role = 'Supply Chain Director'
   AND approval_status = 'Approved by SCM';

-- The other half of the same slip. The first SAP Team rows were inserted by copying the
-- approval_status of an existing row with that role — of which there were none, this being the
-- first — so they landed with NULL. They are found today only because 'SAP Team' is in
-- GLOBAL_APPROVER_OWNER_LABELS and matches on the role half. Giving them their real status
-- means the row is correct on its own terms rather than by way of a second rule, and the
-- directory reads honestly to anyone looking at it.
--
-- Scoped to NULL so a row somebody has since filed deliberately against another status is left
-- where they put it.
UPDATE procure_guard_notification_recipients
   SET approval_status = 'Approved by SCM',
       updated_at = CURRENT_TIMESTAMP
 WHERE request_type = 'adhoc'
   AND notification_role = 'SAP Team'
   AND approval_status IS NULL;
