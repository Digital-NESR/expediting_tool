import { getRrsmRegister, getRrsmScope } from '@/app/actions/rrsm/overview';
import { getRegisterEditor } from '@/app/actions/rrsm/register';
import { getRrsmRegistry } from '@/app/actions/rrsm/registry';
import RrsmRegisterClient from '../../RrsmRegisterClient';

export const dynamic = 'force-dynamic';

/** The country's Service Registry (shared with the Catalog): items, and the units on hire under them. */
export default async function RrsmRegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ country?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const scope = await getRrsmScope(sp.country ?? null);
  const [rows, editor, registry] = scope.country
    ? await Promise.all([
        getRrsmRegister(scope.country.code),
        getRegisterEditor(scope.country.code),
        getRrsmRegistry(scope.country.code, 'rental'),
      ])
    : [[], { canEdit: false, uoms: [], suppliers: [] }, { ok: true, items: [] }];
  return <RrsmRegisterClient scope={scope} rows={rows} editor={editor} registry={registry} />;
}
