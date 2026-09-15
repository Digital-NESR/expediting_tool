'use client';

import {
  getTiteAccessRequests,
  approveTiteAccess,
  rejectTiteAccess,
  revokeTiteAccess,
  editTiteAccess,
  deleteTiteAccessRequest,
} from '@/app/actions/tite';
import type { TiteAccessRequestRow } from '@/app/actions/tite';
import { TITE_COUNTRY_VALUES, TITE_VIEW_ALL_COUNTRIES } from '@/lib/tite-constants';
import AccessRequestTable from './_components/AccessRequestTable';

/* ─── Static country list ───────────────────────────────────────

   Unlike PO Expediting, TI-TE does not read its country list from the server. The
   canonical operating countries, plus the read-everything sentinel, are written to
   `access_requests.approved_countries` and compared against `shipments.country`, so
   they have to be the same list the app and the migration use — an approval written
   in a different spelling silently matches nothing. */
const TITE_FALLBACK_COUNTRIES = [
  TITE_VIEW_ALL_COUNTRIES,
  ...TITE_COUNTRY_VALUES,
];

/* The reviewer identity is taken from the session inside each server action, so this
   panel no longer passes (or needs) the signed-in user's email. */
export default function TiteAccessApprovalsClient({
  onPendingCountChange,
}: {
  onPendingCountChange?: (count: number) => void;
}) {
  return (
    <AccessRequestTable<TiteAccessRequestRow>
      title="TI-TE Access Approvals"
      subtitle="Review and manage user access requests for TI-TE country-level data."
      emptyPendingLabel="No pending TI-TE access requests."
      emptyAllLabel="No TI-TE access requests found."
      revokeConfirm={email => `Revoke TI-TE access for ${email}?`}
      loadRequests={getTiteAccessRequests}
      options={TITE_FALLBACK_COUNTRIES}
      /* TI-TE's approve takes an object and carries a reviewer `notes` field the
         panel does not expose yet. */
      onApprove={(email, selected) =>
        approveTiteAccess({ userEmail: email, approvedCountries: selected, notes: null })
      }
      onReject={rejectTiteAccess}
      onRevoke={revokeTiteAccess}
      onEdit={(email, selected) => editTiteAccess(email, selected)}
      onDelete={deleteTiteAccessRequest}
      onPendingCountChange={onPendingCountChange}
    />
  );
}
