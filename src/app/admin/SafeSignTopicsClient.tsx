'use client';

/* ─────────────────────────────────────────────────────────────
   SafeSign · Topics.

   Topics group communications on the SafeSign dashboard (Medical &
   Emergency, Site Access & RFID…). They are shared by every country,
   so they are kept here rather than in the tool, where a sender in
   one country could rename another country's topic.
   ───────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from 'react';
import {
  getSafeSignTopics,
  saveSafeSignTopic,
  setSafeSignTopicArchived,
} from '@/app/actions/safesign/admin';
import type { Topic } from '@/lib/safesign/read';

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#307c4c]';

export default function SafeSignTopicsClient() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState<Topic | null>(null);

  const reload = useCallback(async () => {
    try {
      setTopics(await getSafeSignTopics());
    } catch {
      setError('Could not load the topics.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(fn: () => Promise<{ success: boolean; error?: string }>, after?: () => void) {
    setError('');
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.success) return setError(r.error ?? 'Could not save.');
    after?.();
    await reload();
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading topics…</div>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Topics</h2>
        <p className="mt-1 text-sm text-slate-500">
          Topics group communications on the SafeSign dashboard, with one compliance card each. They
          are shared by every country. Archiving hides a topic from new communications and keeps
          its history.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <input className={INPUT} placeholder="Topic name" value={name} onChange={(e) => setName(e.target.value)} />
          <input
            className={INPUT}
            placeholder="Short description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() =>
              run(
                () => saveSafeSignTopic({ id: editing?.id, name, description }),
                () => {
                  setName('');
                  setDescription('');
                  setEditing(null);
                },
              )
            }
            className="rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {editing ? 'Save topic' : 'Add topic'}
          </button>
        </div>
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setName('');
              setDescription('');
            }}
            className="mt-2 text-xs font-semibold text-slate-500 hover:underline"
          >
            Cancel editing {editing.name}
          </button>
        )}
        {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {topics.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${t.archived ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                  {t.name}
                </p>
                {t.description && <p className="text-xs text-slate-500">{t.description}</p>}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing(t);
                  setName(t.name);
                  setDescription(t.description);
                }}
                className="text-xs font-semibold text-[#307c4c] hover:underline"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => setSafeSignTopicArchived(t.id, !t.archived))}
                className="text-xs font-semibold text-slate-500 hover:underline"
              >
                {t.archived ? 'Restore' : 'Archive'}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
