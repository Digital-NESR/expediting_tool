'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSoaUploadState,
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
 *
 * Verification lives in `sessionStorage`, which is per TAB. It used to be a cookie, so one code
 * opened every tab in the browser for half an hour, including a tab opened by whoever the email
 * had since been forwarded to. Closing the tab now ends it, and following the link again asks for
 * a new code. A reload does not: a supplier who refreshes mid-upload should not start over.
 */

const BRAND = '#2A7E4F';

/** The server decides this; the copy here only saves a supplier a pointless upload. */
const MAX_MB = 10;
const ACCEPTED = /\.(xlsx|xlsm|xls)$/i;

/** Per link, so a champion holding two open does not overwrite one session with the other. */
const storageKeyFor = (token: string) => `soa_up_${token}`;

/** sessionStorage throws in some privacy modes, and a statement upload must not die on that. */
function readSession(token: string): string | null {
  try {
    return window.sessionStorage.getItem(storageKeyFor(token));
  } catch {
    return null;
  }
}

function writeSession(token: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(storageKeyFor(token));
    else window.sessionStorage.setItem(storageKeyFor(token), value);
  } catch {
    /* Verification still holds in this component's own state while the page stays open. */
  }
}

function sizeLabel(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(Math.round(bytes / 1024), 1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SoaUploadClient({
  token,
  state,
}: {
  token: string;
  state: UploadPageState;
}) {
  const [verifiedAs, setVerifiedAs] = useState<string | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [resuming, setResuming] = useState(true);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState<{ lines: number; needingReview: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Pick up a verification made earlier in THIS tab. The stored token is checked rather than
     believed: thirty minutes may have passed, or it may already have been spent. */
  useEffect(() => {
    const stored = readSession(token);
    if (!stored) {
      setResuming(false);
      return;
    }
    let live = true;
    void getSoaUploadState(token, stored).then((res) => {
      if (!live) return;
      const resumed = res.success ? (res.data?.verifiedAs ?? null) : null;
      if (resumed) {
        setSession(stored);
        setVerifiedAs(resumed);
      } else {
        writeSession(token, null);
      }
      setResuming(false);
    });
    return () => {
      live = false;
    };
  }, [token]);

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
    writeSession(token, res.data.sessionToken);
    setSession(res.data.sessionToken);
    setVerifiedAs(res.data.verifiedAs);
  }

  /** Shared by the picker and the drop zone, so a dropped file is checked exactly like a chosen one. */
  const accept = useCallback((chosen: File | null) => {
    if (!chosen) return;
    if (!ACCEPTED.test(chosen.name)) {
      setFile(null);
      return setError(
        'That is not an Excel file. Send back the template that came with the request.',
      );
    }
    if (chosen.size > MAX_MB * 1024 * 1024) {
      setFile(null);
      return setError(`That file is larger than ${MAX_MB} MB.`);
    }
    setError(null);
    setFile(chosen);
  }, []);

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    accept(e.dataTransfer.files?.[0] ?? null);
  }

  async function upload() {
    if (!file) return setError('Choose the completed Excel file first.');
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set('file', file);
    const res = await submitSoaUploadFile(token, form, session ?? undefined);
    setBusy(false);
    if (!res.success || !res.data) return setError(res.error ?? 'Could not accept that file.');
    // Nothing more is owed from this tab, and the statement is filed.
    writeSession(token, null);
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
          ) : resuming ? (
            <Panel tone="info">Checking this session, one moment.</Panel>
          ) : verifiedAs ? (
            <>
              <Panel tone="ok">Verified as {verifiedAs}.</Panel>

              <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Completed statement
              </div>

              {/* A drop zone as well as a picker. The file arrives as an email attachment, and
                  dragging it straight out of the mail client is one step where saving it, finding
                  the folder again and picking it out of a list is three. */}
              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragOver={(e) => {
                  // Without this the browser navigates away to the dropped file.
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(e) => {
                  // Crossing onto a child fires leave on the parent; only a real exit counts.
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  setDragging(false);
                }}
                onDrop={onDrop}
                className={`mt-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                  dragging ? 'border-[#2A7E4F] bg-[#F1F6F2]' : 'border-slate-200 bg-slate-50'
                }`}
              >
                {file ? (
                  <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px]">
                    <span className="font-semibold text-slate-800">{file.name}</span>
                    <span className="text-[11.5px] text-slate-500">{sizeLabel(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        if (fileRef.current) fileRef.current.value = '';
                      }}
                      className="text-[11.5px] font-semibold text-slate-500 underline hover:text-slate-700"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-[13px] text-slate-600">
                      Drag the completed workbook here
                    </div>
                    <label
                      htmlFor="soa-statement-file"
                      className="mt-1 inline-block cursor-pointer text-[12.5px] font-semibold underline"
                      style={{ color: BRAND }}
                    >
                      or choose a file
                    </label>
                  </>
                )}
                {/* A real input, kept for the keyboard and for screen readers; the label above is
                    what is actually seen. */}
                <input
                  id="soa-statement-file"
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xlsm,.xls"
                  className="sr-only"
                  onChange={(e) => accept(e.target.files?.[0] ?? null)}
                />
              </div>

              <p className="mt-1.5 text-[11.5px] text-slate-500">
                The Excel template that came with your request, filled in. Due{' '}
                {state.submissionDeadline}.
              </p>
              <button
                type="button"
                onClick={upload}
                disabled={busy || !file}
                className="mt-4 w-full rounded-lg py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
                style={{ background: BRAND }}
              >
                {busy ? 'Uploading, please wait.' : 'Upload statement'}
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
                {busy ? 'Checking' : 'Verify'}
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
                      Send code
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
  return (
    <div className={`mt-4 rounded-lg border px-3.5 py-3 text-[12.5px] ${styles}`}>{children}</div>
  );
}
