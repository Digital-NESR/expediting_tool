'use client';

/* ─────────────────────────────────────────────────────────────
   The supplier's monthly submission.

   Three steps on one page: pick an address, enter the code,
   confirm the month. Written for somebody who does this once a
   month on a phone, in a second language, with the email still
   open in another tab — so it says what it wants in full
   sentences and never makes them hunt for the next thing.

   The address list is masked and chosen by position. The page
   never sends an address, only an index, so it cannot be used
   to test whether a guessed address belongs to this supplier.
   ───────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Mail, ShieldCheck } from 'lucide-react';
import {
  requestRrsmCode,
  saveRrsmSupplierLines,
  submitRrsmCycle,
  verifyRrsmCode,
  type SupplierLine,
  type SupplierView,
} from '@/app/actions/rrsm/supplier';

const BRAND = '#307c4c';

export default function SubmitClient({ token, initial }: { token: string; initial: SupplierView }) {
  const [view, setView] = useState(initial);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [picked, setPicked] = useState(0);
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [rows, setRows] = useState<SupplierLine[]>(initial.lines);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const period = useMemo(() => {
    if (!view.period) return '';
    return new Date(view.period + 'T00:00:00Z').toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }, [view.period]);

  /* ── the link itself is no good ──────────────────────────── */

  if (!view.ok) {
    return (
      <Shell>
        <Card>
          <h1 className="text-[18px] font-semibold text-slate-900">This link is not valid</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
            It may have expired, or the month may already be closed. Reply to the email you received
            and your NESR contact will send a new one.
          </p>
        </Card>
      </Shell>
    );
  }

  if (view.alreadySubmitted || done) {
    return (
      <Shell>
        <Card>
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#e6f1ea]">
            <Check className="h-5 w-5" style={{ color: BRAND }} />
          </div>
          <h1 className="mt-4 text-center text-[18px] font-semibold text-slate-900">
            Thank you — {period} is submitted
          </h1>
          <p className="mt-2 text-center text-[14px] leading-relaxed text-slate-600">
            NESR will review what you have confirmed. If anything needs changing, your contact will
            send the month back to you with a note.
          </p>
        </Card>
      </Shell>
    );
  }

  if (!view.accepting) {
    return (
      <Shell>
        <Card>
          <h1 className="text-[18px] font-semibold text-slate-900">
            {period} is closed for submissions
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
            Reply to the email you received and your NESR contact will tell you what to do next.
          </p>
        </Card>
      </Shell>
    );
  }

  /* ── steps ───────────────────────────────────────────────── */

  async function sendCode() {
    setBusy('code');
    setError('');
    setNotice('');
    const r = await requestRrsmCode(token, picked);
    if (!r.success) {
      setError(r.error ?? 'That did not work.');
      if (r.retryAfterSeconds) setSecondsLeft(r.retryAfterSeconds);
    } else {
      setNotice('We have sent a six-digit code. It is valid for two minutes.');
      setSecondsLeft(view.codeTtlSeconds);
    }
    setBusy(null);
  }

  async function checkCode() {
    setBusy('verify');
    setError('');
    const r = await verifyRrsmCode(token, code);
    if (!r.success || !r.sessionToken) {
      setError(r.error ?? 'That did not work.');
      setBusy(null);
      return;
    }
    setSessionToken(r.sessionToken);
    const fresh = await getFresh(token, r.sessionToken);
    if (fresh) {
      setView(fresh);
      setRows(fresh.lines);
    }
    setNotice('');
    setBusy(null);
  }

  async function save() {
    if (!sessionToken) return;
    setBusy('save');
    setError('');
    const r = await saveRrsmSupplierLines(token, sessionToken, payload(rows));
    if (!r.success) setError(r.error ?? 'That did not work.');
    else setNotice('Saved. You can come back to this link until you submit.');
    setBusy(null);
  }

  async function submit() {
    if (!sessionToken) return;
    setBusy('submit');
    setError('');
    const saved = await saveRrsmSupplierLines(token, sessionToken, payload(rows));
    if (!saved.success) {
      setError(saved.error ?? 'That did not work.');
      setBusy(null);
      return;
    }
    const r = await submitRrsmCycle(token, sessionToken);
    if (!r.success) setError(r.error ?? 'That did not work.');
    else setDone(true);
    setBusy(null);
  }

  const verified = Boolean(view.verifiedAs || sessionToken);

  return (
    <Shell>
      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: BRAND }}>
          NESR · monthly confirmation
        </p>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-slate-900">{period}</h1>
        <p className="mt-1 text-[13.5px] text-slate-500">
          {view.supplierName} · {view.countryName} · closes {view.closesOn}
        </p>
      </div>

      {error && <Banner tone="bad" icon={<AlertTriangle className="h-4 w-4" />} text={error} />}
      {notice && !error && (
        <Banner tone="good" icon={<ShieldCheck className="h-4 w-4" />} text={notice} />
      )}

      {!verified ? (
        <Card>
          <h2 className="text-[15px] font-semibold text-slate-900">Confirm it is you</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600">
            Anyone who was forwarded this link can open it, so before we show you the month we send
            a code to one of the addresses NESR already holds for {view.supplierName}. Pick the one
            you can read.
          </p>

          <div className="mt-4 space-y-2">
            {view.contacts.map((c, i) => (
              <label
                key={c + i}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 text-[13.5px] ${
                  picked === i ? 'border-[#6AAF8E] bg-[#f3f9f5]' : 'border-slate-200'
                }`}
              >
                <input
                  type="radio"
                  name="contact"
                  checked={picked === i}
                  onChange={() => setPicked(i)}
                  className="h-4 w-4 accent-[#307c4c]"
                />
                <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="font-mono text-slate-700">{c}</span>
              </label>
            ))}
            {!view.contacts.length && (
              <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
                NESR holds no email address for you, so a code cannot be sent. Reply to the
                invitation and your contact will add one.
              </p>
            )}
          </div>

          {view.contacts.length > 0 && (
            <>
              <button
                onClick={() => void sendCode()}
                disabled={busy === 'code' || secondsLeft > 0}
                className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50"
                style={{ background: BRAND }}
              >
                {busy === 'code' && <Loader2 className="h-4 w-4 animate-spin" />}
                {secondsLeft > 0 ? `Send again in ${secondsLeft}s` : 'Send me a code'}
              </button>

              <div className="mt-5 border-t border-slate-100 pt-5">
                <label className="block text-[13px] font-semibold text-slate-700">
                  Enter the six-digit code
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-36 rounded-lg border border-slate-200 px-3 py-2.5 text-center font-mono text-[18px] tracking-[0.3em] outline-none focus:border-[#6AAF8E]"
                  />
                  <button
                    onClick={() => void checkCode()}
                    disabled={code.length !== 6 || busy === 'verify'}
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-[13.5px] font-semibold text-slate-700 disabled:opacity-40"
                  >
                    {busy === 'verify' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
                  </button>
                </div>
              </div>
            </>
          )}
        </Card>
      ) : (
        <>
          <Card>
            <h2 className="text-[15px] font-semibold text-slate-900">
              Confirm what was used in {period}
            </h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600">
              These are the items NESR has on hire from you. Correct anything that is wrong, untick
              anything that came off hire during the month, then submit. Last month&apos;s figures
              are shown so you are checking rather than typing from scratch.
            </p>
          </Card>

          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-[13px]">
                <thead>
                  <tr className="bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-2.5 text-left font-semibold">Item</th>
                    <th className="px-2 py-2.5 text-left font-semibold">On hire</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Days</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Quantity</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Last month</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-800">{r.description}</div>
                        <div className="mt-0.5 font-mono text-[10.5px] text-slate-400">
                          {r.assetRef} {r.uom}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <input
                          type="checkbox"
                          checked={r.onHire}
                          onChange={(e) => patch(i, { onHire: e.target.checked })}
                          className="h-4 w-4 accent-[#307c4c]"
                          aria-label={`${r.description} still on hire`}
                        />
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <Num
                          value={r.days === null ? '' : String(r.days)}
                          onChange={(v) => patch(i, { days: v === '' ? null : Number(v) })}
                        />
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <Num
                          value={String(r.qty)}
                          onChange={(v) => patch(i, { qty: Number(v || 0) })}
                        />
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono text-[12.5px] text-slate-400">
                        {r.previousQty === null ? '—' : r.previousQty}
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          value={r.remarks}
                          onChange={(e) => patch(i, { remarks: e.target.value })}
                          placeholder="Optional"
                          className="w-full min-w-[8rem] rounded border border-slate-200 px-2 py-1 text-[12.5px] outline-none focus:border-[#6AAF8E]"
                        />
                      </td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-[13.5px] text-slate-500"
                      >
                        NESR has nothing on hire from you this month. There is nothing to confirm.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {rows.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => void submit()}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50"
                style={{ background: BRAND }}
              >
                {busy === 'submit' && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit to NESR
              </button>
              <button
                onClick={() => void save()}
                disabled={busy !== null}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-[13.5px] font-semibold text-slate-700 disabled:opacity-40"
              >
                {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save for later'}
              </button>
              <p className="text-[12.5px] text-slate-500">Once you submit, this link closes.</p>
            </div>
          )}
        </>
      )}
    </Shell>
  );

  function patch(i: number, change: Partial<SupplierLine>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...change } : r)));
  }
}

async function getFresh(token: string, sessionToken: string): Promise<SupplierView | null> {
  const { getRrsmSubmission } = await import('@/app/actions/rrsm/supplier');
  try {
    return await getRrsmSubmission(token, sessionToken);
  } catch {
    return null;
  }
}

function payload(rows: SupplierLine[]) {
  return rows.map((r) => ({
    id: r.id,
    qty: Number(r.qty) || 0,
    days: r.days === null ? null : Number(r.days),
    onHire: r.onHire,
    remarks: r.remarks,
  }));
}

/* ─── bits ───────────────────────────────────────────────────────────────────────────────── */

function Num({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-20 rounded border border-slate-200 px-2 py-1 text-right font-mono text-[12.5px] outline-none focus:border-[#6AAF8E]"
    />
  );
}

function Banner({
  tone,
  icon,
  text,
}: {
  tone: 'good' | 'bad';
  icon: React.ReactNode;
  text: string;
}) {
  const cls =
    tone === 'bad'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-[#a9d3bb] bg-[#e6f1ea] text-[#1d4f31]';
  return (
    <div
      className={`mb-4 flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[13px] ${cls}`}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-6">{children}</div>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">{children}</div>
      <p className="pb-10 text-center text-[11.5px] text-slate-400">
        National Energy Services Reunited · this link is personal to your company
      </p>
    </div>
  );
}
