import { getRrsmScope } from '@/app/actions/rrsm/overview';
import RenewalsPanel from '../../RenewalsPanel';
import RrsmShell, { RrsmNoCountry } from '../../components/RrsmShell';

export const dynamic = 'force-dynamic';

/** Contracts coming to an end, and the decision on each. Open to both roles; only buyers decide. */
export default async function RrsmRenewalsPage({
  searchParams,
}: {
  searchParams?: Promise<{ country?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const scope = await getRrsmScope(sp.country ?? null);

  return (
    <RrsmShell
      scope={scope}
      title="Renewals"
      subtitle={
        scope.canBuy
          ? 'Contracts ending in the next 90 days, with a year of actual use beside each. Decide whether to extend.'
          : 'Contracts ending in the next 90 days, with a year of actual use beside each. A buyer takes the decision.'
      }
    >
      {scope.country ? <RenewalsPanel countryCode={scope.country.code} /> : <RrsmNoCountry />}
    </RrsmShell>
  );
}
