import { getRrsmScope } from '@/app/actions/rrsm/overview';
import InvitationsPanel from '../../InvitationsPanel';
import RrsmShell, { RrsmNoCountry } from '../../components/RrsmShell';

export const dynamic = 'force-dynamic';

/** The month's invitations: buyers send them, Ops and buyers see who has answered. */
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
      title="Supplier validation"
      subtitle="Send each supplier this month's submission link, choose which documents they must upload, and see who has answered. Suppliers confirm their lines before Ops validate them."
    >
      {!scope.country ? <RrsmNoCountry /> : <InvitationsPanel countryCode={scope.country.code} />}
    </RrsmShell>
  );
}
