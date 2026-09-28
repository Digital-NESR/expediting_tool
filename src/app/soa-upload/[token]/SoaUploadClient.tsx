'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  requestSoaUploadCode,
  submitSoaUploadFile,
  verifySoaUploadCode,
  type UploadPageState,
} from '@/app/actions/soa/upload';

/**
 * Three steps, and the supplier only ever sees the one they are on: choose an address, enter the
 * code that was sent to it, upload the workbook.
 *
 * The countdown is a courtesy, not a control. Expiry is decided on the server, and a page left
 * open past zero gets the same refusal as one that never had a code at all.
 */

const BRAND = '#2A7E4F';

export default function SoaUploadClient({
  token,
  state,
}: {
  token: string;
  state: UploadPageState;
}) {
  // A signed-in champion for this country has already proved more than the code does.
  const [verifiedAs, setVerifiedAs] = useState<string | null>(
    state.verifiedAs ?? (state.signedInAs ? state.signedInAs : null),
  );
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ lines: number; needingReview: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const pick = useCallback(
    async (index: number) => {
      setBusy(true);
      setError(null);
      const res = await requestSoaUploadCode(token, index);
      setBusy(false);
      if (!res.success || !res.data) return setError(res.error ?? 'Could not send a code.');
      setSentTo(res.data.sentTo);
      setSecondsLeft(res.data.expiresInSeconds);
      setCode('');
    },
    [token],
  );

  async function verify() {
    setBusy(true);
    setError(null);
    const res = await verifySoaUploadCode(token, code);
    setBusy(false);
    if (!res.success || !res.data) return setError(res.error ?? 'Could not check that code.');
    setVerifiedAs(res.data.verifiedAs);
  }

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError('Choose the completed Excel file first.');
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set('file', file);
    const res = await submitSoaUploadFile(token, form);
    setBusy(false);
    if (!res.success || !res.data) return setError(res.error ?? 'Could not accept that file.');
    setDone(res.data);
  }

  return (
    <main className="mx-auto max-w-[560px] px-5 py-10">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="px-6 py-5" style={{ background: BRAND }}>
          <div className="text-[13px] font-bold tracking-[2px] text-white">NESR</div>
          <div className="text-[11.5px] text-white/70">Statement of Account</div>
        </div>

        <div className="px-6 py-5">
          <h1 className="text-[17px] font-bold text-slate-900">{state.vendorName}</h1>
          <p className="mt-1 text-[12.5px] text-slate-500">
            {state.cycleLabel} · {state.countryName} · Vendor{' '}
            <span className="font-mono">{state.vendorNo}</span>
          </p>

          {!state.acceptingUploads ? (
            <Panel tone="muted">
              This cycle has closed and is no longer accepting statements. Reply to the request
              email if you still need to send one.
            </Panel>
          ) : done ? (
            <Panel tone="ok">
              <strong>Thank you. Your statement has been received.</strong>
              <div className="mt-1">
                {done.lines} invoice {done.lines === 1 ? 'line was' : 'lines were'} read from your
                file
                {done.needingReview > 0
                  ? `, and ${done.needingReview} will be checked with you if anything looks unclear.`
                  : '.'}{' '}
                Nothing further is needed from you.
              </div>
            </Panel>
          ) : verifiedAs ? (
            <>
              <Panel tone="ok">
                {state.signedInAs && !state.verifiedAs
                  ? `Signed in as ${state.signedInAs}. You are uploading on the vendor's behalf.`
                  : `Verified as ${verifiedAs}.`}
              </Panel>
              <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Completed statement
              </label>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xlsm,.xls"
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
              />
              <p className="mt-1.5 text-[11.5px] text-slate-500">
                The Excel template that came with your request, filled in. Due{' '}
                {state.submissionDeadline}.
              </p>
              <button
                type="button"
                onClick={upload}
                disabled={busy}
                className="mt-4 w-full rounded-lg py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
                style={{ background: BRAND }}
              >
                {busy ? 'Uploading…' : 'Upload statement'}
              </button>
            </>
          ) : sentTo ? (
            <>
              <Panel tone="info">
                A six-digit code has been sent to <strong>{sentTo}</strong>.
              </Panel>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && code.length === 6) void verify();
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                aria-label="Six-digit verification code"
                className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-3 text-center font-mono text-[24px] tracking-[10px] outline-none focus:border-[#2A7E4F]"
              />
              <div className="mt-2 flex items-center justify-between text-[11.5px]">
                <span className={secondsLeft > 0 ? 'text-slate-500' : 'font-bold text-red-600'}>
                  {secondsLeft > 0
                    ? `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`
                    : 'This code has expired.'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSentTo(null);
                    setCode('');
                    setError(null);
                  }}
                  className="font-semibold hover:underline"
                  style={{ color: BRAND }}
                >
                  Use a different address
                </button>
              </div>
              <button
                type="button"
                onClick={verify}
                disabled={busy || code.length !== 6}
                className="mt-4 w-full rounded-lg py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
                style={{ background: BRAND }}
              >
                {busy ? 'Checking…' : 'Verify'}
              </button>
            </>
          ) : (
            <>
              <Panel tone="info">
                To protect your account details, choose the address this request was sent to. We
                will email a code to confirm it is you.
              </Panel>
              <div className="mt-3 space-y-2">
                {state.maskedContacts.length === 0 && (
                  <p className="text-[12.5px] text-slate-500">
                    No contact address is on file for your company, so a code cannot be sent. Please
                    reply to the request email instead.
                  </p>
                )}
                {state.maskedContacts.map((masked, i) => (
                  <button
                    key={masked}
                    type="button"
                    disabled={busy}
                    onClick={() => pick(i)}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-left text-[13px] transition-colors hover:border-[#2A7E4F]/50 disabled:opacity-50"
                  >
                    <span className="font-mono text-slate-800">{masked}</span>
                    <span className="text-[11.5px] font-semibold" style={{ color: BRAND }}>
                      Send code →
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-[11px] text-slate-400">
        National Energy Services Reunited · This link is unique to your company. Please do not
        forward it.
      </p>
    </main>
  );
}

function Panel({ tone, children }: { tone: 'ok' | 'info' | 'muted'; children: React.ReactNode }) {
  const styles = {
    ok: 'border-[#CFE3D6] bg-[#F1F6F2] text-slate-700',
    info: 'border-slate-200 bg-slate-50 text-slate-600',
    muted: 'border-amber-200 bg-amber-50 text-amber-900',
  }[tone];
  return <div className={`mt-4 rounded-lg border px-3.5 py-3 text-[12.5px] ${styles}`}>{children}</div>;
}
