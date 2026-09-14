import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getToolScope, toolReadScope } from '@/lib/tool-scope';
import { getShipmentsForList } from '@/app/actions/tite';
import ShipmentsClient from './ShipmentsClient';

export const metadata: Metadata = { title: 'NESR | Shipments - TI-TE' };

export default async function ShipmentsPage() {
  const session = await getServerSession(authOptions);
  /* Admin list, view-only and country scope all come from getToolScope: admins and
     view-only users read every country, everyone else only their approved ones. */
  const scope = getToolScope(session, 'tite');
  const titeViewOnly = scope.viewOnly;
  const approvedCountries = toolReadScope(scope) ?? undefined;

  const shipments = await getShipmentsForList(approvedCountries);
  return <ShipmentsClient shipments={shipments} viewOnly={titeViewOnly} />;
}
