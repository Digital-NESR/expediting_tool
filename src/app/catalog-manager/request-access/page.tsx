import { redirect } from 'next/navigation';

/**
 * Kept as a redirect because the URL is in circulation — it was linked from the admin console and
 * from earlier emails — and a 404 is a poor answer to someone trying to ask for access.
 *
 * The form itself moved into the layout's gate (`CatalogAccessGate`), which is what anyone
 * without a grant now sees at /catalog-manager. Having it in two places meant two forms to keep
 * in step, and the one here offered a single country and an Approver option that is no longer
 * requestable at all.
 */
export default function CatalogRequestAccessPage() {
  redirect('/catalog-manager');
}
