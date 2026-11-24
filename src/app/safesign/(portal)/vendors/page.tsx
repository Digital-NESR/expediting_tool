import { redirect } from 'next/navigation';
import { canManage, currentSafeSignActor, shellUser } from '@/lib/safesign/access';
import { listVendors } from '@/lib/safesign/read';
import SafeSignShell from '../../components/SafeSignShell';
import VendorsClient from './VendorsClient';

export default async function VendorsPage() {
  const actor = await currentSafeSignActor();
  if (!actor?.role) redirect('/login');
  const vendors = await listVendors(true);
  return (
    <SafeSignShell
      user={shellUser(actor)}
      title="Vendor library"
      subtitle="Suppliers grouped by category of work, with who receives each communication (TO) and who is copied (CC)."
    >
      <VendorsClient vendors={vendors} canManage={canManage(actor)} />
    </SafeSignShell>
  );
}
