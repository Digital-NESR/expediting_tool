import { getRrsmRegister, getRrsmScope } from '@/app/actions/rrsm/overview';
import RrsmRegisterClient from '../../RrsmRegisterClient';

export const dynamic = 'force-dynamic';

/** Every rented asset and recurrent service in the country, read-only. */
export default async function RrsmRegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ country?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const scope = await getRrsmScope(sp.country ?? null);
  const rows = scope.country ? await getRrsmRegister(scope.country.code) : [];
  return <RrsmRegisterClient scope={scope} rows={rows} />;
}
