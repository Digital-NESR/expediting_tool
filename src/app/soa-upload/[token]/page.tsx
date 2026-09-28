import { getSoaUploadState } from '@/app/actions/soa/upload';
import SoaUploadClient from './SoaUploadClient';

/**
 * The page a supplier reaches from the link in their statement request.
 *
 * Public: there is no NESR account behind it and there should not be. What stands in for one is
 * the link, which names the vendor, plus a code sent to an address the request itself went to.
 *
 * Dynamic, and deliberately never cached. The state includes whether this browser has verified,
 * which is per visitor.
 */
export const dynamic = 'force-dynamic';

export default async function SoaUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const res = await getSoaUploadState(token);

  if (!res.success || !res.data) {
    return (
      <main className="mx-auto max-w-[520px] px-5 py-20">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-[18px] font-bold text-slate-900">This link is not valid</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
            It may have been mistyped, or it may belong to a cycle that has since closed. Reply to
            the statement request email and your NESR contact will help.
          </p>
        </div>
      </main>
    );
  }

  return <SoaUploadClient token={token} state={res.data} />;
}
