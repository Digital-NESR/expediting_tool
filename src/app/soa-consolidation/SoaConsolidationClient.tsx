'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { csvSafe } from '@/lib/catalog-manager-utils';
import { applySoaScopeSelection, getSoaScopeCandidates } from '@/app/actions/soa/scoping';
import {
  acceptSoaSubmission,
  getSoaExportRows,
  getSoaOutreachFailures,
  handOffSoaCountry,
  markSoaNonResponder,
  recordSoaExport,
  sendSoaOutreach,
  sendSoaOutreachBatch,
  setSoaVendorContacts,
} from '@/app/actions/soa/workflow';
import { deriveViewModel, fmtM } from './lib';
import type { AppState, Handlers, SoaPayload, ToastType, Viewer } from './types';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import ToastStack from './components/ToastStack';
import EmptyState from './components/EmptyState';
import UploadModal from './components/modals/UploadModal';
import HandoffModal from './components/modals/HandoffModal';
import DashboardScreen from './components/screens/DashboardScreen';
import VendorScopingScreen from './components/screens/VendorScopingScreen';
import OutreachScreen from './components/screens/OutreachScreen';
import ResponseTrackingScreen from './components/screens/ResponseTrackingScreen';
import SoaIntakeScreen from './components/screens/SoaIntakeScreen';
import ConsolidationScreen from './components/screens/ConsolidationScreen';
import EvidenceScreen from './components/screens/EvidenceScreen';
import CorporateRollupScreen from './components/screens/CorporateRollupScreen';

// Module-level counter (not component state): it only needs to produce unique toast ids, never to
// be read during render, so a plain counter avoids re-renders and ref lint churn.
let toastIdCounter = 0;

/** One frozen empty set, so a reset does not allocate a new one on every country switch. */
const NO_SELECTION: ReadonlySet<string> = new Set<string>();

const INITIAL: AppState = {
  screen: 'dashboard',
  filterStatus: 'all',
  modal: null,
  toasts: [],
  expandedVendor: null,
  search: '',
  page: 0,
  scopeSearch: '',
  scopePage: 0,
  busy: false,
  failures: null,
  scopeCandidates: null,
  scopeLoading: false,
  scopeError: null,
  scopeSelected: NO_SELECTION,
  scopeSaved: null,
};

/** The vendor numbers a country is already chasing — where a fresh draft starts from. */
function seedSelection(candidates: { vendorNo: string; selected: boolean }[]): ReadonlySet<string> {
  return new Set(candidates.filter((c) => c.selected).map((c) => c.vendorNo));
}

/**
 * The tool's one client component.
 *
 * Nothing about a vendor, a country or an evidence entry lives in this component's state: the
 * payload is read on the server and every mutating handler calls its server action and then
 * `router.refresh()`, so what the screens show is what the database says rather than what the
 * browser last guessed. The prototype mutated an in-memory array and told the user it had sent
 * emails.
 */
export default function SoaConsolidationClient({
  viewer,
  payload,
}: {
  viewer: Viewer;
  payload: SoaPayload;
}) {
  const router = useRouter();
  const [state, setState] = useState<AppState>(INITIAL);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /* An in-flight lock for the candidate fetch, set synchronously so that two renders of the
     scoping screen in the same commit cannot both ask for the 525 rows. State cannot do this job:
     both calls would read the same not-yet-applied `scopeLoading`. */
  const scopeFetching = useRef(false);
  /* Bumped when the country changes, so a read that was already in flight for the country the
     champion just left cannot land in the new country's list. */
  const scopeGeneration = useRef(0);

  const countryId = payload.countryId;
  const exportFileName = `NESR-${countryId ?? 'SOA'}-SOA-${(payload.cycle?.label ?? 'cycle').replace(/\s+/g, '-')}.csv`;

  function patch(partial: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) {
    setState((prev) => ({ ...prev, ...(typeof partial === 'function' ? partial(prev) : partial) }));
  }

  function addToast(type: ToastType, title: string, msg: string) {
    const id = ++toastIdCounter;
    patch((prev) => ({ toasts: [...prev.toasts, { id, type, title, msg }] }));
    // Calling setState on an unmounted component is a safe no-op in React 18+, so this
    // dismiss timer needs no unmount tracking/cleanup.
    setTimeout(() => {
      patch((prev) => ({ toasts: prev.toasts.filter((t) => t.id !== id) }));
    }, 6000);
  }

  /**
   * Run one server action.
   *
   * A failed action's `error` is written to be read by the person who clicked, so it is shown
   * verbatim rather than replaced with a generic apology — `handOffSoaCountry` in particular
   * refuses below the coverage target and explains exactly how short the country is.
   */
  async function run<T>(
    action: () => Promise<{ success: boolean; error?: string; data?: T }>,
    onSuccess: (data: T | undefined) => void,
    failTitle: string,
  ) {
    patch({ busy: true });
    try {
      const result = await action();
      if (result.success) {
        onSuccess(result.data);
        router.refresh();
      } else {
        addToast('warning', failTitle, result.error ?? 'The action did not complete.');
      }
    } catch (err) {
      addToast('warning', failTitle, err instanceof Error ? err.message : 'The action failed.');
    } finally {
      patch({ busy: false });
    }
  }

  /**
   * Read the country's scoping candidates.
   *
   * Fetched here rather than in the page payload: it is 525 rows for Saudi Arabia, it is wanted on
   * exactly one of the eight screens, and it would otherwise be serialised into every page load.
   * A successful read also reseeds the draft, so what is ticked always starts from what the
   * database actually holds — including after a save.
   */
  function loadScopeCandidates() {
    const cycle = payload.cycle;
    if (!countryId || !cycle || scopeFetching.current) return;
    scopeFetching.current = true;
    const generation = scopeGeneration.current;
    patch({ scopeLoading: true, scopeError: null });
    void getSoaScopeCandidates({ cycleId: cycle.id, countryId })
      .then((data) => {
        if (generation !== scopeGeneration.current) return;
        /* The action answers a failed read with an empty list AND a reason. Without surfacing the
           reason, "the database would not answer" is shown as "this country has no suppliers",
           which reads as a fact about the country and stops the champion rather than prompting a
           retry. */
        patch({
          scopeCandidates: data,
          scopeSelected: seedSelection(data.candidates),
          scopeLoading: false,
          scopeError: data.error ?? null,
        });
      })
      .catch(() => {
        if (generation !== scopeGeneration.current) return;
        patch({
          scopeLoading: false,
          scopeError: 'The supplier list could not be read. Try again in a moment.',
        });
      })
      .finally(() => {
        scopeFetching.current = false;
      });
  }

  const handlers: Handlers = {
    setScreen(screen) {
      patch({ screen, expandedVendor: null });
    },
    setFilterStatus(status) {
      // A filter that left the pager on page 6 would show an empty table with no explanation.
      patch({ filterStatus: status, page: 0 });
    },
    setSearch(value) {
      patch({ search: value, page: 0 });
    },
    setPage(page) {
      patch({ page, expandedVendor: null });
    },
    setScopeSearch(value) {
      patch({ scopeSearch: value, scopePage: 0 });
    },
    setScopePage(page) {
      patch({ scopePage: page });
    },
    selectCountry(id) {
      if (id === countryId) return;
      scopeGeneration.current += 1;
      setState({ ...INITIAL, screen: state.screen });
      router.push(`/soa-consolidation?country=${encodeURIComponent(id)}`);
    },
    goToConsolidation() {
      patch({ screen: 'consolidation' });
    },
    toggleExpand(id) {
      patch((prev) => ({ expandedVendor: prev.expandedVendor === id ? null : id }));
    },
    openUploadModal(vendorId) {
      patch({ modal: { type: 'upload', vendorId } });
    },
    closeModal() {
      patch({ modal: null });
    },

    sendRequests(cc) {
      if (!countryId) return;
      void run(
        () => sendSoaOutreachBatch({ countryId, kind: 'request', cc }),
        (data) => {
          const sent = data?.sent ?? 0;
          const failed = data?.failed ?? 0;
          // Report what happened, including the failures. The prototype claimed every send
          // succeeded because it never sent anything.
          addToast(
            failed > 0 ? 'warning' : sent > 0 ? 'success' : 'info',
            failed > 0
              ? `${sent} requests sent, ${failed} failed`
              : sent > 0
                ? `${sent} requests sent`
                : 'No requests were due',
            failed > 0
              ? (data?.firstError ?? 'Some vendors could not be reached.')
              : sent > 0
                ? 'Initial statement requests dispatched. Evidence logged.'
                : 'Every in-scope vendor has already been asked.',
          );
        },
        'Requests not sent',
      );
    },
    sendReminders(cc) {
      if (!countryId) return;
      void run(
        () => sendSoaOutreachBatch({ countryId, kind: 'reminder', cc }),
        (data) => {
          const sent = data?.sent ?? 0;
          const failed = data?.failed ?? 0;
          addToast(
            failed > 0 ? 'warning' : sent > 0 ? 'success' : 'info',
            failed > 0
              ? `${sent} reminders sent, ${failed} failed`
              : sent > 0
                ? `${sent} reminders sent`
                : 'No reminders were due',
            failed > 0
              ? (data?.firstError ?? 'Some vendors could not be reached.')
              : sent > 0
                ? 'Reminder emails dispatched. Evidence logged.'
                : 'No vendor is currently awaiting a second request.',
          );
        },
        'Reminders not sent',
      );
    },
    sendOneReminder(id) {
      void run(
        () => sendSoaOutreach({ entryId: Number(id), kind: 'reminder' }),
        () => {
          patch({ expandedVendor: null });
          addToast('success', 'Reminder sent', 'Second request dispatched and logged.');
        },
        'Reminder not sent',
      );
    },
    markNR(id) {
      void run(
        () => markSoaNonResponder(Number(id)),
        () => {
          patch({ expandedVendor: null });
          addToast('warning', 'Non-responder flagged', 'Correspondence retained as evidence.');
        },
        'Could not flag the vendor',
      );
    },
    saveContacts(id, emails) {
      void run(
        () => setSoaVendorContacts({ entryId: Number(id), emails }),
        () => addToast('success', 'Contacts saved', `${emails.length} address(es) on file.`),
        'Contacts not saved',
      );
    },
    acceptSOA(file, invoiceCount) {
      const modal = state.modal;
      if (!modal || modal.type !== 'upload') return;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('invoiceCount', String(invoiceCount));
      void run(
        () => acceptSoaSubmission(Number(modal.vendorId), formData),
        () => {
          patch({ modal: null, expandedVendor: null });
          addToast('success', 'SOA accepted', `${file.name} validated and stored.`);
        },
        'SOA not accepted',
      );
    },
    loadCandidates() {
      loadScopeCandidates();
    },
    toggleScopeVendor(vendorNo) {
      patch((prev) => {
        const candidate = prev.scopeCandidates?.candidates.find((c) => c.vendorNo === vendorNo);
        /* The two states that are not free choices are refused here as well as being disabled in
           the markup: an excluded supplier is never ticked, and a contacted one is never
           unticked. The server enforces both again, because a tick box is not a permission. */
        if (!candidate || candidate.excluded || candidate.locked) return {};
        const next = new Set(prev.scopeSelected);
        if (next.has(vendorNo)) next.delete(vendorNo);
        else next.add(vendorNo);
        return { scopeSelected: next };
      });
    },
    setScopeSelection(vendorNos) {
      patch({ scopeSelected: vendorNos });
    },
    discardScopeSelection() {
      patch((prev) => ({
        scopeSelected: prev.scopeCandidates
          ? seedSelection(prev.scopeCandidates.candidates)
          : NO_SELECTION,
      }));
    },
    saveScopeSelection() {
      const cycle = payload.cycle;
      if (!countryId || !cycle) return;
      /* The whole desired set goes over in one call. Writing per tick would be 525 round trips
         and would turn a misclick into a database change. */
      const vendorNos = [...state.scopeSelected];
      void run(
        () => applySoaScopeSelection({ cycleId: cycle.id, countryId, vendorNos }),
        (data) => {
          patch({ scopeSaved: data ?? null });
          // Re-read, so `selected` and `locked` on every row reflect what was just written.
          loadScopeCandidates();
          addToast(
            'success',
            `${data?.total ?? 0} suppliers in scope`,
            `${data?.added ?? 0} added · ${data?.removed ?? 0} removed` +
              (data?.keptLocked
                ? ` · ${data.keptLocked} kept because they have already been contacted`
                : '') +
              ` · ${fmtM(data?.selectedUsd ?? 0)} of the country balance selected.`,
          );
        },
        'Selection not saved',
      );
    },
    loadFailures() {
      if (!countryId) return;
      patch({ busy: true });
      void getSoaOutreachFailures(countryId)
        .then((rows) => patch({ failures: rows, busy: false }))
        .catch(() => {
          patch({ failures: [], busy: false });
          addToast('warning', 'Could not load failures', 'The delivery log could not be read.');
        });
    },
    generateExport() {
      if (!countryId) return;
      patch({ busy: true });
      void (async () => {
        try {
          const rows = await getSoaExportRows(countryId);
          if (!rows.length) {
            addToast('info', 'Nothing to export', 'This country has no vendors in this cycle.');
            return;
          }
          // The prototype named a file it never produced. This one is built from the rows the
          // server just returned and handed to the browser.
          const head = [
            'Vendor No.',
            'Vendor Name',
            'Amount (USD)',
            'Currency',
            'Status',
            'Requested',
            'Reminded',
            'Responded',
            'Invoices',
          ];
          const csv = [
            head.join(','),
            ...rows.map((r) =>
              [
                r.vendorNo,
                r.vendorName,
                r.amount,
                r.currency,
                r.status,
                r.requestedAt ?? '',
                r.remindedAt ?? '',
                r.respondedAt ?? '',
                r.invoiceCount,
              ]
                .map((cell) => `"${csvSafe(cell).replace(/"/g, '""')}"`)
                .join(','),
            ),
          ].join('\n');
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = exportFileName;
          anchor.click();
          URL.revokeObjectURL(url);

          const recorded = await recordSoaExport(countryId);
          if (!recorded.success) {
            addToast(
              'warning',
              'Export downloaded, not logged',
              recorded.error ?? 'The evidence entry could not be written.',
            );
            return;
          }
          router.refresh();
          addToast(
            'success',
            'Export generated',
            `${rows.length} rows written to ${exportFileName}.`,
          );
        } catch (err) {
          addToast(
            'warning',
            'Export failed',
            err instanceof Error ? err.message : 'The export could not be produced.',
          );
        } finally {
          patch({ busy: false });
        }
      })();
    },
    openHandoffModal() {
      patch({ modal: { type: 'handoff' } });
    },
    confirmHandoff() {
      if (!countryId) return;
      void run(
        () => handOffSoaCountry(countryId),
        () => {
          patch({ modal: null });
          addToast(
            'success',
            'Handed off to Finance',
            `${payload.countryName} ${payload.cycle?.label ?? ''} delivered to the AP Country Group inbox.`,
          );
        },
        // handOffSoaCountry refuses below the coverage target and says by how much; that message
        // is the whole point of the refusal, so it is surfaced rather than swallowed.
        'Handoff refused',
      );
    },
  };

  const vm = deriveViewModel(payload, state, handlers, viewer);

  return (
    <div className="flex flex-col h-screen font-[family-name:Arial,_Calibri,_Helvetica,_sans-serif] bg-[#EAEDE9] text-sns-ink overflow-hidden">
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <Navbar vm={vm} onOpenSidebar={() => setSidebarOpen(true)} />
      {/* The drawer is fixed-position and overlays the shell, so it sits outside the content row. */}
      <Sidebar vm={vm} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto px-[22px] py-5 bg-[#EAEDE9]">
          {vm.showEmptyState && <EmptyState vm={vm} />}
          {!vm.showEmptyState && (
            <>
              {vm.showDashboard && <DashboardScreen vm={vm} />}
              {vm.showScoping && <VendorScopingScreen vm={vm} />}
              {vm.showOutreach && <OutreachScreen vm={vm} />}
              {vm.showTracking && <ResponseTrackingScreen vm={vm} />}
              {vm.showIntake && <SoaIntakeScreen vm={vm} />}
              {vm.showConsolidation && <ConsolidationScreen vm={vm} />}
              {vm.showEvidence && <EvidenceScreen vm={vm} />}
              {vm.showRollup && <CorporateRollupScreen vm={vm} />}
            </>
          )}
        </main>
      </div>

      <ToastStack vm={vm} />

      {vm.hasModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 bg-[rgba(0,0,0,0.45)] z-[300] flex items-center justify-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) vm.onCloseModal();
            }}
          >
            <div className="bg-white rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.2)] w-[480px] overflow-x-hidden max-h-[90vh] overflow-y-auto">
              {vm.isUploadModal && <UploadModal vm={vm} />}
              {vm.isHandoffModal && <HandoffModal vm={vm} />}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
