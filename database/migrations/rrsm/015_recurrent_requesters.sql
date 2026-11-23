-- A recurrent service can have several requester-validators.
--
-- `requesters` is the list, as JSON [{ "name": "...", "email": "..." }], in the order the buyer
-- gave. Any one of them decides on the renewal, gets the reminders and has access to RRSM.
--
-- requester_name / requester_email stay, always holding the first of the list, so anything that
-- still reads one requester (and a rollback of the app) keeps working.

ALTER TABLE rrsm_recurrent_services
  ADD COLUMN IF NOT EXISTS requesters JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE rrsm_recurrent_services
   SET requesters = jsonb_build_array(jsonb_build_object(
         'name', COALESCE(requester_name, ''),
         'email', lower(COALESCE(requester_email, ''))))
 WHERE requesters = '[]'::jsonb
   AND (COALESCE(requester_name, '') <> '' OR COALESCE(requester_email, '') <> '');
