'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getAllStakeholders,
  addStakeholder,
  updateStakeholder,
  deleteStakeholder,
  toggleStakeholderActive,
} from '@/app/actions/tite';
import EmployeeSearchInput from '@/components/EmployeeSearchInput';
import type { Employee } from '@/components/EmployeeSearchInput';
import type { CountryStakeholderFull } from '@/types/tite';

/* ─── Constants ─────────────────────────────────────────────── */

const TITE_COUNTRIES = [
  'Saudi Arabia', 'UAE', 'Kuwait', 'Qatar', 'Oman', 'Bahrain',
  'Egypt', 'Cameroon', 'Algeria', 'Iraq', 'Libya',
  'USA', 'UK', 'Germany', 'France', 'China', 'Singapore', 'India',
];

const ROLE_SUGGESTIONS = [
  'Supply Chain Manager',
  'Logistics Manager',
  'Logistics Team',
  'Finance',
  'Operations',
  'Country Manager',
  'Other',
];

function roleBadgeColor(role: string) {
  const r = role.toLowerCase();
  if (r.includes('supply chain'))  return 'bg-blue-50 text-blue-700 border-blue-200';
  if (r.includes('logistics'))     return 'bg-teal-50 text-teal-700 border-teal-200';
  if (r === 'finance')             return 'bg-violet-50 text-violet-700 border-violet-200';
  if (r === 'operations')          return 'bg-orange-50 text-orange-700 border-orange-200';
  if (r.includes('country'))       return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

/* ─── Toast ─────────────────────────────────────────────────── */

function Toast({ message, type, onDismiss }: { message: string; type: 'success' | 'error'; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white ${type === 'success' ? 'bg-[#059669]' : 'bg-red-600'}`}>
      {type === 'success' ? (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" />
        </svg>
      )}
      {message}
    </div>
  );
}

/* ─── Skeleton ──────────────────────────────────────────────── */

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

/* ─── Component ─────────────────────────────────────────────── */

export default function TiteDefaultNotifiersClient({ userEmail }: { userEmail: string }) {
  const [stakeholders, setStakeholders] = useState<CountryStakeholderFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Add form
  const [addCountry, setAddCountry] = useState('');
  const [addRole, setAddRole] = useState('');
  const [addEmployee, setAddEmployee] = useState<{ name: string; email: string } | null>(null);
  const [addSaving, setAddSaving] = useState(false);

  // Edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editEmployee, setEditEmployee] = useState<{ name: string; email: string } | null>(null);
  const [editActive, setEditActive] = useState(true);
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // Toggle loading
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Collapsed countries
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Country search in add form
  const [countrySearch, setCountrySearch] = useState('');
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    setFetchError(false);
    try {
      const data = await getAllStakeholders();
      setStakeholders(data);
      setLastUpdated(new Date());
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Group by country
  const grouped = useMemo(() => {
    const map = new Map<string, CountryStakeholderFull[]>();
    for (const s of stakeholders) {
      if (!map.has(s.country)) map.set(s.country, []);
      map.get(s.country)!.push(s);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [stakeholders]);

  const activeCount = stakeholders.filter(s => s.active).length;
  const countryCount = grouped.length;

  // All countries: merge static + DB
  const allCountries = useMemo(() => {
    const set = new Set([...TITE_COUNTRIES, ...stakeholders.map(s => s.country)]);
    return [...set].sort();
  }, [stakeholders]);

  const filteredCountries = countrySearch
    ? allCountries.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase()))
    : allCountries;

  // ── Add handler ──
  async function handleAdd() {
    if (!addCountry || !addRole || !addEmployee) return;
    setAddSaving(true);
    const res = await addStakeholder({
      country: addCountry,
      role: addRole,
      name: addEmployee.name,
      email: addEmployee.email,
      addedBy: userEmail,
    });
    setAddSaving(false);
    if (res.success) {
      setAddCountry('');
      setAddRole('');
      setAddEmployee(null);
      setCountrySearch('');
      setToast({ message: `Notifier added for ${addCountry}`, type: 'success' });
      fetchData();
    } else {
      setToast({ message: res.error ?? 'Failed to add.', type: 'error' });
    }
  }

  // ── Edit handlers ──
  function startEdit(s: CountryStakeholderFull) {
    setEditId(s.id);
    setEditRole(s.role);
    setEditEmployee({ name: s.name, email: s.email });
    setEditActive(s.active);
  }

  function cancelEdit() {
    setEditId(null);
    setEditRole('');
    setEditEmployee(null);
    setEditActive(true);
  }

  async function saveEdit(s: CountryStakeholderFull) {
    if (!editEmployee) return;
    setEditSaving(true);
    const res = await updateStakeholder({
      id: s.id,
      country: s.country,
      role: editRole,
      name: editEmployee.name,
      email: editEmployee.email,
      active: editActive,
    });
    setEditSaving(false);
    if (res.success) {
      cancelEdit();
      setToast({ message: 'Notifier updated.', type: 'success' });
      fetchData();
    } else {
      setToast({ message: res.error ?? 'Failed to update.', type: 'error' });
    }
  }

  // ── Delete handler ──
  async function confirmDelete(s: CountryStakeholderFull) {
    setDeleteSaving(true);
    const res = await deleteStakeholder(s.id);
    setDeleteSaving(false);
    if (res.success) {
      setDeleteId(null);
      setToast({ message: `${s.name} removed from ${s.country} notifiers`, type: 'success' });
      fetchData();
    } else {
      setToast({ message: res.error ?? 'Failed to delete.', type: 'error' });
    }
  }

  // ── Toggle active handler ──
  async function handleToggle(s: CountryStakeholderFull) {
    setTogglingId(s.id);
    const res = await toggleStakeholderActive(s.id, !s.active);
    if (res.success) {
      setStakeholders(prev => prev.map(x => x.id === s.id ? { ...x, active: !x.active } : x));
    } else {
      setToast({ message: res.error ?? 'Failed to toggle.', type: 'error' });
    }
    setTogglingId(null);
  }

  function toggleCollapse(country: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(country)) next.delete(country); else next.add(country);
      return next;
    });
  }

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Default Notifiers</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage default notification recipients by country for TI-TE shipment alerts.
          </p>
          {lastUpdated && (
            <p className="text-[12px] text-gray-400 mt-0.5">
              Last updated: {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>
        <button
          onClick={fetchData}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-gray-600 bg-transparent border border-[#e5e7eb] rounded-md hover:bg-[#f9fafb] hover:border-[#d1d5db] transition-all disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
        >
          <svg
            className={`w-3.5 h-3.5 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Info banner ── */}
      <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-[13px] text-emerald-800 flex items-start gap-2.5">
        <svg className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>
          These are the default recipients automatically added when a new shipment is created for each country.
          They can be adjusted per shipment on the shipment form.
        </span>
      </div>

      {/* ── Loading / Error ── */}
      {loading && <SkeletonRows />}
      {fetchError && !loading && (
        <div className="text-center py-12">
          <p className="text-sm text-red-600 mb-3">Failed to load notifiers. Please refresh.</p>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !fetchError && (
        <>
          {/* ── Summary ── */}
          <p className="text-sm text-gray-500 mb-5">
            {activeCount} active notifier{activeCount !== 1 ? 's' : ''} across {countryCount} countr{countryCount !== 1 ? 'ies' : 'y'}
          </p>

          {/* ── Add Notifier Card ── */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Add Notifier</h3>
            <div className="flex items-end gap-3 flex-wrap">

              {/* Country dropdown */}
              <div className="relative w-48">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Country</label>
                <input
                  type="text"
                  value={addCountry || countrySearch}
                  onChange={e => {
                    setCountrySearch(e.target.value);
                    setAddCountry('');
                    setCountryDropdownOpen(true);
                  }}
                  onFocus={() => setCountryDropdownOpen(true)}
                  placeholder="Select country…"
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#059669]/20 focus:border-[#059669] transition-colors"
                />
                {countryDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredCountries.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-slate-400">No countries found.</p>
                    ) : (
                      filteredCountries.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setAddCountry(c);
                            setCountrySearch('');
                            setCountryDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                        >
                          {c}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Role */}
              <div className="w-48">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Role</label>
                <input
                  type="text"
                  list="role-suggestions"
                  value={addRole}
                  onChange={e => setAddRole(e.target.value)}
                  placeholder="Select or type role…"
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#059669]/20 focus:border-[#059669] transition-colors"
                />
                <datalist id="role-suggestions">
                  {ROLE_SUGGESTIONS.map(r => <option key={r} value={r} />)}
                </datalist>
              </div>

              {/* Employee search */}
              <div className="flex-1 min-w-[240px]">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Employee</label>
                {addEmployee ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 font-medium">
                    {addEmployee.name}
                    <span className="text-emerald-500 font-normal">· {addEmployee.email}</span>
                    <button
                      type="button"
                      onClick={() => setAddEmployee(null)}
                      className="ml-1 text-emerald-400 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ) : (
                  <EmployeeSearchInput
                    placeholder="Search employee…"
                    onSelect={(emp: Employee) => setAddEmployee({ name: emp.display_name, email: emp.mail })}
                  />
                )}
              </div>

              {/* Add button */}
              <button
                onClick={handleAdd}
                disabled={!addCountry || !addRole || !addEmployee || addSaving}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#059669] rounded-lg hover:bg-[#047857] disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {addSaving && (
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}
                Add Notifier
              </button>
            </div>
          </div>

          {/* ── Grouped Table ── */}
          {grouped.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400 italic">No notifiers configured yet. Add one above.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {grouped.map(([country, items]) => {
                const isCollapsed = collapsed.has(country);
                return (
                  <div key={country} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    {/* Country header */}
                    <button
                      onClick={() => toggleCollapse(country)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
                    >
                      <svg
                        className={`w-4 h-4 text-slate-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                      <span className="text-sm font-bold text-slate-900">{country}</span>
                      <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        {items.length} notifier{items.length !== 1 ? 's' : ''}
                      </span>
                    </button>

                    {/* Table rows */}
                    {!isCollapsed && (
                      <div className="border-t border-slate-100">
                        {/* Table header */}
                        <div className="grid grid-cols-[1fr_1.2fr_1.5fr_100px_120px] gap-2 px-5 py-2 text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-50">
                          <span>Role</span>
                          <span>Name</span>
                          <span>Email</span>
                          <span>Status</span>
                          <span className="text-right">Actions</span>
                        </div>

                        {items.map(s => {
                          // Delete confirm
                          if (deleteId === s.id) {
                            return (
                              <div key={s.id} className="px-5 py-3 border-b border-slate-50 bg-red-50/50 flex items-center gap-3">
                                <p className="flex-1 text-sm text-slate-700">
                                  Remove <span className="font-semibold">{s.name}</span> from {country} notifications?
                                </p>
                                <button
                                  onClick={() => confirmDelete(s)}
                                  disabled={deleteSaving}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                                >
                                  {deleteSaving && (
                                    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                    </svg>
                                  )}
                                  Confirm Delete
                                </button>
                                <button
                                  onClick={() => setDeleteId(null)}
                                  className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            );
                          }

                          // Edit mode
                          if (editId === s.id) {
                            return (
                              <div key={s.id} className="px-5 py-3 border-b border-slate-50 bg-blue-50/30">
                                <div className="grid grid-cols-[1fr_1.2fr_1.5fr_100px_120px] gap-2 items-center">
                                  {/* Role input */}
                                  <div>
                                    <input
                                      type="text"
                                      list="role-suggestions-edit"
                                      value={editRole}
                                      onChange={e => setEditRole(e.target.value)}
                                      className="w-full text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#059669]/20 focus:border-[#059669]"
                                    />
                                    <datalist id="role-suggestions-edit">
                                      {ROLE_SUGGESTIONS.map(r => <option key={r} value={r} />)}
                                    </datalist>
                                  </div>

                                  {/* Employee search — spans name + email cols */}
                                  <div className="col-span-2">
                                    {editEmployee ? (
                                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
                                        {editEmployee.name}
                                        <span className="text-emerald-500 font-normal">· {editEmployee.email}</span>
                                        <button
                                          type="button"
                                          onClick={() => setEditEmployee(null)}
                                          className="ml-1 text-emerald-400 hover:text-red-500"
                                        >
                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </span>
                                    ) : (
                                      <EmployeeSearchInput
                                        placeholder="Search employee…"
                                        onSelect={(emp: Employee) => setEditEmployee({ name: emp.display_name, email: emp.mail })}
                                      />
                                    )}
                                  </div>

                                  {/* Active toggle */}
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={editActive}
                                      onChange={e => setEditActive(e.target.checked)}
                                      className="w-3.5 h-3.5 rounded accent-[#059669]"
                                    />
                                    <span className="text-xs text-slate-600">Active</span>
                                  </label>

                                  {/* Save / Cancel */}
                                  <div className="flex items-center gap-2 justify-end">
                                    <button
                                      onClick={() => saveEdit(s)}
                                      disabled={editSaving || !editEmployee || !editRole}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-[#059669] rounded-lg hover:bg-[#047857] disabled:opacity-50 transition-colors"
                                    >
                                      {editSaving ? (
                                        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                        </svg>
                                      ) : (
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                      )}
                                      Save
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // Display mode
                          return (
                            <div key={s.id} className="grid grid-cols-[1fr_1.2fr_1.5fr_100px_120px] gap-2 px-5 py-2.5 items-center border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50 transition-colors">
                              {/* Role */}
                              <span className={`inline-flex items-center w-fit px-2 py-0.5 rounded-full text-[11px] font-semibold border ${roleBadgeColor(s.role)}`}>
                                {s.role}
                              </span>

                              {/* Name */}
                              <span className="text-sm font-medium text-slate-800 truncate">{s.name}</span>

                              {/* Email */}
                              <span className="text-[13px] text-gray-500 truncate">{s.email}</span>

                              {/* Status */}
                              <button
                                onClick={() => handleToggle(s)}
                                disabled={togglingId === s.id}
                                className="w-fit"
                              >
                                {togglingId === s.id ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-400 border border-slate-200">
                                    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                    </svg>
                                  </span>
                                ) : s.active ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200 cursor-pointer hover:bg-green-100 transition-colors">
                                    Active
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-400 border border-gray-200 cursor-pointer hover:bg-gray-200 transition-colors">
                                    Inactive
                                  </span>
                                )}
                              </button>

                              {/* Actions */}
                              <div className="flex items-center gap-1.5 justify-end">
                                <button
                                  onClick={() => startEdit(s)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-500 rounded-md hover:bg-slate-100 hover:text-slate-700 transition-colors"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  Edit
                                </button>
                                <button
                                  onClick={() => setDeleteId(s.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-500 rounded-md hover:bg-red-50 hover:text-red-600 transition-colors"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  Delete
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
