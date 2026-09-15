'use client';

import MultiSelectDropdown from '@/components/MultiSelectDropdown';
import { DS_DISPLAY_LABELS } from '@/lib/ds-codes';

export function FilterBar({
  search,
  onSearch,
  deliveryCode,
  onDeliveryCode,
  deliveryCodes,
  country,
  onCountry,
  countries,
  suppliers,
  onSuppliers,
  supplierList,
  supplierDisplayMap,
  buyers,
  onBuyers,
  buyerList,
  pGroup,
  onPGroup,
  pGroupList,
  segment,
  onSegment,
  segmentList,
}: {
  search: string;
  onSearch: (v: string) => void;
  deliveryCode: string[];
  onDeliveryCode: (v: string[]) => void;
  deliveryCodes: string[];
  country: string[];
  onCountry: (v: string[]) => void;
  countries: string[];
  suppliers: string[];
  onSuppliers: (v: string[]) => void;
  supplierList: string[];
  supplierDisplayMap: Record<string, string>;
  buyers: string[];
  onBuyers: (v: string[]) => void;
  buyerList: string[];
  pGroup: string[];
  onPGroup: (v: string[]) => void;
  pGroupList: string[];
  segment: string[];
  onSegment: (v: string[]) => void;
  segmentList: string[];
}) {
  const inputBase =
    'bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-[#307c4c] focus:border-[#307c4c] outline-none transition-colors duration-150';

  return (
    <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-white">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        {/* ── Global Search ── */}
        <div className="relative w-full md:flex-none md:w-[360px]">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
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
            id="filter-search"
            type="search"
            placeholder="Search by PO Number, Supplier, Supplier ID, or SAP MAT ID…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Search by PO Number, Supplier Name, Supplier ID or SAP MAT ID"
            className={`${inputBase} pl-9 pr-4 py-2.5 w-full`}
          />
        </div>

        {/* ── Multi-Selects ── */}
        <MultiSelectDropdown
          options={supplierList}
          selectedOptions={suppliers}
          onChange={onSuppliers}
          label="Supplier"
          displayMap={supplierDisplayMap}
        />
        <MultiSelectDropdown
          options={buyerList}
          selectedOptions={buyers}
          onChange={onBuyers}
          label="Buyer Name"
        />
        <MultiSelectDropdown
          options={deliveryCodes}
          selectedOptions={deliveryCode}
          onChange={onDeliveryCode}
          label="Delivery Status"
          displayMap={DS_DISPLAY_LABELS}
        />
        <MultiSelectDropdown
          options={countries}
          selectedOptions={country}
          onChange={onCountry}
          label="Country"
        />
        <MultiSelectDropdown
          options={pGroupList}
          selectedOptions={pGroup}
          onChange={onPGroup}
          label="P Group"
        />
        <MultiSelectDropdown
          options={segmentList}
          selectedOptions={segment}
          onChange={onSegment}
          label="Segment"
        />
      </div>
    </div>
  );
}
