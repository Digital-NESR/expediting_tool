import { safesignPage } from '@/lib/safesign/page';
import { librarySuppliers, searchSuppliers } from '@/lib/safesign/suppliers';
import SafeSignShell from '../../components/SafeSignShell';
import SuppliersClient from './SuppliersClient';

/**
 * The supplier library for the country being worked on: active suppliers from the SAP vendor
 * master on one side, this country's library on the other. A supplier is dragged into the library
 * before its TO and CC can be edited.
 */
export default async function SuppliersPage() {
  const { actor, country, shell } = await safesignPage();
  const [initial, library] = await Promise.all([
    searchSuppliers({ countryId: country.id }),
    librarySuppliers(country.id),
  ]);

  return (
    <SafeSignShell
      user={shell}
      title="Supplier library"
      subtitle={`Drag active SAP suppliers into the ${country.name} library, then set who receives communications.`}
    >
      <SuppliersClient
        key={country.id}
        countryName={country.name}
        initial={initial}
        initialLibrary={library}
        me={{ name: actor.name, email: actor.email }}
      />
    </SafeSignShell>
  );
}
