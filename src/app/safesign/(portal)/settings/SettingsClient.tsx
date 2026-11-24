'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { removeUser, saveTopic, saveUser, setTopicArchived } from '@/app/actions/safesign/library';
import type { SafeSignUser, Topic } from '@/lib/safesign/read';
import { BUTTON, BUTTON_SECONDARY, CARD, INPUT } from '../../components/SafeSignShell';

export default function SettingsClient({
  topics,
  users,
  canManage,
  isAdmin,
}: {
  topics: Topic[];
  users: SafeSignUser[];
  canManage: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [topicName, setTopicName] = useState('');
  const [topicDesc, setTopicDesc] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState<'manager' | 'viewer'>('manager');

  function run(fn: () => Promise<{ success: boolean; error?: string }>, ok: string, after?: () => void) {
    start(async () => {
      const r = await fn();
      setNotice({ ok: r.success, text: r.success ? ok : r.error ?? 'Something went wrong.' });
      if (r.success) after?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {notice && <p className={`rounded-lg px-3 py-2 text-sm ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{notice.text}</p>}

      <section className={CARD}>
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Topics</h2>
          <p className="text-xs text-slate-500">Each topic gets its own card and supplier grid on the dashboard.</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {topics.map((t) => (
            <li key={t.id} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${t.archived ? 'opacity-50' : ''}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">
                  {t.name}
                  {t.archived && <span className="ml-2 text-xs font-normal text-slate-500">archived</span>}
                </p>
                {t.description && <p className="text-xs text-slate-500">{t.description}</p>}
              </div>
              {canManage && (
                <>
                  <button
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                    onClick={() => {
                      setEditId(t.id);
                      setTopicName(t.name);
                      setTopicDesc(t.description);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                    disabled={pending}
                    onClick={() => run(() => setTopicArchived(t.id, !t.archived), t.archived ? 'Topic restored.' : 'Topic archived.')}
                  >
                    {t.archived ? 'Restore' : 'Archive'}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        {canManage && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
            <input className={`${INPUT} sm:max-w-[200px]`} placeholder="Topic name" value={topicName} onChange={(e) => setTopicName(e.target.value)} />
            <input className={`${INPUT} flex-1`} placeholder="Description (optional)" value={topicDesc} onChange={(e) => setTopicDesc(e.target.value)} />
            <button
              className={BUTTON}
              disabled={pending || !topicName.trim()}
              onClick={() =>
                run(() => saveTopic({ id: editId ?? undefined, name: topicName, description: topicDesc }), editId ? 'Topic updated.' : 'Topic added.', () => {
                  setTopicName('');
                  setTopicDesc('');
                  setEditId(null);
                })
              }
            >
              {editId ? 'Save' : 'Add topic'}
            </button>
            {editId && (
              <button className={BUTTON_SECONDARY} onClick={() => { setEditId(null); setTopicName(''); setTopicDesc(''); }}>
                Cancel
              </button>
            )}
          </div>
        )}
      </section>

      {isAdmin && (
        <section className={CARD}>
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Users</h2>
            <p className="text-xs text-slate-500">
              Managers keep the vendor library, send communications, remind suppliers and review plans. Viewers see the dashboards and exports.
              Platform admins and SAFESIGN_ADMIN_EMAILS are administrators automatically.
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {users.map((u) => (
              <li key={u.email} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-800">{u.email}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-600">{u.role}</span>
                <button
                  className="text-xs font-semibold text-slate-500 hover:text-rose-600"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Remove ${u.email}?`)) run(() => removeUser(u.email), 'User removed.');
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
            {users.length === 0 && <li className="px-4 py-4 text-sm text-slate-500">No users yet.</li>}
          </ul>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
            <input className={`${INPUT} flex-1`} placeholder="name@nesr.com" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} />
            <select className={`${INPUT} w-32`} value={userRole} onChange={(e) => setUserRole(e.target.value as 'manager' | 'viewer')} aria-label="Role">
              <option value="manager">Manager</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              className={BUTTON}
              disabled={pending || !userEmail.trim()}
              onClick={() => run(() => saveUser({ email: userEmail, role: userRole }), 'User saved.', () => setUserEmail(''))}
            >
              Add user
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
