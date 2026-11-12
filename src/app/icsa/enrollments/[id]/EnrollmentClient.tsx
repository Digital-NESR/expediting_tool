'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Search, Send, Trash2, UserPlus } from 'lucide-react';
import {
  closeIcsaEnrollment,
  nominateIcsaRespondents,
  removeIcsaNominee,
  requestIcsaExtension,
  sendIcsaReminders,
  sendIcsaRequests,
  setIcsaRespondentSections,
} from '@/app/actions/icsa/enrollments';
import {
  icsaDirectoryDepartments,
  searchIcsaDirectory,
  type DirectoryPerson,
} from '@/app/actions/icsa/directory';
import {
  AWAITING_RESPONDENT,
  ICSA_COUNTRIES,
  ICSA_SECTIONS,
  fmtDate,
  pct,
  type AssessmentStatus,
  type Progress,
} from '@/lib/icsa/model';
import {
  AssessmentPill,
  BTN,
  BTN_DANGER,
  BTN_QUIET,
  BTN_SM,
  Banner,
  CARD,
  INPUT,
  LABEL,
  TD,
  TH,
} from '../../components/ui';

export interface RespondentRow {
  id: number;
  name: string | null;
  email: string;
  jobTitle: string | null;
  department: string | null;
  sections: string[];
  status: AssessmentStatus;
  comp: number;
  rate: number | null;
  requestedAt: string | null;
  lastRemindedAt: string | null;
  reminderCount: number;
  submittedAt: string | null;
}

type Notice = { tone: 'ok' | 'error' | 'warn'; text: string } | null;

/* ─── Actions bar ───────────────────────────────────────────────────────────────────────── */

export function EnrollmentActions({
  enrollmentId,
  isOpen,
  isAdmin,
  progress: p,
  nominated,
  outstanding,
  deadline,
  pendingExtension,
}: {
  enrollmentId: number;
  isOpen: boolean;
  isAdmin: boolean;
  progress: Progress;
  nominated: number;
  outstanding: number;
  deadline: string;
  pendingExtension: { requestedDeadline: string; reason: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [mode, setMode] = useState<'none' | 'close' | 'extend'>('none');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');

  async function run(
    key: string,
    fn: () => Promise<{ success: boolean; error?: string }>,
    ok: (r: unknown) => Notice,
  ) {
    setBusy(key);
    setNotice(null);
    const res = await fn();
    setBusy(null);
    if (!res.success) return setNotice({ tone: 'error', text: res.error ?? 'That did not work.' });
    setNotice(ok(res));
    setMode('none');
    router.refresh();
  }

  const canClose = isOpen && (p.met || isAdmin);

  return (
    <div className="space-y-3">
      {isOpen && (
        <div className="flex flex-wrap gap-2">
          <button
            className={BTN}
            disabled={!nominated || !!busy}
            onClick={() =>
              run(
                'send',
                () => sendIcsaRequests(enrollmentId),
                (r) => {
                  const d = (
                    r as { data: { sent: number; emailed: number; emailError: string | null } }
                  ).data;
                  return d.emailError
                    ? {
                        tone: 'warn',
                        text: `${d.sent} request${d.sent === 1 ? '' : 's'} recorded; ${d.emailed} emailed. ${d.emailError} They will see the form when they open ICSA.`,
                      }
                    : {
                        tone: 'ok',
                        text: `Sent to ${d.sent} ${d.sent === 1 ? 'person' : 'people'}.`,
                      };
                },
              )
            }
          >
            <Send className="h-4 w-4" />{' '}
            {busy === 'send' ? 'Sending…' : `Send requests${nominated ? ` (${nominated})` : ''}`}
          </button>
          <button
            className={BTN_QUIET}
            disabled={!outstanding || !!busy}
            onClick={() =>
              run(
                'remind',
                () => sendIcsaReminders(enrollmentId),
                (r) => {
                  const d = (r as { data: { reminded: number; failed: number } }).data;
                  return {
                    tone: d.failed ? 'warn' : 'ok',
                    text: `Reminded ${d.reminded}${d.failed ? `; ${d.failed} could not be emailed` : ''}.`,
                  };
                },
              )
            }
          >
            <Bell className="h-4 w-4" />{' '}
            {busy === 'remind' ? 'Sending…' : `Remind everyone outstanding (${outstanding})`}
          </button>
          <button
            className={BTN_QUIET}
            disabled={!canClose}
            title={canClose ? '' : `Available once ${p.thresholdPct}% have responded`}
            onClick={() => setMode('close')}
          >
            Close country
          </button>
          {!pendingExtension && (
            <button className={BTN_QUIET} onClick={() => setMode('extend')}>
              Request extension
            </button>
          )}
        </div>
      )}

      {pendingExtension && isOpen && (
        <Banner tone="warn">
          Extension to <b>{fmtDate(pendingExtension.requestedDeadline)}</b> requested and waiting
          for the administrator: “{pendingExtension.reason}”
        </Banner>
      )}

      {mode === 'close' && (
        <div className={`${CARD} p-4`}>
          <h3 className="font-bold text-slate-800">Close this country for the cycle?</h3>
          <p className="mt-1 text-sm text-slate-600">
            {p.responded} of {p.requested} have responded ({pct(p.rate)}, threshold {p.thresholdPct}
            %). Anyone who has not submitted will be recorded as not completed and can no longer
            answer.
            {!p.met &&
              isAdmin &&
              ' The threshold has not been met; you are closing it as administrator.'}
          </p>
          <label className={`${LABEL} mt-3`} htmlFor="close-note">
            Note (optional)
          </label>
          <input
            id="close-note"
            className={INPUT}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button
              className={BTN_DANGER}
              disabled={!!busy}
              onClick={() =>
                run(
                  'close',
                  () => closeIcsaEnrollment(enrollmentId, note),
                  () => ({ tone: 'ok', text: 'Closed.' }),
                )
              }
            >
              {busy === 'close' ? 'Closing…' : 'Close country'}
            </button>
            <button className={BTN_QUIET} onClick={() => setMode('none')}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'extend' && (
        <div className={`${CARD} p-4`}>
          <h3 className="font-bold text-slate-800">Ask the administrator for more time</h3>
          <p className="mt-1 text-sm text-slate-600">
            The current deadline is {fmtDate(deadline)}. If it passes without an approved extension,
            the country is force-closed.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
            <div>
              <label className={LABEL} htmlFor="ext-date">
                New deadline
              </label>
              <input
                id="ext-date"
                type="date"
                className={INPUT}
                min={deadline}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="ext-reason">
                Why more time is needed
              </label>
              <input
                id="ext-reason"
                className={INPUT}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              className={BTN}
              disabled={!!busy}
              onClick={() =>
                run(
                  'extend',
                  () => requestIcsaExtension(enrollmentId, date, note),
                  () => ({ tone: 'ok', text: 'Extension requested.' }),
                )
              }
            >
              {busy === 'extend' ? 'Sending…' : 'Send request'}
            </button>
            <button className={BTN_QUIET} onClick={() => setMode('none')}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {notice && (
        <Banner tone={notice.tone === 'ok' ? 'ok' : notice.tone === 'warn' ? 'warn' : 'error'}>
          {notice.text}
        </Banner>
      )}
    </div>
  );
}

/* ─── Section picker ────────────────────────────────────────────────────────────────────── */

function SectionPicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ICSA_SECTIONS.map((s) => {
        const on = value.includes(s.key);
        return (
          <button
            key={s.key}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            title={s.title}
            onClick={() => onChange(on ? value.filter((k) => k !== s.key) : [...value, s.key])}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              on
                ? 'border-[#307c4c] bg-[#307c4c] text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-[#307c4c]/40'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {s.id}. {s.short} <span className="opacity-70">({s.questions.length})</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Nominate ──────────────────────────────────────────────────────────────────────────── */

export function NominatePanel({
  enrollmentId,
  country,
  already,
}: {
  enrollmentId: number;
  country: string;
  already: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState({ country, department: '', jobTitle: '', q: '' });
  const [departments, setDepartments] = useState<string[]>([]);
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [picked, setPicked] = useState<Map<string, DirectoryPerson>>(new Map());
  const [sections, setSections] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const taken = useMemo(() => new Set(already.map((e) => e.toLowerCase())), [already]);

  useEffect(() => {
    if (!open) return;
    icsaDirectoryDepartments(filter.country || null).then(setDepartments);
  }, [open, filter.country]);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    const res = await searchIcsaDirectory(filter);
    setBusy(false);
    setSearched(true);
    setPeople(res.people);
    setTruncated(res.truncated);
    if (res.error) setNotice({ tone: 'error', text: res.error });
  }

  async function add() {
    setBusy(true);
    setNotice(null);
    const res = await nominateIcsaRespondents(
      enrollmentId,
      [...picked.values()].map((p) => ({
        email: p.email,
        name: p.name,
        jobTitle: p.jobTitle,
        department: p.department,
      })),
      sections,
    );
    setBusy(false);
    if (!res.success) return setNotice({ tone: 'error', text: res.error ?? 'Could not add them.' });
    const d = res.data!;
    setNotice({
      tone: d.skipped.length ? 'warn' : 'ok',
      text: `Added ${d.added}.${d.skipped.length ? ` Already nominated: ${d.skipped.join(', ')}.` : ''} Send the requests when everyone is on the list.`,
    });
    setPicked(new Map());
    router.refresh();
  }

  if (!open) {
    return (
      <button className={BTN} onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Nominate respondents
      </button>
    );
  }

  const selectable = people.filter((p) => !taken.has(p.email));
  const allPicked = selectable.length > 0 && selectable.every((p) => picked.has(p.email));

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-800">Nominate respondents</h2>
          <p className="mt-1 text-sm text-slate-500">
            Find people in the Azure AD directory, tick them, and choose the form sections that
            match what they do. Each person gets their own form, even if a colleague does the same
            process.
          </p>
        </div>
        <button className={BTN_QUIET} onClick={() => setOpen(false)}>
          Done
        </button>
      </div>

      <form
        onSubmit={search}
        className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[160px_1fr_1fr_1fr_auto]"
      >
        <div>
          <label className={LABEL} htmlFor="f-country">
            Country
          </label>
          <select
            id="f-country"
            className={INPUT}
            value={filter.country}
            onChange={(e) => setFilter({ ...filter, country: e.target.value, department: '' })}
          >
            <option value="">Any</option>
            {ICSA_COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="f-dept">
            Department
          </label>
          <select
            id="f-dept"
            className={INPUT}
            value={filter.department}
            onChange={(e) => setFilter({ ...filter, department: e.target.value })}
          >
            <option value="">Any</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="f-job">
            Job title contains
          </label>
          <input
            id="f-job"
            className={INPUT}
            value={filter.jobTitle}
            placeholder="e.g. Storekeeper, Buyer"
            onChange={(e) => setFilter({ ...filter, jobTitle: e.target.value })}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="f-q">
            Name or email
          </label>
          <input
            id="f-q"
            className={INPUT}
            value={filter.q}
            onChange={(e) => setFilter({ ...filter, q: e.target.value })}
          />
        </div>
        <div className="flex items-end">
          <button className={`${BTN} w-full`} disabled={busy}>
            <Search className="h-4 w-4" /> Search
          </button>
        </div>
      </form>

      {searched && (
        <div className="mt-4 max-h-[360px] overflow-auto rounded-xl border border-slate-200">
          {people.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Nobody matches. Loosen a filter.</p>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className={`${TH} w-10`}>
                    <input
                      type="checkbox"
                      aria-label="Select everyone shown"
                      checked={allPicked}
                      onChange={() => {
                        const next = new Map(picked);
                        if (allPicked) selectable.forEach((p) => next.delete(p.email));
                        else selectable.forEach((p) => next.set(p.email, p));
                        setPicked(next);
                      }}
                    />
                  </th>
                  <th className={TH}>Name</th>
                  <th className={TH}>Job title</th>
                  <th className={TH}>Department</th>
                  <th className={TH}>Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {people.map((p) => {
                  const done = taken.has(p.email);
                  return (
                    <tr key={p.email} className={done ? 'opacity-50' : 'hover:bg-[#307c4c]/5'}>
                      <td className={TD}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${p.name}`}
                          disabled={done}
                          checked={picked.has(p.email)}
                          onChange={() => {
                            const next = new Map(picked);
                            if (next.has(p.email)) next.delete(p.email);
                            else next.set(p.email, p);
                            setPicked(next);
                          }}
                        />
                      </td>
                      <td className={TD}>
                        <p className="font-medium text-slate-800">{p.name}</p>
                        <p className="text-xs text-slate-500">
                          {p.email}
                          {done ? ' · already nominated' : ''}
                        </p>
                      </td>
                      <td className={TD}>{p.jobTitle ?? '–'}</td>
                      <td className={TD}>{p.department ?? '–'}</td>
                      <td className={TD}>{p.country ?? '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {truncated && (
            <p className="border-t border-slate-200 p-2 text-xs text-slate-500">
              Showing the first 200. Narrow the filters to see the rest.
            </p>
          )}
        </div>
      )}

      <div className="mt-4">
        <p className={LABEL}>Form sections for the {picked.size || ''} selected</p>
        <SectionPicker value={sections} onChange={setSections} />
        <p className="mt-1 text-xs text-slate-500">
          Pick every process the person is involved in, for example Vendor and Sourcing plus PO
          Lifecycle for a buyer.
        </p>
      </div>
      {notice && (
        <div className="mt-3">
          <Banner tone={notice.tone === 'ok' ? 'ok' : notice.tone === 'warn' ? 'warn' : 'error'}>
            {notice.text}
          </Banner>
        </div>
      )}
      <div className="mt-4">
        <button className={BTN} disabled={busy || !picked.size || !sections.length} onClick={add}>
          Add {picked.size || ''} {picked.size === 1 ? 'person' : 'people'} to the list
        </button>
      </div>
    </div>
  );
}

/* ─── Response tracking ─────────────────────────────────────────────────────────────────── */

export function RespondentsTable({
  enrollmentId,
  rows,
  isOpen,
}: {
  enrollmentId: number;
  rows: RespondentRow[];
  isOpen: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'outstanding' | 'responded'>('all');

  const shown = rows.filter((r) =>
    statusFilter === 'all'
      ? true
      : statusFilter === 'outstanding'
        ? AWAITING_RESPONDENT.includes(r.status) || r.status === 'nominated'
        : r.status === 'submitted' || r.status === 'reviewed',
  );
  const remindable = shown.filter((r) => AWAITING_RESPONDENT.includes(r.status));

  async function act(fn: () => Promise<{ success: boolean; error?: string }>, okText?: string) {
    setBusy(true);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    if (!res.success) return setNotice({ tone: 'error', text: res.error ?? 'That did not work.' });
    if (okText) setNotice({ tone: 'ok', text: okText });
    router.refresh();
  }

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="font-bold text-slate-800">Response tracking</h2>
          <p className="text-xs text-slate-500">{rows.length} nominated</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${INPUT} w-auto`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            aria-label="Filter by status"
          >
            <option value="all">Everyone</option>
            <option value="outstanding">Outstanding</option>
            <option value="responded">Responded</option>
          </select>
          {isOpen && (
            <button
              className={`${BTN_QUIET} ${BTN_SM}`}
              disabled={busy || !selected.size}
              onClick={() =>
                act(
                  () => sendIcsaReminders(enrollmentId, [...selected]),
                  `Reminder sent to ${selected.size}.`,
                ).then(() => setSelected(new Set()))
              }
            >
              <Bell className="h-3.5 w-3.5" /> Remind selected ({selected.size})
            </button>
          )}
        </div>
      </div>
      {notice && (
        <div className="px-4 pt-3">
          <Banner tone={notice.tone === 'ok' ? 'ok' : 'error'}>{notice.text}</Banner>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">Nobody nominated yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className={`${TH} w-10`}>
                  {isOpen && remindable.length > 0 && (
                    <input
                      type="checkbox"
                      aria-label="Select everyone outstanding"
                      checked={remindable.every((r) => selected.has(r.id))}
                      onChange={(e) =>
                        setSelected(new Set(e.target.checked ? remindable.map((r) => r.id) : []))
                      }
                    />
                  )}
                </th>
                {[
                  'Respondent',
                  'Role',
                  'Form sections',
                  'Status',
                  'Completion',
                  'Compliance',
                  'Last reminded',
                  '',
                ].map((h) => (
                  <th key={h} className={TH}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => {
                const canEditSections =
                  isOpen && (r.status === 'nominated' || r.status === 'requested');
                return (
                  <tr key={r.id} className="hover:bg-[#307c4c]/5">
                    <td className={TD}>
                      {isOpen && AWAITING_RESPONDENT.includes(r.status) && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.name ?? r.email}`}
                          checked={selected.has(r.id)}
                          onChange={() => {
                            const next = new Set(selected);
                            if (next.has(r.id)) next.delete(r.id);
                            else next.add(r.id);
                            setSelected(next);
                          }}
                        />
                      )}
                    </td>
                    <td className={TD}>
                      <p className="font-medium text-slate-800">{r.name ?? r.email}</p>
                      <p className="text-xs text-slate-500">{r.email}</p>
                    </td>
                    <td className={TD}>
                      <p>{r.jobTitle ?? '–'}</p>
                      <p className="text-xs text-slate-500">{r.department ?? ''}</p>
                    </td>
                    <td className={`${TD} max-w-[320px]`}>
                      {editing === r.id ? (
                        <div className="space-y-2">
                          <SectionPicker value={draft} onChange={setDraft} disabled={busy} />
                          <div className="flex gap-2">
                            <button
                              className={`${BTN} ${BTN_SM}`}
                              disabled={busy || !draft.length}
                              onClick={() =>
                                act(() => setIcsaRespondentSections(r.id, draft)).then(() =>
                                  setEditing(null),
                                )
                              }
                            >
                              Save
                            </button>
                            <button
                              className={`${BTN_QUIET} ${BTN_SM}`}
                              onClick={() => setEditing(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          {ICSA_SECTIONS.filter((s) => r.sections.includes(s.key)).map((s) => (
                            <span
                              key={s.key}
                              className="rounded-full bg-[#307c4c]/10 px-2 py-0.5 text-xs font-semibold text-[#307c4c]"
                              title={s.title}
                            >
                              {s.short}
                            </span>
                          ))}
                          {canEditSections && (
                            <button
                              className="text-xs font-semibold text-slate-500 hover:text-[#307c4c] hover:underline"
                              onClick={() => {
                                setEditing(r.id);
                                setDraft(r.sections);
                              }}
                            >
                              Change
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className={TD}>
                      <AssessmentPill status={r.status} />
                      {r.submittedAt && (
                        <p className="mt-1 text-xs text-slate-500">{fmtDate(r.submittedAt)}</p>
                      )}
                    </td>
                    <td className={TD}>{r.status === 'nominated' ? '–' : pct(r.comp)}</td>
                    <td className={TD}>
                      {r.status === 'submitted' || r.status === 'reviewed' ? pct(r.rate) : '–'}
                    </td>
                    <td className={TD}>
                      {r.lastRemindedAt ? (
                        <>
                          {fmtDate(r.lastRemindedAt)}
                          <p className="text-xs text-slate-500">{r.reminderCount}×</p>
                        </>
                      ) : (
                        '–'
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-right`}>
                      {r.status !== 'nominated' && (
                        <Link
                          href={`/icsa/assessments/${r.id}`}
                          className="font-semibold text-[#307c4c] hover:underline"
                        >
                          {r.status === 'submitted' ? 'Review' : 'View'}
                        </Link>
                      )}
                      {isOpen && AWAITING_RESPONDENT.includes(r.status) && (
                        <button
                          className="ml-3 text-slate-500 hover:text-[#307c4c]"
                          title="Send a reminder"
                          aria-label={`Remind ${r.name ?? r.email}`}
                          disabled={busy}
                          onClick={() =>
                            act(
                              () => sendIcsaReminders(enrollmentId, [r.id]),
                              `Reminder sent to ${r.name ?? r.email}.`,
                            )
                          }
                        >
                          <Bell className="inline h-4 w-4" />
                        </button>
                      )}
                      {isOpen && r.status === 'nominated' && (
                        <button
                          className="ml-3 text-slate-400 hover:text-red-600"
                          title="Remove from the list"
                          aria-label={`Remove ${r.name ?? r.email}`}
                          disabled={busy}
                          onClick={() => act(() => removeIcsaNominee(r.id))}
                        >
                          <Trash2 className="inline h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
