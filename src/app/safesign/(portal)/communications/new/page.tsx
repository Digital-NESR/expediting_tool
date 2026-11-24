import { safesignPage } from '@/lib/safesign/page';
import { listTopics, listVendors } from '@/lib/safesign/read';
import SafeSignShell from '../../../components/SafeSignShell';
import NewCommunicationForm from './NewCommunicationForm';

export default async function NewCommunicationPage() {
  const { actor, country, shell } = await safesignPage();
  const [topics, vendors] = await Promise.all([listTopics(), listVendors(country.id, false)]);

  return (
    <SafeSignShell
      user={shell}
      title="New communication"
      subtitle={`For suppliers in ${country.name}. Choose the suppliers, attach the documents, and say what you need back and by when.`}
      width="narrow"
    >
      <NewCommunicationForm
        key={country.id}
        topics={topics}
        vendors={vendors}
        countryName={country.name}
        sender={{ name: actor.name, email: actor.email }}
      />
    </SafeSignShell>
  );
}
