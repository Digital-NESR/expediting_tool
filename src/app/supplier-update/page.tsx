import { getExpediteByToken } from '@/app/actions/supplierPortal';
import { SupplierPortalForm } from './SupplierPortalForm';

/* ─── Static error views (no interactivity needed) ──────── */

function NotFoundView() {
  return (
    <div style={{ maxWidth: '480px', margin: '80px auto', background: '#fff', borderRadius: '16px', padding: '48px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
      <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#fef2f2', border: '2px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
        <svg style={{ width: '24px', height: '24px' }} fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', marginTop: '24px' }}>Link Not Found</h2>
      <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.6', marginTop: '12px' }}>
        This link is invalid or does not exist. Please check the URL or contact your NESR buyer.
      </p>
    </div>
  );
}

function ExpiredView() {
  return (
    <div style={{ maxWidth: '480px', margin: '80px auto', background: '#fff', borderRadius: '16px', padding: '48px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
      <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#fffbeb', border: '2px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
        <svg style={{ width: '24px', height: '24px' }} fill="none" viewBox="0 0 24 24" stroke="#f59e0b" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', marginTop: '24px' }}>Updates Already Submitted</h2>
      <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.6', marginTop: '12px' }}>
        Your delivery updates for this batch have already been recorded.
        If you need to make changes, please contact your NESR buyer directly.
      </p>
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
