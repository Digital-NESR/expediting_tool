import { getRrsmRegister, getRrsmScope } from '@/app/actions/rrsm/overview';
import { getRegisterEditor } from '@/app/actions/rrsm/register';
import RrsmRegisterClient from '../../RrsmRegisterClient';

export const dynamic = 'force-dynamic';

/** Every rented asset and recurrent service in the country. Buyers and admins edit it here. */
export default async function RrsmRegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ country?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const scope = await getRrsmScope(sp.country ?? null);
  const [rows, editor] = scope.country
    ? await Promise.all([
        getRrsmRegister(scope.country.code),
        getRegisterEditor(scope.country.code),
      ])
    : [[], { canEdit: false, uoms: [], suppliers: [] }];
  return <RrsmRegisterClient scope={scope} rows={rows} editor={editor} />;
}
