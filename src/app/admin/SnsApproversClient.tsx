'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  bulkUpsertSnsCountryManagers,
  deleteSnsCategoryManager,
  deleteSnsCountryManager,
  getSnsApproverAdminData,
  getSnsSpendCategories,
  setSnsCategoryManagerActive,
  setSnsCountryManagerActive,
  upsertSnsCategoryManager,
  upsertSnsCountryManager,
} from '@/app/actions/sns-approvers';
import type {
  CategoryManager,
  CountryManager,
  SnsApproverAdminData,
} from '@/app/actions/sns-approvers';

const BRAND = '#2A7E4F';
type Tab = 'level1' | 'level2';
type Result = { success: boolean; error?: string };
type RunFn = (fn: () => Promise<Result>) => Promise<boolean>;

export default function SnsApproversClient() {
  const [data, setData] = useState<SnsApproverAdminData | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('level1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [admin, cats] = await Promise.all([getSnsApproverAdminData(), getSnsSpendCategories()]);
    setData(admin);
    setCategories(cats);
  }, []);

  useEffect(() => {
    // Mount-time load from the database — the carve-out this rule allows.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const run = useCallback<RunFn>(
    async (fn) => {
      setBusy(true);
      setError(null);
      const res = await fn();
      setBusy(false);
      if (!res.success) {
        setError(res.error ?? 'Action failed.');
        return false;
      }
      await reload();
      return true;
    },
    [reload],
  );

  if (!data)
    return <div className="py-16 text-center text-sm text-slate-400">Loading approvers…</div>;

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold tracking-tight text-slate-900">
        S&amp;S Registry · Approvers
      </h2>
      <p className="mb-5 max-w-3xl text-[13px] leading-relaxed text-slate-500">
        Who signs a record off, and who gets emailed when one is waiting. A record goes to its
        country&rsquo;s Supply Chain Manager at Level 1, then to the Category Manager for any
        category it touches — or to a Supply Chain Director, who can sign off anything. Where a
        record spans several categories, any one of the resolved approvers may sign it.
      </p>

      <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
        {[
          { key: 'level1' as const, label: 'Level 1 · Country Managers' },
          { key: 'level2' as const, label: 'Level 2 · Category Managers' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setError(null);
              setNotice(null);
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-[13px] font-semibold transition-colors ${
              tab === t.key
                ? 'border-[#2A7E4F] text-[#1d5b39]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
          {notice}
        </div>
      )}

      {tab === 'level1' && (
        <Level1Tab
          data={data}
          busy={busy}
          run={run}
          setBusy={setBusy}
          setError={setError}
          setNotice={setNotice}
          reload={reload}
        />
      )}
      {tab === 'level2' && <Level2Tab data={data} categories={categories} busy={busy} run={run} />}
    </div>
  );
}

/* ─── Shared ──────────────────────────────────────────────────── */

function GapWarning({
  items,
  singular,
  plural,
}: {
  items: string[];
  singular: string;
  plural: string;
}) {
  if (items.length === 0) return null;
  const noun = items.length === 1 ? singular : plural;
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
      <span className="font-semibold">
        {items.length} {noun} without an approver:
      </span>{' '}
      {items.join(', ')}.
      <div className="mt-1 text-amber-800">
        {items.length === 1 ? 'Records in it fall' : `Records in these ${plural} fall`} back to the
        role grant alone, so anyone holding the validator role can sign them off and no one is
        emailed by name.
      </div>
    </div>
  );
}

function ManagerFields({
  name,
  email,
  title,
  onName,
  onEmail,
  onTitle,
}: {
  name: string;
  email: string;
  title: string;
  onName: (v: string) => void;
  onEmail: (v: string) => void;
  onTitle: (v: string) => void;
}) {
  const cls =
    'min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#2A7E4F]';
  return (
    <>
      <input
        value={name}
        onChange={(e) => onName(e.target.value)}
        placeholder="Full name"
        className={cls}
      />
      <input
        value={email}
        onChange={(e) => onEmail(e.target.value)}
        placeholder="name@nesr.com"
        className={cls}
      />
      <input
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        placeholder="Title"
        className={cls}
      />
    </>
  );
}

/** One assigned approver, editable in place. */
function ManagerRow({
  scopeLabel,
  manager,
  busy,
  onSave,
  onToggle,
  onDelete,
}: {
  scopeLabel: string;
  manager: CountryManager | CategoryManager;
  busy: boolean;
  onSave: (name: string, email: string, title: string) => Promise<boolean>;
  onToggle: () => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(manager.name);
  const [email, setEmail] = useState(manager.email);
  const [title, setTitle] = useState(manager.title);

  function reset() {
    setName(manager.name);
    setEmail(manager.email);
    setTitle(manager.title);
    setEditing(false);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-40 shrink-0 text-[12.5px] font-semibold text-slate-800">
          {scopeLabel}
        </span>

        {editing ? (
          <>
            <ManagerFields
              name={name}
              email={email}
              title={title}
              onName={setName}
              onEmail={setEmail}
              onTitle={setTitle}
            />
            <button
              disabled={busy}
              onClick={async () => {
                if (await onSave(name, email, title)) setEditing(false);
              }}
              className="rounded px-2 py-1 text-[11.5px] font-semibold text-[#1d5b39] hover:bg-slate-50"
            >
              Save
            </button>
            <button
              onClick={reset}
              className="rounded px-2 py-1 text-[11.5px] font-semibold text-slate-400 hover:bg-slate-50"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            {/* min-w-0 lets a long email truncate instead of pushing the action
                buttons onto a second line. */}
            <div
              className={`min-w-0 flex-1 ${manager.active ? 'text-slate-700' : 'text-slate-400'}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                <span className="font-medium">
                  {manager.name || <span className="italic text-slate-400">no name</span>}
                </span>
                <span className="truncate font-mono text-[11.5px] text-slate-500">
                  {manager.email}
                </span>
                {!manager.active && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-400">
                    Inactive
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400">{manager.title}</div>
            </div>

            {/* Kept together so the group never breaks mid-way across lines. */}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                onClick={() => setEditing(true)}
                className="rounded px-2 py-1 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-50"
              >
                Edit
              </button>
              <button
                disabled={busy}
                onClick={onToggle}
                className="rounded px-2 py-1 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-50"
              >
                {manager.active ? 'Deactivate' : 'Reactivate'}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (confirm(`Remove ${manager.email} as the approver for ${scopeLabel}?`))
                    void onDelete();
                }}
                className="rounded px-2 py-1 text-[11.5px] font-semibold text-red-500 hover:bg-red-50"
              >
                Remove
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Level 1 ─────────────────────────────────────────────────── */

/**
 * Splits a pasted list into rows.
 *
 * Accepts tab- or comma-separated text so a block copied straight out of Excel
 * or Outlook works without being reformatted first — retyping thirteen email
 * addresses by hand is exactly how the wrong person ends up approving.
 */
function parsePastedManagers(text: string): { country: string; name: string; email: string }[] {
  const out: { country: string; name: string; email: string }[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const cells = (trimmed.includes('\t') ? trimmed.split('\t') : trimmed.split(',')).map((c) =>
      c.trim(),
    );
    // The email is found by shape rather than by position, so a list that runs
    // country/email/name still lands correctly.
    const emailIndex = cells.findIndex((c) => c.includes('@'));
    if (emailIndex < 0 || cells.length < 2) continue;

    const email = cells[emailIndex];
    const rest = cells.filter((_, i) => i !== emailIndex);
    const country = rest[0] ?? '';
    const name = rest[1] ?? '';
    if (!country) continue;

    out.push({ country, name, email });
  }

  // A header row names the columns rather than a country, and never carries an
  // email — so it is dropped by the check above and needs no special case.
  return out;
}

function Level1Tab({
  data,
  busy,
  run,
  setBusy,
  setError,
  setNotice,
  reload,
}: {
  data: SnsApproverAdminData;
  busy: boolean;
  run: RunFn;
  setBusy: (v: boolean) => void;
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
  reload: () => Promise<void>;
}) {
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [newCountry, setNewCountry] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const preview = useMemo(() => parsePastedManagers(paste), [paste]);

  async function importPaste() {
    if (!preview.length) {
      setError('Nothing recognisable in that list — each line needs a country and an email.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await bulkUpsertSnsCountryManagers(preview);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Import failed.');
      return;
    }
    setNotice(`Imported ${res.saved} country manager${res.saved === 1 ? '' : 's'}.`);
    setPaste('');
    setShowPaste(false);
    await reload();
  }

  return (
    <div>
      <GapWarning
        items={data.countriesWithoutManager.map((c) => `${c.name} (${c.code})`)}
        singular="country"
        plural="countries"
      />

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <input
            value={newCountry}
            onChange={(e) => setNewCountry(e.target.value)}
            placeholder="Country code or name"
            list="sns-country-gaps"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#2A7E4F]"
          />
          <datalist id="sns-country-gaps">
            {data.countriesWithoutManager.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </datalist>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Full name"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#2A7E4F]"
          />
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="name@nesr.com"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#2A7E4F]"
          />
        </div>
        <button
          disabled={busy || !newCountry.trim() || !newEmail.includes('@')}
          onClick={async () => {
            if (
              await run(() =>
                upsertSnsCountryManager(
                  newCountry,
                  newName,
                  newEmail,
                  'Country Supply Chain Manager',
                ),
              )
            ) {
              setNewCountry('');
              setNewName('');
              setNewEmail('');
            }
          }}
          className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
          style={{ background: BRAND }}
        >
          Assign
        </button>
        <button
          onClick={() => setShowPaste((v) => !v)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-white"
        >
          {showPaste ? 'Close list import' : 'Paste a list'}
        </button>
      </div>

      {showPaste && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-3">
          <div className="mb-2 text-[12.5px] text-slate-500">
            One country per line, as{' '}
            <span className="font-mono text-[11.5px]">Country, Name, email@nesr.com</span> — tabs or
            commas both work, so a block copied out of Excel pastes straight in. Existing countries
            are updated, not duplicated.
          </div>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={8}
            placeholder={
              'Kuwait, Ahmed Al-Sabah, a.alsabah@nesr.com\nIraq, Layla Hassan, l.hassan@nesr.com'
            }
            className="w-full rounded-lg border border-slate-200 px-2.5 py-2 font-mono text-[12px] outline-none focus:border-[#2A7E4F]"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] text-slate-500">
              {preview.length
                ? `${preview.length} row${preview.length === 1 ? '' : 's'} recognised: ${preview.map((p) => p.country).join(', ')}`
                : 'Nothing recognised yet.'}
            </span>
            <button
              disabled={busy || !preview.length}
              onClick={importPaste}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
              style={{ background: BRAND }}
            >
              Import {preview.length || ''}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {data.countryManagers.map((m) => (
          <ManagerRow
            key={m.id}
            scopeLabel={`${m.countryName} · ${m.countryCode}`}
            manager={m}
            busy={busy}
            onSave={(name, email, title) =>
              run(() => upsertSnsCountryManager(m.countryCode, name, email, title))
            }
            onToggle={() => run(() => setSnsCountryManagerActive(m.id, !m.active))}
            onDelete={() => run(() => deleteSnsCountryManager(m.id))}
          />
        ))}
        {data.countryManagers.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center text-[13px] text-slate-400">
            No Country Supply Chain Managers assigned yet.
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Level 2 ─────────────────────────────────────────────────── */

function Level2Tab({
  data,
  categories,
  busy,
  run,
}: {
  data: SnsApproverAdminData;
  categories: string[];
  busy: boolean;
  run: RunFn;
}) {
  const [newCategory, setNewCategory] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newTitle, setNewTitle] = useState('');

  const [dirName, setDirName] = useState('');
  const [dirEmail, setDirEmail] = useState('');

  const directors = data.categoryManagers.filter((m) => m.category === null);
  const perCategory = data.categoryManagers.filter((m) => m.category !== null);

  return (
    <div>
      <GapWarning items={data.categoriesWithoutManager} singular="category" plural="categories" />

      {categories.length === 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          No spend categories could be read from SourceGuide, so there is nothing to assign against.
          Managers already saved still work — this list is only the picker.
        </div>
      )}

      <h3 className="mb-2 text-[13px] font-bold text-slate-800">Category Managers</h3>
      <p className="mb-3 max-w-3xl text-[12.5px] leading-relaxed text-slate-500">
        One manager per spend category — the Facility Manager for Facility, the Chemicals Manager
        for Chemicals, and so on. Categories come from the same taxonomy the wizard uses, so they
        always match what a record can be raised against.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Category"
            list="sns-category-list"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#2A7E4F]"
          />
          <datalist id="sns-category-list">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <ManagerFields
            name={newName}
            email={newEmail}
            title={newTitle}
            onName={setNewName}
            onEmail={setNewEmail}
            onTitle={setNewTitle}
          />
        </div>
        <button
          disabled={busy || !newCategory.trim() || !newEmail.includes('@')}
          onClick={async () => {
            if (
              await run(() => upsertSnsCategoryManager(newCategory, newName, newEmail, newTitle))
            ) {
              setNewCategory('');
              setNewName('');
              setNewEmail('');
              setNewTitle('');
            }
          }}
          className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
          style={{ background: BRAND }}
        >
          Assign
        </button>
      </div>

      <div className="mb-8 flex flex-col gap-2">
        {perCategory.map((m) => (
          <ManagerRow
            key={m.id}
            scopeLabel={m.category as string}
            manager={m}
            busy={busy}
            onSave={(name, email, title) =>
              run(() => upsertSnsCategoryManager(m.category, name, email, title))
            }
            onToggle={() => run(() => setSnsCategoryManagerActive(m.id, !m.active))}
            onDelete={() => run(() => deleteSnsCategoryManager(m.id))}
          />
        ))}
        {perCategory.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center text-[13px] text-slate-400">
            No Category Managers assigned yet.
          </div>
        )}
      </div>

      <h3 className="mb-2 text-[13px] font-bold text-slate-800">Supply Chain Directors</h3>
      <p className="mb-3 max-w-3xl text-[12.5px] leading-relaxed text-slate-500">
        A director may sign off any record, whatever its categories, and is copied on every Level 2
        request. Add more than one if sign-off is shared.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
        <input
          value={dirName}
          onChange={(e) => setDirName(e.target.value)}
          placeholder="Full name"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#2A7E4F]"
        />
        <input
          value={dirEmail}
          onChange={(e) => setDirEmail(e.target.value)}
          placeholder="name@nesr.com"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#2A7E4F]"
        />
        <button
          disabled={busy || !dirEmail.includes('@')}
          onClick={async () => {
            if (
              await run(() =>
                upsertSnsCategoryManager(null, dirName, dirEmail, 'Supply Chain Director'),
              )
            ) {
              setDirName('');
              setDirEmail('');
            }
          }}
          className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
          style={{ background: BRAND }}
        >
          Add director
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {directors.map((m) => (
          <ManagerRow
            key={m.id}
            scopeLabel="All categories"
            manager={m}
            busy={busy}
            onSave={(name, email, title) =>
              run(() => upsertSnsCategoryManager(null, name, email, title))
            }
            onToggle={() => run(() => setSnsCategoryManagerActive(m.id, !m.active))}
            onDelete={() => run(() => deleteSnsCategoryManager(m.id))}
          />
        ))}
        {directors.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center text-[13px] text-slate-400">
            No Supply Chain Director on file. Until one is added, a record whose category has no
            manager falls back to the role grant alone.
          </div>
        )}
      </div>
    </div>
  );
}
