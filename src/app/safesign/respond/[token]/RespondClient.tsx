'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, FileSignature, FileText, Mail, Paperclip, ShieldCheck, X } from 'lucide-react';
import {
  downloadSupplierDocument,
  getSupplierView,
  requestSupplierCode,
  submitSupplierResponse,
  verifySupplierCode,
  type SupplierView,
} from '@/app/actions/safesign/supplier';
import { formatBytes, formatDay, formatStamp, MAX_FILE_BYTES, RESPONSE_TYPE_LABEL } from '@/lib/safesign/model';

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/15';
const BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#307c4c] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#276640] disabled:cursor-not-allowed disabled:bg-slate-300';
const LABEL = 'mb-1 block text-xs font-semibold text-slate-600';

export default function RespondClient({ token, initial }: { token: string; initial: SupplierView }) {
  const [view, setView] = useState(initial);
  const [session, setSession] = useState<string | null>(null);
  const [contact, setContact] = useState(0);
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!view.ok) {
    return (
      <Frame>
        <div className="p-8 text-center">
          <h1 className="text-lg font-semibold text-slate-900">This link is not valid</h1>
          <p className="mt-2 text-sm text-slate-500">It may have been mistyped or withdrawn. Reply to the email you received and ask your NESR contact for a new link.</p>
        </div>
      </Frame>
    );
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    const r = await requestSupplierCode(token, contact);
    setBusy(false);
    if (!r.success) setError(r.error ?? 'Could not send a code.');
    else {
      setCodeSent(true);
      setDevCode(r.devCode ?? null);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const r = await verifySupplierCode(token, code);
    if (!r.success || !r.sessionToken) {
      setBusy(false);
      setError(r.error ?? 'That code did not work.');
      return;
    }
    setSession(r.sessionToken);
    setView(await getSupplierView(token, r.sessionToken));
    setBusy(false);
  }

  const verified = Boolean(session && view.verifiedAs);

  return (
    <Frame>
      <div className="border-b border-slate-100 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#307c4c]">{view.topicName}</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">{view.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          For <b className="text-slate-700">{view.vendorName}</b> · {RESPONSE_TYPE_LABEL[view.responseType]} · due{' '}
          <b className="text-slate-700">{formatDay(view.deadline)}</b>
        </p>
      </div>

      {done ? (
        <div className="p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-[#307c4c]" />
          <h2 className="mt-3 text-lg font-semibold text-slate-900">Thank you, your response has been received</h2>
          <p className="mt-1 text-sm text-slate-500">
            {view.responseType === 'action_plan'
              ? 'NESR will review your plan and email you if anything needs to change.'
              : 'Nothing more is needed. You can close this page.'}
          </p>
        </div>
      ) : !view.accepting && !verified ? (
        <Closed view={view} />
      ) : !verified ? (
        <div className="space-y-4 p-6">
          <div className="flex gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <ShieldCheck className="h-5 w-5 shrink-0 text-[#307c4c]" />
            <p>To protect this request, choose the email address it was sent to. We will email a six-digit code to that address.</p>
          </div>
          {!codeSent ? (
            <>
              <div className="space-y-2">
                {view.contacts.map((c, i) => (
                  <label key={i} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${contact === i ? 'border-[#307c4c] bg-[#307c4c]/5' : 'border-slate-200'}`}>
                    <input type="radio" checked={contact === i} onChange={() => setContact(i)} />
                    <Mail className="h-4 w-4 text-slate-400" />
                    <span className="font-mono text-slate-700">{c}</span>
                  </label>
                ))}
              </div>
              <button className={`${BUTTON} w-full`} disabled={busy} onClick={sendCode}>
                {busy ? 'Sending…' : 'Email me a code'}
              </button>
            </>
          ) : (
            <>
              <div>
                <label className={LABEL} htmlFor="code">Code from the email (valid {Math.round(view.codeTtlSeconds / 60)} minutes)</label>
                <input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={`${INPUT} text-center font-mono text-2xl tracking-[0.4em]`}
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              {devCode && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Local test server, no email is sent. Your code is <b className="font-mono text-sm">{devCode}</b>
                </p>
              )}
              <button className={`${BUTTON} w-full`} disabled={busy || code.length !== 6} onClick={verify}>
                {busy ? 'Checking…' : 'Continue'}
              </button>
              <button className="w-full text-xs font-semibold text-slate-500 hover:text-slate-700" onClick={() => { setCodeSent(false); setCode(''); }}>
                Use a different address or send a new code
              </button>
            </>
          )}
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        </div>
      ) : (
        <Respond token={token} session={session!} view={view} onDone={() => setDone(true)} />
      )}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-slate-50 px-4 py-8 font-sans">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#307c4c] to-[#1d4f31] text-white">
            <FileSignature className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-900">NESR SafeSign</p>
            <p className="text-xs text-slate-500">QHSE communications for suppliers</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{children}</div>
        <p className="mt-4 text-center text-xs text-slate-400">National Petroleum Technology Company (NESR)</p>
      </div>
    </div>
  );
}

function Closed({ view }: { view: SupplierView }) {
  const answered = view.status === 'completed' || view.status === 'under_review';
  return (
    <div className="p-8 text-center">
      {answered ? <CheckCircle2 className="mx-auto h-10 w-10 text-[#307c4c]" /> : null}
      <h2 className="mt-2 text-lg font-semibold text-slate-900">
        {view.status === 'completed' ? 'Already completed' : view.status === 'under_review' ? 'Received, under review' : 'No longer accepting responses'}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        {answered
          ? 'A response from your company has already been received. Nothing more is needed.'
          : 'This request has been closed. Reply to the email if you still need to respond.'}
      </p>
    </div>
  );
}

function Respond({ token, session, view, onDone }: { token: string; session: string; view: SupplierView; onDone: () => void }) {
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [comment, setComment] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [main, setMain] = useState<File[]>([]);
  const [supporting, setSupporting] = useState<File[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const type = view.responseType;

  async function download(id: number) {
    const r = await downloadSupplierDocument(token, session, id);
    if (!r.success || !r.base64) {
      setError(r.error ?? 'Could not download.');
      return;
    }
    const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = r.filename ?? 'document';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set('token', token);
    form.set('sessionToken', session);
    form.set('name', name);
    form.set('title', jobTitle);
    form.set('comment', comment);
    form.set('confirm', confirm ? 'yes' : '');
    if (signature) form.set('signature', signature);
    for (const f of main) form.append('main', f);
    for (const f of supporting) form.append('supporting', f);
    const r = await submitSupplierResponse(form);
    setBusy(false);
    if (!r.success) setError(r.error ?? 'Could not submit.');
    else onDone();
  }

  const confirmText =
    type === 'action_plan'
      ? 'I confirm this plan is submitted on behalf of my company.'
      : type === 'submit_documents'
        ? 'I confirm these documents are submitted on behalf of my company.'
        : `On behalf of ${view.vendorName}, I confirm I have reviewed the document(s) above, understand the requirements, and commit to comply with them.`;

  const mainLabel =
    type === 'upload_signed' ? 'Signed letter' : type === 'action_plan' ? 'Your action plan' : type === 'submit_documents' ? 'Documents' : null;

  return (
    <div className="space-y-5 p-6">
      {view.reviewComment && view.status === 'changes_requested' && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm">
          <p className="font-semibold text-orange-800">NESR asked for changes</p>
          <p className="mt-1 whitespace-pre-line text-orange-900">{view.reviewComment}</p>
        </div>
      )}
      {view.message && <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{view.message}</p>}

      {view.documents.length > 0 && (
        <div>
          <p className={LABEL}>Documents to review</p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {view.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-slate-800">{d.filename}</span>
                <span className="text-xs text-slate-400">{formatBytes(d.sizeBytes)}</span>
                <button onClick={() => download(d.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#307c4c] hover:underline">
                  <Download className="h-3.5 w-3.5" /> Download
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="name">Your full name</label>
          <input id="name" className={INPUT} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={LABEL} htmlFor="jobtitle">Job title</label>
          <input id="jobtitle" className={INPUT} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </div>
      </div>

      {type === 'sign_letter' && (
        <div>
          <p className={LABEL}>Your signature</p>
          <SignaturePad onChange={setSignature} />
        </div>
      )}

      {mainLabel && <FilePicker label={mainLabel} files={main} setFiles={setMain} multiple={type !== 'upload_signed'} onError={setError} />}

      {view.attachments !== 'none' && (
        <FilePicker
          label={`Supporting documents (${view.attachments === 'required' ? 'required' : 'optional'})`}
          files={supporting}
          setFiles={setSupporting}
          multiple
          onError={setError}
        />
      )}

      <div>
        <label className={LABEL} htmlFor="comment">Comment (optional)</label>
        <textarea id="comment" className={`${INPUT} min-h-[70px]`} value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>

      <label className="flex gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
        <span>{confirmText}</span>
      </label>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <button className={`${BUTTON} w-full`} disabled={busy || !confirm || !name.trim()} onClick={submit}>
        {busy
          ? 'Submitting…'
          : type === 'acknowledge'
            ? 'Acknowledge'
            : type === 'sign_letter'
              ? 'Sign and submit'
              : 'Submit'}
      </button>
      <p className="text-center text-xs text-slate-400">
        Signed in as {view.verifiedAs}. Your name, email address, the time and your IP address are recorded with your response.
        {view.respondedAt ? ` Previous response ${formatStamp(view.respondedAt)}.` : ''}
      </p>
    </div>
  );
}

function FilePicker({
  label,
  files,
  setFiles,
  multiple,
  onError,
}: {
  label: string;
  files: File[];
  setFiles: (f: File[]) => void;
  multiple: boolean;
  onError: (e: string) => void;
}) {
  return (
    <div>
      <p className={LABEL}>{label}</p>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500 hover:border-[#307c4c]/50 hover:text-[#307c4c]">
        <Paperclip className="h-4 w-4" /> {files.length && !multiple ? 'Replace file' : 'Choose file'}{multiple ? 's' : ''} (up to 15 MB each)
        <input
          type="file"
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            const tooBig = picked.find((f) => f.size > MAX_FILE_BYTES);
            if (tooBig) onError(`${tooBig.name} is larger than 15 MB.`);
            const ok = picked.filter((f) => f.size <= MAX_FILE_BYTES);
            setFiles(multiple ? [...files, ...ok] : ok.slice(0, 1));
            e.target.value = '';
          }}
        />
      </label>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm text-slate-700">
              <FileText className="h-4 w-4 text-slate-400" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-slate-400">{formatBytes(f.size)}</span>
              <button aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="rounded p-1 text-slate-400 hover:text-rose-600">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A plain canvas signature pad; mouse, pen and touch through pointer events. */
function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  /* A ref as well as state: the pointer-up handler of the very first stroke would otherwise read
     the state from before that stroke, and a one-stroke signature would never be captured. */
  const inked = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f2a1a';
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function clear() {
    const c = canvas.current;
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    inked.current = false;
    setHasInk(false);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvas}
        className="h-40 w-full touch-none rounded-lg border border-slate-300 bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const ctx = e.currentTarget.getContext('2d');
          const p = point(e);
          ctx?.beginPath();
          ctx?.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext('2d');
          const p = point(e);
          ctx?.lineTo(p.x, p.y);
          ctx?.stroke();
          if (!inked.current) {
            inked.current = true;
            setHasInk(true);
          }
        }}
        onPointerUp={(e) => {
          drawing.current = false;
          if (inked.current) onChange(e.currentTarget.toDataURL('image/png'));
        }}
      />
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>{hasInk ? 'Signature captured.' : 'Sign with your mouse, pen or finger.'}</span>
        <button type="button" onClick={clear} className="font-semibold hover:text-slate-800">
          Clear
        </button>
      </div>
    </div>
  );
}
