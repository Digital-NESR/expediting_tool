import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllTiteCountries } from '@/app/actions/tite';
import { TITE_COUNTRY_VALUES } from '@/lib/tite-constants';
import { getToolScope } from '@/lib/tool-scope';
import NewShipmentClient from './NewShipmentClient';

export const metadata: Metadata = { title: 'NESR | Add Shipment - TI-TE' };

export default async function NewShipmentPage() {
  const session = await getServerSession(authOptions);
  const scope = getToolScope(session, 'tite');

  /* An admin picks from the canonical list plus anything already in the data; a
     scoped user may only create shipments for a country they can EDIT, so a
     view-only user is offered nothing. */
  let countryOptions: string[];
  if (scope.isAdmin) {
    const dbCountries = await getAllTiteCountries();
    countryOptions = [...new Set([...TITE_COUNTRY_VALUES, ...dbCountries])].sort();
  } else {
    countryOptions = scope.approvedCountries.filter((c) => scope.canEdit(c));
  }

  const creatorName = session?.user?.name ?? '';
  const creatorEmail = session?.user?.email ?? '';

  return (
    <NewShipmentClient
      countryOptions={countryOptions}
      isAdmin={scope.isAdmin}
      creatorName={creatorName}
      creatorEmail={creatorEmail}
    />
  );
}
