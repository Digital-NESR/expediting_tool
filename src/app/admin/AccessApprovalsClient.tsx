'use client';

import {
  getAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
  revokeAccess,
  editUserAccess,
  deleteAccessRequest,
} from '@/app/actions/adminAccess';
import { getCountries } from '@/app/actions/access';
import type { AccessRequestRow } from '@/app/actions/adminAccess';
import AccessRequestTable from './_components/AccessRequestTable';

/* The reviewer identity is taken from the session inside each server action, so this
   panel no longer passes (or needs) the signed-in user's email. */
export default function AccessApprovalsClient({
  onPendingCountChange,
}: {
  onPendingCountChange?: (count: number) => void;
}) {
  return (
    <AccessRequestTable<AccessRequestRow>
      title="Access Approvals"
      subtitle="Review and manage user access requests for country-level data."
      emptyPendingLabel="No pending access requests."
      emptyAllLabel="No access requests found."
      revokeConfirm={email => `Revoke access for ${email}?`}
      loadRequests={getAccessRequests}
      /* PO Expediting's country list is master data, so it is read from the server
         on mount rather than hard-coded. */
      loadOptions={getCountries}
      onApprove={(email, selected) => approveAccessRequest(email, selected)}
      onReject={rejectAccessRequest}
      onRevoke={revokeAccess}
      onEdit={(email, selected) => editUserAccess(email, selected)}
      onDelete={deleteAccessRequest}
      onPendingCountChange={onPendingCountChange}
    />
  );
}
