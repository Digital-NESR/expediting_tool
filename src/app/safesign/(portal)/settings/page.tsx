import { redirect } from 'next/navigation';
import { canManage, currentSafeSignActor } from '@/lib/safesign/access';
import { listTopics, listUsers } from '@/lib/safesign/read';
import SafeSignShell from '../../components/SafeSignShell';
import SettingsClient from './SettingsClient';

export default async function SettingsPage() {
  const actor = await currentSafeSignActor();
  if (!actor?.role) redirect('/login');
  const [topics, users] = await Promise.all([listTopics(true), actor.role === 'admin' ? listUsers() : Promise.resolve([])]);
  return (
    <SafeSignShell
      user={{ name: actor.name, email: actor.email, role: actor.role }}
      title="Topics & users"
      subtitle="Topics group communications on the dashboard. Users decide who can send and who can only view."
      width="narrow"
    >
      <SettingsClient topics={topics} users={users} canManage={canManage(actor)} isAdmin={actor.role === 'admin'} />
    </SafeSignShell>
  );
}
