import {
  getCountriesForAccessRequest,
  getMyCatalogAccessRequest,
} from '@/app/actions/catalog-manager';
import CatalogAccessGateClient from './CatalogAccessGateClient';

/**
 * What someone with no grant sees in place of Catalog Repo.
 *
 * Deliberately its own component rather than a redirect to the request-access route: the request
 * form lives under the same layout this gate is rendered from, so a redirect would bounce people
 * away from the one page that can help them. It also deliberately does NOT use
 * `CatalogManagerShell` -- the shell is the tool's chrome, with its navigation and its pending
 * count, and showing it to someone who cannot open any of it is a worse answer than a page that
 * states the position plainly.
 *
 * It reads the country list through `getCountriesForAccessRequest`, which needs a session and
 * nothing more. The guarded `getCountries` returns an empty list to exactly these people.
 */
export default async function CatalogAccessGate() {
  const [countries, myRequest] = await Promise.all([
    getCountriesForAccessRequest(),
    getMyCatalogAccessRequest(),
  ]);

  return (
    <CatalogAccessGateClient
      countries={countries.map((c) => ({ code: c.code, name: c.name, flag: c.flag ?? null }))}
      myRequest={myRequest}
    />
  );
}
