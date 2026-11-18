import { getRrsmScope } from '@/app/actions/rrsm/overview';
import InvitationsPanel from '../../InvitationsPanel';
import RrsmShell, { RrsmNoCountry, RrsmNotYourRole } from '../../components/RrsmShell';

export const dynamic = 'force-dynamic';

/** Ops' chase: who has been sent this month's link, and who has answered. */
export default async function RrsmSuppliersPage({
  searchParams,
}: {
  searchParams?: Promise<{ country?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const scope = await getRrsmScope(sp.country ?? null);

  return (
    <RrsmShell
      scope={scope}
      title="Supplier invitations"
      subtitle="Send each supplier this month's submission link and see who has answered. Suppliers confirm their own lines before Ops validate them."
    >
      {!scope.country ? (
        <RrsmNoCountry />
      ) : !scope.canValidate ? (
        <RrsmNotYourRole what="Inviting suppliers" />
      ) : (
        <InvitationsPanel countryCode={scope.country.code} />
      )}
    </RrsmShell>
  );
}
