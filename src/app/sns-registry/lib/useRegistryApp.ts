'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  advanceSnsRecord,
  createSnsRecord,
  getSnsRecords,
  rejectSnsRecord,
} from '@/app/actions/sns';
import { clsLabel, displayStatus, nodeKey, recordLabel } from './helpers';
import type {
  Draft,
  ReferenceData,
  RegistryRecord,
  ScopeLevel,
  ScopeNode,
  Screen,
  SnsViewer,
} from './types';

export interface Filters {
  q: string;
  fCountry: string;
  fCls: string;
  fStatus: string;
  fSeg: string;
}

const DEFAULT_FILTERS: Filters = {
  q: '',
  fCountry: 'All countries',
  fCls: 'All classifications',
  fStatus: 'All statuses',
  fSeg: 'All segments',
};

export interface Browse {
  cat: string;
  sub: string;
  fam: string;
}

export interface RegistryAppInit {
  viewer: SnsViewer;
  reference: ReferenceData;
  initialRecords: RegistryRecord[];
  /** From `?record=`, the deep link every notification email carries. */
  initialRecordId?: number | null;
}

export function useRegistryApp({
  viewer,
  reference,
  initialRecords,
  initialRecordId = null,
}: RegistryAppInit) {
  const [records, setRecords] = useState<RegistryRecord[]>(initialRecords);
  const [screen, setScreen] = useState<Screen>(initialRecordId ? 'detail' : 'registry');
  const [selectedId, setSelectedId] = useState<number | null>(initialRecordId);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [step, setStep] = useState(1);
  const [draft, setDraftState] = useState<Draft | null>(null);
  /** Set when the open draft is a periodic review, naming the record it replaces. */
  const [renewalOf, setRenewalOf] = useState<number | null>(null);
  const [browse, setBrowse] = useState<Browse>({ cat: '', sub: '', fam: '' });
  const [copied, setCopied] = useState(false);
  const [rejectFor, setRejectFor] = useState<number | null>(null);
  const [rejectText, setRejectText] = useState('');
  /* Open on the stage this person validates, not always at Level 1. A Category
     Manager or Supply Chain Director landing on the Level 1 tab was told the
     stage is validated by someone else — which reads as "you cannot do anything
     here" when their own queue was one click away. */
  const [inboxTab, setInboxTab] = useState<'l1' | 'l2'>(
    !viewer.isLevel1 && viewer.isLevel2 ? 'l2' : 'l1',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const { tax, countries, segments, reasons } = reference;

  /** First selectable branch of the taxonomy — where the wizard's browser opens. */
  const defaultBrowse = useCallback((): Browse => {
    const cat = tax[0];
    const sub = cat?.subs[0];
    const fam = sub?.families[0];
    return { cat: cat?.name ?? '', sub: sub?.name ?? '', fam: fam?.name ?? '' };
  }, [tax]);

  /**
   * Every mutation goes through here: run the server action, surface its error
   * if it failed, otherwise re-read the records. Re-reading rather than
   * patching local state keeps this client honest about what the database
   * actually did — server-side permission checks can reject an action the UI
   * believed was allowed. This one re-read is the only refresh: the record
   * mutations no longer `revalidatePath('/sns-registry')` as well, because the
   * RSC re-render it forced reloaded the whole registry a second time into
   * props this hook's `useState` already ignores.
   */
  const run = useCallback(
    (action: () => Promise<{ success: boolean; error?: string }>, onDone?: () => void) => {
      setError(null);
      startTransition(async () => {
        const res = await action();
        if (!res.success) {
          setError(res.error ?? 'Something went wrong.');
          return;
        }
        setRecords(await getSnsRecords());
        onDone?.();
      });
    },
    [],
  );

  /**
   * Keep `?record=` pointing at whatever is on screen.
   *
   * The registry is one page holding its own screen state, so without this the
   * address bar says `/sns-registry` no matter which record you opened — you
   * cannot link a colleague to a case, and the link in a reminder email has
   * nothing to match on when it comes back.
   *
   * history.replaceState rather than the router: this is the same page either
   * way, and router.replace would re-run the server component and refetch
   * every record just to change the query string. Replace rather than push so
   * walking through ten records does not bury the previous page under ten
   * history entries.
   */
  useEffect(() => {
    const url = new URL(window.location.href);
    const want = screen === 'detail' && selectedId ? String(selectedId) : null;
    if (url.searchParams.get('record') === want) return;
    if (want) url.searchParams.set('record', want);
    else url.searchParams.delete('record');
    window.history.replaceState(window.history.state, '', url);
  }, [screen, selectedId]);

  const go = useCallback((next: Screen) => {
    setScreen(next);
    setCopied(false);
    setRejectFor(null);
    setError(null);
  }, []);

  const open = useCallback((rid: number) => {
    setScreen('detail');
    setSelectedId(rid);
    setCopied(false);
    setRejectFor(null);
    setError(null);
  }, []);

  const newDraft = useCallback(() => {
    setScreen('new');
    setStep(1);
    setError(null);
    setRenewalOf(null);
    setDraftState({
      cls: 'SGL',
      expiry: '',
      country:
        viewer.countryCodes.length === 1
          ? (countries.find((c) => c[1] === viewer.countryCodes[0])?.[0] ?? '')
          : '',
      level: 'Family',
      nodes: [],
      segments: [],
      supplierId: '',
      supplierName: '',
      spend: '',
      reason: '',
      justification: '',
    });
    setBrowse(defaultBrowse());
  }, [viewer.countryCodes, countries, defaultBrowse]);

  const setDraft = useCallback((patch: Partial<Draft>) => {
    setDraftState((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const cancelDraft = useCallback(() => {
    setDraftState(null);
    setRenewalOf(null);
    setScreen('registry');
    setError(null);
  }, []);

  const toggleNode = useCallback((node: ScopeNode) => {
    setDraftState((prev) => {
      if (!prev) return prev;
      const k = nodeKey(node);
      const has = prev.nodes.some((n) => nodeKey(n) === k);
      return {
        ...prev,
        nodes: has ? prev.nodes.filter((n) => nodeKey(n) !== k) : prev.nodes.concat([node]),
      };
    });
  }, []);

  const removeNode = useCallback((node: ScopeNode) => {
    setDraftState((prev) => {
      if (!prev) return prev;
      const k = nodeKey(node);
      return { ...prev, nodes: prev.nodes.filter((n) => nodeKey(n) !== k) };
    });
  }, []);

  const setLevel = useCallback((level: ScopeLevel) => {
    setDraftState((prev) => (prev ? { ...prev, level, nodes: [] } : prev));
  }, []);

  /**
   * `onCreated` runs after the record exists and before the records are
   * re-read. Attachments need it: a file chosen in the wizard has nothing to
   * attach to until the insert has returned an rid, so it is uploaded here
   * rather than being carried through the draft.
   *
   * A failure there is surfaced but does not undo the record — the record is
   * the compliance artefact, and losing it because a file upload failed would
   * be the worse outcome.
   */
  const commit = useCallback(
    (base: 'Draft' | 'Pending Level 1', onCreated?: (rid: number) => Promise<string | null>) => {
      if (!draft) return;
      setError(null);
      startTransition(async () => {
        const res = await createSnsRecord(draft, base, renewalOf);
        if (!res.success) {
          setError(res.error ?? 'Could not save the record.');
          return;
        }
        if (onCreated && res.rid) {
          const problem = await onCreated(res.rid);
          if (problem) setError(problem);
        }
        setRecords(await getSnsRecords());
        setScreen('detail');
        setSelectedId(res.rid ?? null);
        setDraftState(null);
        setRenewalOf(null);
        setStep(1);
      });
    },
    [draft, renewalOf],
  );

  const advance = useCallback((rid: number) => run(() => advanceSnsRecord(rid)), [run]);

  const reject = useCallback(
    (rid: number, text: string) => {
      run(
        () => rejectSnsRecord(rid, text),
        () => {
          setRejectFor(null);
          setRejectText('');
        },
      );
    },
    [run],
  );

  /**
   * Opens the wizard on a copy of an existing record, to be renewed.
   *
   * A periodic review raises a new record rather than editing the old one: the
   * Registry ID encodes the validity window it was minted with, so a renewed
   * period needs its own ID. Everything is carried over and everything stays
   * editable — a year on, the supplier, the scope or the reason may genuinely
   * have changed, and forcing a from-scratch re-entry is how details get
   * retyped wrongly.
   *
   * The expiry deliberately does NOT carry over. It is the one field that must
   * be reconsidered, and pre-filling last year's date is the easiest way to
   * have it waved through unchanged.
   */
  const startRenewal = useCallback(
    (rid: number) => {
      const r = records.find((x) => x.rid === rid);
      if (!r) return;
      setRenewalOf(rid);
      setScreen('new');
      setStep(1);
      setError(null);
      setDraftState({
        cls: r.cls,
        country: r.country,
        level: r.level,
        nodes: r.nodes.map((n) => ({ ...n })),
        segments: [...r.segments],
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        spend: r.spend ? String(r.spend) : '',
        reason: r.reason,
        justification: r.justification,
        expiry: '',
      });
      const first = r.nodes[0];
      setBrowse(first ? { cat: first.cat, sub: first.sub, fam: first.fam } : defaultBrowse());
    },
    [records, defaultBrowse],
  );

  const filteredRecords = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return records.filter((r) => {
      if (filters.fCountry !== 'All countries' && r.country !== filters.fCountry) return false;
      if (filters.fCls !== 'All classifications' && clsLabel(r.cls) !== filters.fCls) return false;
      if (filters.fStatus !== 'All statuses' && displayStatus(r) !== filters.fStatus) return false;
      if (filters.fSeg !== 'All segments' && !r.segments.includes(filters.fSeg)) return false;
      if (!q) return true;
      const hay = [r.id || '', r.supplierName, r.supplierId, r.reason, r.justification]
        .concat(r.nodes.map((n) => n.cat + ' ' + n.sub + ' ' + n.fam + ' ' + n.com))
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [records, filters]);

  const exportCsv = useCallback(() => {
    const header = [
      'Registry ID',
      'Classification',
      'Country',
      'Country code',
      'Scope level',
      'Scope',
      'Segments',
      'Supplier SAP ID',
      'Supplier SAP Name',
      'Reason code',
      'Status',
      'Issue date',
      'Expiry date',
      'Annual spend USD',
    ];
    const rows = [
      header,
      ...filteredRecords.map((r) => [
        recordLabel(r),
        clsLabel(r.cls),
        r.country,
        r.countryCode,
        r.level,
        r.nodes.map((n) => n.com || n.fam).join('; '),
        r.segments.join('; '),
        r.supplierId,
        r.supplierName,
        r.reason,
        displayStatus(r),
        r.issue || '',
        r.expiry || '',
        String(r.spend),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'NESR_SS_Registry_Export.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, [filteredRecords]);

  const onCopyId = useCallback((id: string | null) => {
    if (id && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(id);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, []);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  /**
   * What this viewer may see and do, decided once.
   *
   * These were previously inferred separately by the sidebar and by each
   * screen, which is how a Read-only viewer ended up with no "New Record" item
   * in the sidebar but a working "New Registry Record" button on the registry:
   * two places, one of them forgotten. The server gates every action anyway —
   * `createSnsRecord` rejects a non-Requestor — but letting someone fill in a
   * four-step wizard only to be refused at submit is its own kind of broken.
   */
  const can = useMemo(() => {
    const kind = viewer.roleKind;
    const admin = viewer.isAdmin;
    /* Validation authority comes from the Approvers screen, not from a role
       someone asked for — so these read the approver flags rather than
       roleKind, and a person who is both a country manager and a category
       manager gets both. */
    const validates = viewer.isLevel1 || viewer.isLevel2;
    return {
      /** Raise records, and start a periodic review. */
      create: admin || kind === 'req',
      /** The validation queues. Requestors do not validate, so they do not see them. */
      inbox: admin || validates || kind === 'ro' || kind === 'lead',
      /** Leadership reporting. Not part of raising a record. */
      dashboard: admin || kind !== 'req',
      /** Approve, reject, sign off. Read-only never acts. */
      act: admin || validates || kind === 'req',
    };
  }, [viewer.roleKind, viewer.isAdmin, viewer.isLevel1, viewer.isLevel2]);

  /**
   * Countries this viewer may raise or validate records for, by display name.
   * An empty approved list means unrestricted, which is also how admins are
   * stored.
   */
  const actionableCountries = useMemo(
    () =>
      viewer.countryCodes.length === 0
        ? countries.map((c) => c[0])
        : countries.filter((c) => viewer.countryCodes.includes(c[1])).map((c) => c[0]),
    [viewer.countryCodes, countries],
  );

  /**
   * Scope check, by `sns_country.code` rather than display name — the same key
   * the server uses, so renaming a country cannot make the two disagree.
   */
  const canActOn = useCallback(
    (code: string) =>
      viewer.countryCodes.length === 0 || (!!code && viewer.countryCodes.includes(code)),
    [viewer.countryCodes],
  );

  return {
    viewer,
    records,
    screen,
    roleKind: viewer.roleKind,
    can,
    selectedId,
    filters,
    setFilters,
    resetFilters,
    filteredRecords,
    step,
    setStep,
    draft,
    browse,
    setBrowse,
    copied,
    rejectFor,
    setRejectFor,
    rejectText,
    setRejectText,
    inboxTab,
    setInboxTab,
    error,
    setError,
    busy,
    // reference data
    tax,
    countries,
    segments,
    reasons,
    actionableCountries,
    canActOn,
    // navigation + mutations
    go,
    open,
    newDraft,
    setDraft,
    cancelDraft,
    toggleNode,
    removeNode,
    setLevel,
    commit,
    advance,
    reject,
    startRenewal,
    renewalOf,
    exportCsv,
    onCopyId,
  };
}

export type RegistryApp = ReturnType<typeof useRegistryApp>;
