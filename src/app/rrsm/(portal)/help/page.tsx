/*
 * Help, inside the tool.
 *
 * Inside the (portal) route group, so it sits behind the same gate as the rest of RRSM: somebody
 * reading this from within the tool is already signed in, and the public copy at /help/rrsm covers
 * everyone else -- including suppliers, who have no NESR account.
 *
 * Same content component as the public page, for the same reason it is a component at all. It
 * draws its own heading, so the shell's banner is turned off here.
 */
import type { Metadata } from 'next';
import { getRrsmScope } from '@/app/actions/rrsm/overview';
import RrsmHelpContent from '@/app/rrsm/components/RrsmHelpContent';
import { readProcessCountries } from '@/lib/rrsm/process-countries';
import RrsmShell from '@/app/rrsm/components/RrsmShell';

export const metadata: Metadata = { title: 'NESR | Help & Training - RRSM' };
export const dynamic = 'force-dynamic';

export default async function RrsmHelpPage({
  searchParams,
}: {
  searchParams?: Promise<{ country?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  /* 'validator': somebody who only validates lines sent to them reads Help too. */
  const [scope, countries] = await Promise.all([
    getRrsmScope(sp.country ?? null, 'validator'),
    readProcessCountries(),
  ]);
  return (
    <RrsmShell scope={scope} title="Help & Training" hero={false} width="narrow">
      <div className="pb-12 pt-2">
        <RrsmHelpContent countries={countries} initialCountry={scope.country?.code ?? null} />
      </div>
    </RrsmShell>
  );
}
