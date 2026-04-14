import { getExpediteByToken } from '@/app/actions/supplierPortal';
import { SupplierPortalForm } from './SupplierPortalForm';

/* ─── Static error views (no interactivity needed) ──────── */

function NotFoundView() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-5">
        <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-slate-800 mb-2">Link Not Found</h2>
      <p className="text-slate-500 text-sm max-w-xs">
        This link is invalid or does not exist. Please check the URL or contact your NESR buyer.
      </p>
    </div>
  );
}

function ExpiredView() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="max-w-md w-full bg-amber-50 border border-amber-200 rounded-2xl p-8">
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-amber-900 mb-2">Updates Already Submitted</h2>
        <p className="text-sm text-amber-800 leading-relaxed">
          Your delivery updates for this batch have already been recorded.
          If you need to make changes, please contact your NESR buyer directly.
        </p>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────── */

export default async function SupplierUpdatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) return <NotFoundView />;

  const result = await getExpediteByToken(token);

  if ('notFound' in result) return <NotFoundView />;
  if ('expired' in result) return <ExpiredView />;

  return <SupplierPortalForm token={token} data={result} />;
}
