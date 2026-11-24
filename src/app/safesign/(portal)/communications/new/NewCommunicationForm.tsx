'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Paperclip, X } from 'lucide-react';
import { createCommunication } from '@/app/actions/safesign/communications';
import {
  ATTACHMENT_LABEL,
  ATTACHMENT_MODES,
  MAX_FILE_BYTES,
  RESPONSE_TYPE_HINT,
  RESPONSE_TYPE_LABEL,
  RESPONSE_TYPES,
  formatBytes,
  needsLetter,
  type AttachmentMode,
  type ResponseType,
} from '@/lib/safesign/model';
import type { Topic, Vendor } from '@/lib/safesign/read';
import { BUTTON, BUTTON_SECONDARY, CARD, INPUT, LABEL } from '../../../components/SafeSignShell';

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function NewCommunicationForm({
  topics,
  vendors,
  countryName,
  sender,
}: {
  topics: Topic[];
  vendors: Vendor[];
  countryName: string;
  sender: { name: string; email: string };
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [topicId, setTopicId] = useState<number>(topics[0]?.id ?? 0);
  const [message, setMessage] = useState('');
  const [responseType, setResponseType] = useState<ResponseType>('acknowledge');
  const [attachments, setAttachments] = useState<AttachmentMode>('none');
  const [deadline, setDeadline] = useState(inDays(14));
  const [remindDays, setRemindDays] = useState('3, 1');
  const [overdueEvery, setOverdueEvery] = useState(2);
  const [files, setFiles] = useState<File[]>([]);
  const [letterIndex, setLetterIndex] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(() => [...new Set(vendors.map((v) => v.category))].sort(), [vendors]);
  const shown = vendors.filter(
    (v) => !filter || v.name.toLowerCase().includes(filter.toLowerCase()) || v.category.toLowerCase().includes(filter.toLowerCase()),
  );

  function toggle(id: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleCategory(cat: string) {
    const ids = vendors.filter((v) => v.category === cat && v.to.length).map((v) => v.id);
    const all = ids.every((id) => selected.has(id));
    setSelected((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (all) n.delete(id);
        else n.add(id);
      }
      return n;
    });
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE_BYTES) {
        setError(`${f.name} is larger than 15 MB.`);
        continue;
      }
      next.push(f);
    }
    setFiles(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData();
    form.set('title', title);
    form.set('topicId', String(topicId));
    form.set('message', message);
    form.set('responseType', responseType);
    form.set('attachments', attachments);
    form.set('deadline', deadline);
    form.set('remindDaysBefore', remindDays);
    form.set('overdueEveryDays', String(overdueEvery));
    form.set('letterIndex', String(letterIndex));
    for (const id of selected) form.append('vendorIds', String(id));
    for (const f of files) form.append('files', f);
    const r = await createCommunication(form);
    setBusy(false);
    if (!r.success || !r.id) {
      setError(r.error ?? 'Could not save.');
      return;
    }
    router.push(`/safesign/communications/${r.id}`);
  }

  if (!vendors.length) {
    return (
      <div className={`${CARD} p-8 text-center`}>
        <p className="text-sm text-slate-600">Add suppliers to the {countryName} supplier library first.</p>
        <Link href="/safesign/suppliers" className="mt-3 inline-block text-sm font-semibold text-[#307c4c] hover:underline">
          Open the supplier library →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <section className={`${CARD} space-y-4 p-5`}>
        <h2 className="text-sm font-semibold text-slate-800">1. What are you sending?</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="title">Title</label>
            <input id="title" className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Medical Evacuation Protocol" required />
          </div>
          <div>
            <label className={LABEL} htmlFor="topic">Topic</label>
            <select id="topic" className={INPUT} value={topicId} onChange={(e) => setTopicId(Number(e.target.value))}>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={LABEL} htmlFor="message">Message to suppliers (goes in the email)</label>
          <textarea
            id="message"
            className={`${INPUT} min-h-[120px]`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Safety is our highest priority. Attached you will find…"
          />
        </div>
        <div>
          <span className={LABEL}>Documents</span>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500 hover:border-[#307c4c]/50 hover:text-[#307c4c]">
            <Paperclip className="h-4 w-4" /> Add files (PDF, Word, images · up to 15 MB each)
            <input type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </label>
          {files.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-slate-700">{f.name}</span>
                  <span className="text-xs text-slate-400">{formatBytes(f.size)}</span>
                  {needsLetter(responseType) && (
                    <label className="flex items-center gap-1 text-xs text-slate-600">
                      <input type="radio" name="letter" checked={letterIndex === i} onChange={() => setLetterIndex(i)} />
                      Letter to sign
                    </label>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => { setFiles(files.filter((_, j) => j !== i)); if (letterIndex >= i && letterIndex > 0) setLetterIndex(letterIndex - 1); }}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className={`${CARD} space-y-4 p-5`}>
        <h2 className="text-sm font-semibold text-slate-800">2. What do you need back?</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {RESPONSE_TYPES.map((t) => (
            <label
              key={t}
              className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                responseType === t ? 'border-[#307c4c] bg-[#307c4c]/5 ring-1 ring-[#307c4c]/30' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input type="radio" name="responseType" className="sr-only" checked={responseType === t} onChange={() => setResponseType(t)} />
              <span className="block text-sm font-semibold text-slate-800">{RESPONSE_TYPE_LABEL[t]}</span>
              <span className="mt-0.5 block text-xs leading-snug text-slate-500">{RESPONSE_TYPE_HINT[t]}</span>
            </label>
          ))}
        </div>
        <div>
          <label className={LABEL} htmlFor="attachments">Supporting documents from the supplier</label>
          <select id="attachments" className={INPUT} value={attachments} onChange={(e) => setAttachments(e.target.value as AttachmentMode)}>
            {ATTACHMENT_MODES.map((m) => (
              <option key={m} value={m}>{ATTACHMENT_LABEL[m]}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={LABEL} htmlFor="deadline">Deadline</label>
            <input id="deadline" type="date" className={INPUT} value={deadline} onChange={(e) => setDeadline(e.target.value)} required />
          </div>
          <div>
            <label className={LABEL} htmlFor="remind">Remind days before</label>
            <input id="remind" className={INPUT} value={remindDays} onChange={(e) => setRemindDays(e.target.value)} placeholder="3, 1" />
          </div>
          <div>
            <label className={LABEL} htmlFor="overdue">Once overdue, remind every</label>
            <select id="overdue" className={INPUT} value={overdueEvery} onChange={(e) => setOverdueEvery(Number(e.target.value))}>
              <option value={1}>day</option>
              <option value={2}>2 days</option>
              <option value={3}>3 days</option>
              <option value={7}>week</option>
              <option value={0}>never</option>
            </select>
          </div>
        </div>
      </section>

      <section className={`${CARD} space-y-3 p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">3. Who gets it? ({selected.size} selected)</h2>
          <input className={`${INPUT} max-w-[220px]`} placeholder="Filter suppliers" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-xs text-slate-500">Select a whole category:</span>
          {categories.map((cat) => {
            const ids = vendors.filter((v) => v.category === cat && v.to.length).map((v) => v.id);
            const all = ids.length > 0 && ids.every((id) => selected.has(id));
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition-colors ${
                  all ? 'bg-[#307c4c] text-white ring-[#307c4c]' : 'bg-white text-slate-600 ring-slate-200 hover:ring-[#307c4c]/40'
                }`}
              >
                {cat} ({ids.length})
              </button>
            );
          })}
        </div>
        <ul className="max-h-[340px] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {shown.map((v) => {
            const to = v.to.length;
            const cc = v.cc.length;
            return (
              <li key={v.id}>
                <label
                  className={`flex items-center gap-3 px-3 py-2 text-sm ${to ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed opacity-60'}`}
                  title={to ? `To: ${v.to.join(', ')}${cc ? `
Cc: ${v.cc.join(', ')}` : ''}` : 'No TO email. Add one in the supplier library.'}
                >
                  <input type="checkbox" disabled={!to} checked={selected.has(v.id)} onChange={() => toggle(v.id)} />
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{v.name}</span>
                  <span className="text-xs text-slate-500">{v.category}</span>
                  <span className={`w-24 text-right text-xs ${to ? 'text-slate-400' : 'font-semibold text-rose-600'}`}>
                    {to ? `${to} to${cc ? ` · ${cc} cc` : ''}` : 'no email'}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-slate-500">
          You ({sender.name || sender.email}) are copied on every email. Recipients are managed in the{' '}
          <Link href="/safesign/suppliers" className="font-semibold text-[#307c4c] hover:underline">
            supplier library
          </Link>
          .
        </p>
      </section>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <Link href="/safesign/communications" className={BUTTON_SECONDARY}>Cancel</Link>
        <button type="submit" className={BUTTON} disabled={busy}>
          {busy ? 'Saving…' : 'Save and review'}
        </button>
      </div>
      <p className="text-right text-xs text-slate-500">Nothing is emailed until you press Send on the next page.</p>
    </form>
  );
}
