import { getRrsmSubmission } from '@/app/actions/rrsm/supplier';
import SubmitClient from './SubmitClient';

export const metadata = { title: 'NESR | Monthly submission' };
export const dynamic = 'force-dynamic';

/*
 * The supplier's submission page. No NESR account, no session, no layout gate.
 *
 * Deliberately OUTSIDE the (portal) route group: the layout in there redirects anyone without an
 * RRSM grant, which would bounce every supplier to /login. `/rrsm/submit` is listed in
 * PUBLIC_PATHS in src/proxy.ts for the same reason, so nothing upstream stands between a
 * stranger and this page — the token in the path and the emailed code are the whole of the gate,
 * and both are enforced in the actions rather than here.
 */
export default async function RrsmSubmitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  /* Resolved on the server so the first paint already says whose submission this is, and so a
     token that is not ours renders the same refusal as one that has expired. */
  const view = await getRrsmSubmission(token);
  return <SubmitClient token={token} initial={view} />;
}
