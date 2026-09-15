'use client';

import React from 'react';

export const STATUS_TILES = [
  {
    id: 'Past Due',
    activeClass: 'bg-red-100/80 border-red-300 text-red-700 shadow-sm ring-1 ring-red-200',
  },
  {
    id: 'Due Soon',
    activeClass: 'bg-amber-100/80 border-amber-300 text-amber-700 shadow-sm ring-1 ring-amber-200',
  },
  {
    id: 'On Track',
    activeClass:
      'bg-[#307c4c]/10 border-[#307c4c]/30 text-[#307c4c] shadow-sm ring-1 ring-[#307c4c]/20',
  },
] as const;

export const ACCOUNT_TYPE_TILES = [
  {
    id: 'Asset',
    label: 'Asset',
    activeClass: 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm ring-1 ring-blue-100',
  },
  {
    id: 'Asset Services',
    label: 'Asset Services',
    activeClass: 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm ring-1 ring-indigo-100',
  },
  {
    id: 'Direct Consumables',
    label: 'Direct Consumables',
    activeClass: 'bg-orange-50 border-orange-200 text-orange-700 shadow-sm ring-1 ring-orange-100',
  },
  {
    id: 'Direct Order',
    label: 'Direct Order',
    activeClass: 'bg-purple-50 border-purple-200 text-purple-700 shadow-sm ring-1 ring-purple-100',
  },
  {
    id: 'Inventory',
    label: 'Inventory',
    activeClass: 'bg-yellow-50 border-yellow-200 text-yellow-700 shadow-sm ring-1 ring-yellow-100',
  },
  {
    id: 'Services',
    label: 'Services',
    activeClass: 'bg-teal-50 border-teal-200 text-teal-700 shadow-sm ring-1 ring-teal-100',
  },
];

export function StatusTiles({
  selected,
  onChange,
  selectedAccountTypes,
  onAccountTypeChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
  selectedAccountTypes: string[];
  onAccountTypeChange: (v: string[]) => void;
}) {
  const toggleStatus = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else onChange([...selected, id]);
  };
  const toggleAccountType = (id: string) => {
    if (selectedAccountTypes.includes(id))
      onAccountTypeChange(selectedAccountTypes.filter((s) => s !== id));
    else onAccountTypeChange([...selectedAccountTypes, id]);
  };

  return (
    <div className="px-4 sm:px-6 py-3 border-b border-slate-100 bg-white flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">
        Status:
      </span>
      {STATUS_TILES.map((tile) => {
        const isActive = selected.includes(tile.id);
        return (
          <button
            key={tile.id}
            onClick={() => toggleStatus(tile.id)}
            className={[
              'px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all duration-150',
              isActive
                ? tile.activeClass
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700',
            ].join(' ')}
          >
            {tile.id}
          </button>
        );
      })}

      {/* Divider */}
      <div
        className="shrink-0 self-center mx-3"
        style={{ width: '1px', height: '20px', backgroundColor: '#e5e7eb' }}
      />

      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">
        Account Type:
      </span>
      {ACCOUNT_TYPE_TILES.map((tile) => {
        const isActive = selectedAccountTypes.includes(tile.id);
        return (
          <button
            key={tile.id}
            onClick={() => toggleAccountType(tile.id)}
            className={[
              'px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all duration-150',
              isActive
                ? tile.activeClass
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700',
            ].join(' ')}
          >
            {tile.label}
          </button>
        );
      })}

      {(selected.length > 0 || selectedAccountTypes.length > 0) && (
        <button
          onClick={() => {
            onChange([]);
            onAccountTypeChange([]);
          }}
          className="ml-1 text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1 rounded-lg hover:bg-slate-100"
        >
          Clear
        </button>
      )}
    </div>
  );
}
