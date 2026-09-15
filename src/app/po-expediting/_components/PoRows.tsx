'use client';

import { memo } from 'react';
import type { PurchaseOrder } from '@/types/po';
import { SquareCheckbox } from '@/components/SquareCheckbox';
import type { PoGroup } from '../_lib/types';
import { daysDiff, formatCurrency, formatDate } from '../_lib/format';
import { getPOMajorityDSCode, getPOStatusSummary } from '../_lib/po-status';
import { DeliveryBadge } from './DeliveryBadge';
import { DSTooltipBadge } from './DSTooltipBadge';
import { StatusTooltipBadge } from './StatusTooltipBadge';
import { ChevronIcon } from './table-chrome';

/* Lives here rather than in _lib/format because it returns markup, and these rows are its
   only caller. A blank SAP MAT ID means a service line, so the account classification stands
   in for it, greyed, with 'N/A' as the last resort. */
export function formatMatId(
  matId: string | null | undefined,
  accountType: string | null | undefined,
): React.ReactNode {
  if (matId?.trim()) return matId;
  return <span className="text-gray-400 italic text-xs">{accountType?.trim() || 'N/A'}</span>;
}

export const PoLineItemRow = memo(
  function PoLineItemRow({
    line,
    term,
    isChecked,
    isDrawerOpen,
    onRowClick,
    toggleSelection,
  }: {
    line: PurchaseOrder;
    term: string;
    isChecked: boolean;
    isDrawerOpen: boolean;
    onRowClick: (line: PurchaseOrder) => void;
    toggleSelection: (line: PurchaseOrder) => void;
  }) {
    const diff = daysDiff(line['Delivery Date']);
    const isMatch =
      term !== '' &&
      (String(line['SAP MAT ID'] ?? '')
        .toLowerCase()
        .includes(term) ||
        String(line['PO Number'] ?? '')
          .toLowerCase()
          .includes(term) ||
        String(line['Supplier Name'] ?? '')
          .toLowerCase()
          .includes(term) ||
        String(line['Supplier ID'] ?? '')
          .toLowerCase()
          .includes(term));

    return (
      <tr
        onClick={() => onRowClick(line)}
        className={[
          'transition-colors duration-150 cursor-pointer',
          isChecked
            ? 'bg-[#307c4c]/10'
            : isDrawerOpen
              ? 'bg-[#307c4c]/10 border-l-2 border-l-[#307c4c]'
              : isMatch
                ? 'bg-[#307c4c]/5 border-l-2 border-l-[#307c4c]/50'
                : 'hover:bg-[#307c4c]/5',
        ].join(' ')}
      >
        <td className="py-3 pl-6 pr-2 w-10" onClick={(e) => e.stopPropagation()}>
          <SquareCheckbox
            checked={isChecked}
            onChange={() => toggleSelection(line)}
            aria-label={`Select ${line['SAP MAT ID'] ?? 'line item'}`}
          />
        </td>
        <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-500 whitespace-nowrap">
          {formatMatId(line['SAP MAT ID'], line['Account Classification Description'])}
        </td>
        <td
          className="py-3 px-4 text-sm text-slate-600 max-w-[280px] truncate"
          title={line['Item Description']}
        >
          {line['Item Description'] ?? '—'}
        </td>
        <td className="py-3 px-4 text-sm text-right font-medium text-slate-700 tabular-nums whitespace-nowrap">
          {Number(line['Open QTY'] ?? 0).toLocaleString()}
        </td>
        <td className="py-3 px-4 text-sm text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">
          {formatCurrency(line['Open PO Value USD'])}
        </td>
        <td
          className={`py-3 px-4 text-sm whitespace-nowrap font-medium ${diff < 0 ? 'text-red-600' : 'text-slate-600'}`}
        >
          {formatDate(line['Delivery Date'])}
        </td>
        <td className="py-3 px-4 text-[13px] text-gray-500 whitespace-nowrap">
          {formatDate(line['PO Release Date'])}
        </td>
        <td className="py-3 px-4 whitespace-nowrap">
          {line['Delivery Code'] ? (
            <DSTooltipBadge code={line['Delivery Code']} />
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </td>
        <td className="py-3 px-4 whitespace-nowrap">
          <DeliveryBadge raw={line['Delivery Date']} />
        </td>
      </tr>
    );
  },
  (prev, next) => {
    return (
      prev.line === next.line &&
      prev.term === next.term &&
      prev.isChecked === next.isChecked &&
      prev.isDrawerOpen === next.isDrawerOpen
    );
  },
);

/* ─── Memoized Parent PO Row Component ────────────────────── */
export const PoParentRow = memo(
  function PoParentRow({
    group,
    isOpen,
    isChecked,
    isIndeterminate,
    togglePO,
    selectMultipleLines,
    deselectMultipleLines,
  }: {
    group: PoGroup;
    isOpen: boolean;
    isChecked: boolean;
    isIndeterminate: boolean;
    togglePO: (poNumber: string) => void;
    selectMultipleLines: (lines: PurchaseOrder[]) => void;
    deselectMultipleLines: (lines: PurchaseOrder[]) => void;
  }) {
    const diff = daysDiff(group.earliestDate);
    const majorityDSCode = getPOMajorityDSCode(group.lines);
    const statusSummary = getPOStatusSummary(group.lines);
    return (
      <tr
        onClick={() => togglePO(group.poNumber)}
        className="border-b border-slate-100 hover:bg-[#307c4c]/5 cursor-pointer transition-colors duration-150 group"
      >
        <td className="p-4 pl-6 w-14" onClick={(e) => e.stopPropagation()}>
          <SquareCheckbox
            checked={isChecked}
            indeterminate={isIndeterminate}
            onChange={(e) => {
              if (e.target.checked) selectMultipleLines(group.lines);
              else deselectMultipleLines(group.lines);
            }}
            aria-label={`Select PO ${group.poNumber}`}
          />
        </td>
        <td className="p-4 pl-2 w-8">
          <ChevronIcon open={isOpen} />
        </td>
        <td className="p-4 pl-6 font-mono text-sm font-semibold text-slate-700 whitespace-nowrap">
          {group.poNumber}
        </td>
        <td className="p-4 pl-6 text-sm text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">
          {formatCurrency(group.totalValue)}
        </td>
        <td
          className={`p-4 pl-6 text-sm whitespace-nowrap font-medium ${diff < 0 ? 'text-red-600' : 'text-slate-600'}`}
        >
          {formatDate(group.earliestDate)}
        </td>
        <td
          className="p-4 pl-6 text-sm text-slate-700 max-w-[180px] truncate"
          title={group.supplierName}
        >
          {group.supplierName}
        </td>
        <td className="p-4 pl-6 text-sm text-slate-600 whitespace-nowrap">{group.country}</td>
        <td className="p-4 pl-6 whitespace-nowrap">
          {majorityDSCode ? (
            <DSTooltipBadge code={majorityDSCode} />
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </td>
        <td className="p-4 pl-6 text-sm text-right font-medium text-slate-600 tabular-nums">
          {group.lineCount}
        </td>
        <td className="p-4 pl-6 whitespace-nowrap">
          <StatusTooltipBadge {...statusSummary} />
        </td>
      </tr>
    );
  },
  (prev, next) => {
    return (
      prev.group === next.group &&
      prev.isOpen === next.isOpen &&
      prev.isChecked === next.isChecked &&
      prev.isIndeterminate === next.isIndeterminate
    );
  },
);

/* ─── Sub-table for expanded PO lines ────────────────────── */
export function PoSubTable({
  lines,
  searchTerm,
  onRowClick,
  selectedLineItem,
  toggleSelection,
  isSelected,
}: {
  lines: PurchaseOrder[];
  searchTerm: string;
  onRowClick: (line: PurchaseOrder) => void;
  selectedLineItem: PurchaseOrder | null;
  toggleSelection: (item: PurchaseOrder) => void;
  isSelected: (item: PurchaseOrder) => boolean;
}) {
  const term = searchTerm.toLowerCase().trim();

  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-slate-100/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          {/* Checkbox col */}
          <th className="py-2.5 pl-6 pr-2 w-10" />
          <th className="py-2.5 px-4 font-semibold">SAP MAT ID</th>
          <th className="py-2.5 px-4 font-semibold">Item Description</th>
          <th className="py-2.5 px-4 font-semibold text-right">Open QTY</th>
          <th className="py-2.5 px-4 font-semibold text-right">Open PO Value (USD)</th>
          <th className="py-2.5 px-4 font-semibold">Delivery Date</th>
          <th className="py-2.5 px-4 font-semibold">PO Release Date</th>
          <th className="py-2.5 px-4 font-semibold">Delivery Status</th>
          <th className="py-2.5 px-4 font-semibold">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {lines.map((line, i) => {
          const isChecked = isSelected(line);
          const isDrawerOpen = selectedLineItem === line;
          return (
            <PoLineItemRow
              key={i}
              line={line}
              term={term}
              isChecked={isChecked}
              isDrawerOpen={isDrawerOpen}
              onRowClick={onRowClick}
              toggleSelection={toggleSelection}
            />
          );
        })}
      </tbody>
    </table>
  );
}
