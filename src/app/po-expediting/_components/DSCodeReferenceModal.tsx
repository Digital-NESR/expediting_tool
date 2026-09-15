'use client';

import { useEffect, useState } from 'react';
import { DS_CATEGORY_LEGEND, DS_CODES, dsCategoryPillClass } from '@/lib/ds-codes';

/* The DS code reference sheet. Its 19-entry table and 5-entry legend used to live here as
   literals, which is how this screen and reconciliation ended up disagreeing about whether
   DS15 to DS18 were complete or in transit. Both now read '@/lib/ds-codes'. */
export function DSCodeReferenceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const term = search.toLowerCase().trim();
  const filteredCodes = DS_CODES.filter((ds) => {
    if (activeCategory && ds.category !== activeCategory) return false;
    if (!term) return true;
    return (
      ds.code.toLowerCase().includes(term) ||
      ds.name.toLowerCase().includes(term) ||
      ds.description.toLowerCase().includes(term)
    );
  });

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-50"
        style={{
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          animation: 'dsModalFadeIn 150ms ease-out',
        }}
      />
      {/* Modal panel */}
      <div
        className="fixed z-[51]"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'white',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '800px',
          width: '90vw',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          animation: 'dsModalSlideIn 200ms ease-out',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700 }} className="text-gray-900">
              Delivery Status (DS) Code Reference
            </h2>
            <p style={{ fontSize: '14px', marginTop: '4px' }} className="text-gray-500">
              Reference guide for all delivery status codes used in the PO Expediting tool
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center shrink-0 hover:bg-gray-100 transition-colors"
            style={{ width: '32px', height: '32px', borderRadius: '50%' }}
          >
            <svg className="w-5 h-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Search input */}
        <div className="relative mb-4">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            placeholder="Search DS codes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:ring-[#307c4c] focus:border-[#307c4c] outline-none transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Color legend */}
        <div className="flex flex-wrap gap-2 mb-4">
          {DS_CATEGORY_LEGEND.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(isActive ? null : cat.id)}
                className={[
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150',
                  isActive
                    ? `${cat.pillBg} ${cat.pillText} ${cat.pillBorder} ring-1 ring-current/20`
                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50',
                ].join(' ')}
              >
                <span className={`w-2 h-2 rounded-full ${cat.dotClass}`} />
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ fontSize: '14px' }}>
            <thead>
              <tr>
                <th
                  className="text-left text-gray-500 font-semibold uppercase tracking-wider"
                  style={{
                    background: '#f8fafc',
                    fontSize: '11px',
                    letterSpacing: '0.05em',
                    padding: '10px 16px',
                    position: 'sticky',
                    top: 0,
                    borderBottom: '2px solid #e5e7eb',
                    width: '100px',
                  }}
                >
                  DS Code
                </th>
                <th
                  className="text-left text-gray-500 font-semibold uppercase tracking-wider"
                  style={{
                    background: '#f8fafc',
                    fontSize: '11px',
                    letterSpacing: '0.05em',
                    padding: '10px 16px',
                    position: 'sticky',
                    top: 0,
                    borderBottom: '2px solid #e5e7eb',
                    width: '220px',
                  }}
                >
                  DS Name
                </th>
                <th
                  className="text-left text-gray-500 font-semibold uppercase tracking-wider"
                  style={{
                    background: '#f8fafc',
                    fontSize: '11px',
                    letterSpacing: '0.05em',
                    padding: '10px 16px',
                    position: 'sticky',
                    top: 0,
                    borderBottom: '2px solid #e5e7eb',
                  }}
                >
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCodes.map((ds) => (
                <tr
                  key={ds.code}
                  className="hover:bg-gray-50 transition-colors"
                  style={{ borderBottom: '1px solid #f1f5f9' }}
                >
                  <td style={{ padding: '12px 16px', width: '100px' }}>
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${dsCategoryPillClass(ds.category)}`}
                    >
                      {ds.code}
                    </span>
                  </td>
                  <td
                    className="text-gray-800"
                    style={{ padding: '12px 16px', width: '220px', fontWeight: 500 }}
                  >
                    {ds.name}
                  </td>
                  <td
                    className="text-gray-500"
                    style={{ padding: '12px 16px', fontSize: '13px', lineHeight: 1.5 }}
                  >
                    {ds.description}
                  </td>
                </tr>
              ))}
              {filteredCodes.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-12 text-gray-400">
                    No DS codes match &apos;{search}&apos;
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Animations */}
      <style jsx>{`
        @keyframes dsModalFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes dsModalSlideIn {
          from {
            opacity: 0;
            transform: translate(-50%, calc(-50% + 8px));
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }
      `}</style>
    </>
  );
}
