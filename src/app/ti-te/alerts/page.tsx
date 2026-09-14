import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getToolScope, toolReadScope } from '@/lib/tool-scope';
import { getAllShipments } from '@/app/actions/tite';
import AlertsClient from './AlertsClient';

export const metadata: Metadata = { title: 'NESR | Alerts - TI-TE' };

export default async function AlertsPage() {
  const session = await getServerSession(authOptions);
  /* Admin list and view-only come from the one shared definition — these pages
     used to parse ADMIN_EMAILS themselves and silently disagreed with the
     layout and the actions about who reads everything. */
  const scope = getToolScope(session, 'tite');
  const approvedCountries = toolReadScope(scope) ?? undefined;

  const shipments = await getAllShipments(approvedCountries);
  return <AlertsClient shipments={shipments} />;
}
