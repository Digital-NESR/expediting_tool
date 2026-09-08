'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ACTIVE_COUNTRY_ID, TOTAL_BALANCE, createInitialState } from './data';
import { deriveViewModel, newTimestamp } from './lib';
import type { AppState, Evidence, Handlers, ToastType } from './types';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import ToastStack from './components/ToastStack';
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

// Module-level counters (not component state): they only need to produce unique ids,
// never to be read during render, so a plain counter avoids re-renders and ref lint churn.
let toastIdCounter = 0;
// Seeded evidence entries use E003..E018; runtime-logged entries count up from here.
let evidenceIdCounter = 1000;

function nextEvidenceId() {
  evidenceIdCounter += 1;
  return `E${evidenceIdCounter}`;
}

export default function SoaConsolidationPage() {
  const [state, setState] = useState<AppState>(createInitialState);

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
    }, 4000);
  }

  const handlers: Handlers = {
    switchRole(role) {
      patch({ role, screen: role === 'director' ? 'rollup' : 'dashboard' });
    },
    setScreen(screen) {
      patch({ screen, expandedVendor: null });
    },
    setFilterStatus(status) {
      patch({ filterStatus: status });
    },
    goToConsolidation() {
      patch({ screen: 'consolidation' });
    },
    toggleExpand(id) {
      patch((prev) => ({ expandedVendor: prev.expandedVendor === id ? null : id }));
    },
    openUploadModal(vendorId) {
      patch({ modal: { type: 'upload', vendorId }, uploadStep: 0 });
    },
    closeModal() {
      patch({ modal: null, uploadStep: 0 });
    },
    simulateUpload() {
      patch({ uploadStep: 1 });
      setTimeout(() => {
        // Guard against a modal that's since been closed or moved on from this step.
        patch((prev) => (prev.modal?.type === 'upload' && prev.uploadStep === 1 ? { uploadStep: 2 } : {}));
      }, 1800);
    },
    sendReminders() {
      const pending = state.vendors.filter((v) => v.status === 'requested');
      if (!pending.length) return;
      const entry: Evidence = {
        id: nextEvidenceId(),
        ts: newTimestamp(),
        type: 'reminder',
        action: 'Reminders sent',
        actor: 'System (auto-triggered)',
        detail: `${pending.length} reminder emails dispatched to vendors with no response after initial request.`,
      };
      patch({
        vendors: state.vendors.map((v) => (v.status === 'requested' ? { ...v, status: 'reminded' as const, remDate: '21 Jul' } : v)),
        evidence: [entry, ...state.evidence],
      });
      addToast('success', `${pending.length} reminders sent`, 'Reminder emails dispatched. Evidence logged.');
    },
    sendOneReminder(id) {
      const name = state.vendors.find((v) => v.id === id)?.name ?? '';
      patch({
        vendors: state.vendors.map((v) => (v.id === id ? { ...v, status: 'reminded' as const, remDate: '21 Jul' } : v)),
        expandedVendor: null,
      });
      addToast('success', 'Reminder sent', `${name} — second request dispatched.`);
    },
    markNR(id) {
      const name = state.vendors.find((v) => v.id === id)?.name ?? '';
      patch({
        vendors: state.vendors.map((v) => (v.id === id ? { ...v, status: 'non_responder' as const } : v)),
        expandedVendor: null,
      });
      addToast('warning', 'Non-responder flagged', `${name} — evidence retained.`);
    },
    generateExport() {
      addToast('success', 'Export generated', 'NESR-KSA-SOA-Q3-2026.xlsx ready for Finance.');
      patch({ countries: state.countries.map((c) => (c.id === ACTIVE_COUNTRY_ID ? { ...c, status: 'consolidating' as const } : c)) });
    },
    openHandoffModal() {
      patch({ modal: { type: 'handoff' } });
    },
    acceptSOA() {
      if (!state.modal || state.modal.type !== 'upload') return;
      const vendorId = state.modal.vendorId;
      const vendorName = state.vendors.find((v) => v.id === vendorId)?.name ?? '';
      const newVendors = state.vendors.map((v) =>
        v.id === vendorId
          ? { ...v, status: 'received' as const, respDate: '21 Jul', invCount: Math.floor(Math.random() * 4) + 2 }
          : v,
      );
      const receivedBalance = newVendors.filter((v) => v.status === 'received').reduce((s, v) => s + v.openPO, 0);
      const newPct = Math.round((receivedBalance / TOTAL_BALANCE) * 100);
      const newCountries = state.countries.map((c) =>
        c.id === ACTIVE_COUNTRY_ID
          ? { ...c, pct: newPct, responded: newVendors.filter((v) => v.status === 'received').length }
          : c,
      );
      const entry: Evidence = {
        id: nextEvidenceId(),
        ts: newTimestamp(),
        type: 'upload',
        action: 'SOA received',
        actor: vendorName,
        detail: `SOA accepted and validated for Q3 2026. Coverage updated to ${newPct}%.`,
      };
      patch({
        vendors: newVendors,
        countries: newCountries,
        evidence: [entry, ...state.evidence],
        modal: null,
        uploadStep: 0,
        expandedVendor: null,
      });
      addToast('success', 'SOA accepted', `${vendorName} — validated and stored.`);
    },
    confirmHandoff() {
      const country = state.countries.find((c) => c.id === ACTIVE_COUNTRY_ID);
      const entry: Evidence = {
        id: nextEvidenceId(),
        ts: newTimestamp(),
        type: 'handoff',
        action: 'Handed off to Finance',
        actor: 'Ahmed Al-Rashidi',
        detail: `Consolidated SOA file delivered to AP/Finance Country Group inbox. Coverage: ${country?.pct}%. Control criteria: ✓`,
      };
      patch({
        countries: state.countries.map((c) => (c.id === ACTIVE_COUNTRY_ID ? { ...c, status: 'handed_off' as const } : c)),
        handedOff: true,
        modal: null,
        evidence: [entry, ...state.evidence],
      });
      addToast('success', 'Handed off to Finance', 'KSA Q3 2026 SOA delivered to AP Country Group inbox.');
    },
  };

  const vm = deriveViewModel(state, handlers);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: 'Arial, Calibri, Helvetica, sans-serif',
        background: '#EAEDE9',
        color: '#1F1F1D',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <Navbar vm={vm} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar vm={vm} />
        <main style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', background: '#EAEDE9' }}>
          {vm.showDashboard && <DashboardScreen vm={vm} />}
          {vm.showScoping && <VendorScopingScreen vm={vm} />}
          {vm.showOutreach && <OutreachScreen vm={vm} />}
          {vm.showTracking && <ResponseTrackingScreen vm={vm} />}
          {vm.showIntake && <SoaIntakeScreen vm={vm} />}
          {vm.showConsolidation && <ConsolidationScreen vm={vm} />}
          {vm.showEvidence && <EvidenceScreen vm={vm} />}
          {vm.showRollup && <CorporateRollupScreen vm={vm} />}
        </main>
      </div>

      <ToastStack vm={vm} />

      {vm.hasModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              zIndex: 300,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) vm.onCloseModal();
            }}
          >
            <div
              style={{
                background: 'white',
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                width: 480,
                overflow: 'hidden',
                maxHeight: '90vh',
                overflowY: 'auto',
              }}
            >
              {vm.isUploadModal && <UploadModal vm={vm} />}
              {vm.isHandoffModal && <HandoffModal vm={vm} />}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
