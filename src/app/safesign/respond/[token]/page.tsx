import { getSupplierView } from '@/app/actions/safesign/supplier';
import RespondClient from './RespondClient';

export const metadata = { title: 'NESR | ComplyConnect' };
export const dynamic = 'force-dynamic';

/*
 * The supplier's page. No NESR account, no session, no layout gate: deliberately outside the
 * (portal) route group, and listed in PUBLIC_PATHS in src/proxy.ts. The token in the path and the
 * emailed code are the whole gate, and both are enforced in the actions rather than here.
 */
export default async function SafeSignRespondPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getSupplierView(token);
  return <RespondClient token={token} initial={view} />;
}
