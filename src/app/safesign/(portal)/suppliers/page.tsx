import { safesignPage } from '@/lib/safesign/page';
import { supplierCategories, searchSuppliers } from '@/lib/safesign/suppliers';
import SafeSignShell from '../../components/SafeSignShell';
import SuppliersClient from './SuppliersClient';

/**
 * The supplier library for the country being worked on. Suppliers come from the SAP vendor
 * master; the page opens on this country's library, or on suppliers bought from in this country
 * when the library is still empty.
 */
export default async function SuppliersPage() {
  const { actor, country, shell } = await safesignPage();
  const [categories, library] = await Promise.all([
    supplierCategories(country.id),
    searchSuppliers({ countryId: country.id, scope: 'library' }),
  ]);
  const scope = library.total ? 'library' : 'bought';
  const first = scope === 'library' ? library : await searchSuppliers({ countryId: country.id, scope });

  return (
    <SafeSignShell
      user={shell}
      title="Supplier library"
      subtitle={`Suppliers from the SAP vendor master. Pick one to see and adjust who receives communications in ${country.name}.`}
    >
      <SuppliersClient
        key={country.id}
        countryName={country.name}
        categories={categories}
        initialScope={scope}
        initial={first}
        librarySize={library.total}
        me={{ name: actor.name, email: actor.email }}
      />
    </SafeSignShell>
  );
}
