'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import {
  advanceSnsRecord,
  createSnsRecord,
  getSnsRecords,
  rejectSnsRecord,
  startSnsReview,
} from '@/app/actions/sns';
import { clsLabel, displayStatus, nodeKey } from './helpers';
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
}

export function useRegistryApp({ viewer, reference, initialRecords }: RegistryAppInit) {
  const [records, setRecords] = useState<RegistryRecord[]>(initialRecords);
  const [screen, setScreen] = useState<Screen>('registry');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [step, setStep] = useState(1);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [browse, setBrowse] = useState<Browse>({ cat: '', sub: '', fam: '' });
  const [copied, setCopied] = useState(false);
  const [rejectFor, setRejectFor] = useState<number | null>(null);
  const [rejectText, setRejectText] = useState('');
  const [inboxTab, setInboxTab] = useState<'l1' | 'l2'>('l1');
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
   * believed was allowed.
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
    setDraftState({
      cls: 'SGL',
      country: viewer.countries.length === 1 ? viewer.countries[0] : '',
      level: 'Family',
      nodes: [],
      segments: [],
      supplierId: '',
      supplierName: '',
      spend: '',
      reason: '',
      justification: '',
      evidence: '',
    });
    setBrowse(defaultBrowse());
  }, [viewer.countries, defaultBrowse]);

  const setDraft = useCallback((patch: Partial<Draft>) => {
    setDraftState((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const cancelDraft = useCallback(() => {
    setDraftState(null);
    setScreen('registry');
    setError(null);
  }, []);

  const toggleNode = useCallback((node: ScopeNode) => {
    setDraftState((prev) => {
      if (!prev) return prev;
      const k = nodeKey(node);
      const has = prev.nodes.some((n) => nodeKey(n) === k);
      return { ...prev, nodes: has ? prev.nodes.filter((n) => nodeKey(n) !== k) : prev.nodes.concat([node]) };
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

  const commit = useCallback(
    (base: 'Draft' | 'Pending Level 1') => {
      if (!draft) return;
      setError(null);
      startTransition(async () => {
        const res = await createSnsRecord(draft, base);
        if (!res.success) {
          setError(res.error ?? 'Could not save the record.');
          return;
        }
        setRecords(await getSnsRecords());
        setScreen('detail');
        setSelectedId(res.rid ?? null);
        setDraftState(null);
        setStep(1);
      });
    },
    [draft],
  );

  const advance = useCallback((rid: number) => run(() => advanceSnsRecord(rid)), [run]);

  const reject = useCallback(
    (rid: number, text: string) => {
      run(() => rejectSnsRecord(rid, text), () => {
        setRejectFor(null);
        setRejectText('');
      });
    },
    [run],
  );

  const startReview = useCallback((rid: number) => run(() => startSnsReview(rid)), [run]);

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
    const header = ['Registry ID', 'Classification', 'Country', 'Scope level', 'Scope', 'Segments', 'Supplier SAP ID', 'Supplier SAP Name', 'Reason code', 'Status', 'Issue date', 'Expiry date', 'Annual spend USD', 'PO/RFQ count'];
    const rows = [header, ...filteredRecords.map((r) => [
      r.id || '(not issued)', clsLabel(r.cls), r.country, r.level,
      r.nodes.map((n) => n.com || n.fam).join('; '), r.segments.join('; '),
      r.supplierId, r.supplierName, r.reason, displayStatus(r),
      r.issue || '', r.expiry || '', String(r.spend), String(r.poCount),
    ])];
    const csv = rows.map((row) => row.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
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
   * Countries this viewer may raise or validate records for. An empty approved
   * list means unrestricted, which is also how admins are stored.
   */
  const actionableCountries = useMemo(
    () => (viewer.countries.length === 0 ? countries.map((c) => c[0]) : viewer.countries),
    [viewer.countries, countries],
  );

  const canActOn = useCallback(
    (country: string) => viewer.countries.length === 0 || viewer.countries.includes(country),
    [viewer.countries],
  );

  return {
    viewer,
    records,
    screen,
    roleKind: viewer.roleKind,
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
    startReview,
    exportCsv,
    onCopyId,
  };
}

export type RegistryApp = ReturnType<typeof useRegistryApp>;
