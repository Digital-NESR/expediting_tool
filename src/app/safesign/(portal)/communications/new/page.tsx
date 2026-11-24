import { redirect } from 'next/navigation';
import { canManage, currentSafeSignActor } from '@/lib/safesign/access';
import { listTopics, listVendors } from '@/lib/safesign/read';
import SafeSignShell, { Empty } from '../../../components/SafeSignShell';
import NewCommunicationForm from './NewCommunicationForm';

export default async function NewCommunicationPage() {
  const actor = await currentSafeSignActor();
  if (!actor?.role) redirect('/login');
  const user = { name: actor.name, email: actor.email, role: actor.role };
  if (!canManage(actor)) {
    return (
      <SafeSignShell user={user} title="New communication">
        <Empty title="Managers only" body="Viewers can read the dashboards. Ask a SafeSign administrator if you need to send communications." />
      </SafeSignShell>
    );
  }
  const [topics, vendors] = await Promise.all([listTopics(), listVendors(false)]);

  return (
    <SafeSignShell
      user={user}
      title="New communication"
      subtitle="Choose the suppliers, attach the documents, and say what you need back and by when."
      width="narrow"
    >
      <NewCommunicationForm topics={topics} vendors={vendors} />
    </SafeSignShell>
  );
}
