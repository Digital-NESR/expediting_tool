import { useEffect, useState } from 'react';

// Re-using types from page
export interface PurchaseOrder {
  'PO Number': string;
  'PO Line'?: string;
  'Supplier Name': string;
  'Supplier ID'?: string;
  'Item Description': string;
  'SAP MAT ID': string;
  'Open QTY': number | string;
  'Open PO Value USD': number | string;
  'Delivery Date': string;
  'Delivery Code': string;
  'Country': string;
  'Delivery Comments'?: string;
}

interface DrawerProps {
  lineItem: PurchaseOrder | null;
  onClose: () => void;
  // We accept formatting tools from parent to avoid circular dependencies
  formatCurrency: (v: any) => string;
  formatDate: (v: any) => string;
  deliveryStatusMap: Record<string, string>;
}

export default function LineItemDrawer({
  lineItem,
  onClose,
  formatCurrency,
  formatDate,
  deliveryStatusMap
}: DrawerProps) {
  // Use state to manage delayed unmount for exit animation
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    if (lineItem) {
      setIsRendered(true);
      // Prevent body scroll when drawer is open
      document.body.style.overflow = 'hidden';
    } else {
      // Re-enable scroll when closing
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [lineItem]);

  // Handle animation finish before fully removing from DOM
  const handleTransitionEnd = () => {
    if (!lineItem) {
      setIsRendered(false);
    }
  };

  if (!isRendered && !lineItem) return null;

  // We keep the old item during exit animation
  const item = lineItem;
  const isOpen = !!lineItem;

  return (
    <div 
      className={`fixed inset-0 z-50 flex justify-end overflow-hidden pointer-events-none`}
    >
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-slate-900/30 backdrop-blur-sm pointer-events-auto transition-opacity duration-300 ease-in-out ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div 
        className={`relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col pointer-events-auto transform transition-transform duration-300 ease-in-out sm:rounded-l-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        onTransitionEnd={handleTransitionEnd}
      >
        {item && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <span>PO {item['PO Number']}</span>
                  <span className="text-sm font-medium px-2 py-0.5 bg-[#307c4c]/10 text-[#307c4c] rounded-md">
                    Line {item['PO Line'] ?? '—'}
                  </span>
                </h2>
              </div>
              <button 
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="Close panel"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              
              {/* Section 1: Material Info */}
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 border-b border-slate-100 pb-2">Material Information</h3>
                <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                  <div>
                    <dt className="text-xs font-medium text-slate-500 mb-1">SAP MAT ID</dt>
                    <dd className="text-sm font-semibold text-slate-800 font-mono">{item['SAP MAT ID'] || '—'}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs font-medium text-slate-500 mb-1">Item Description</dt>
                    <dd className="text-sm text-slate-700 leading-relaxed">{item['Item Description'] || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500 mb-1">Open QTY</dt>
                    <dd className="text-sm font-semibold text-slate-800 tabular-nums">{Number(item['Open QTY'] || 0).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500 mb-1">Open PO Value</dt>
                    <dd className="text-sm font-bold text-[#307c4c] tabular-nums">{formatCurrency(item['Open PO Value USD'])}</dd>
                  </div>
                </div>
              </section>

              {/* Section 2: Supplier Info */}
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 border-b border-slate-100 pb-2">Supplier Details</h3>
                <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                  <div className="col-span-2">
                    <dt className="text-xs font-medium text-slate-500 mb-1">Supplier Name</dt>
                    <dd className="text-sm font-semibold text-slate-800">{item['Supplier Name'] || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500 mb-1">Supplier ID</dt>
                    <dd className="text-sm text-slate-700 font-mono">{item['Supplier ID'] || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500 mb-1">Country</dt>
                    <dd className="text-sm font-medium text-slate-700 bg-slate-100 inline-flex px-2 py-0.5 rounded-md border border-slate-200">{item['Country'] || '—'}</dd>
                  </div>
                </div>
              </section>

              {/* Section 3: Expediting Details */}
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 border-b border-slate-100 pb-2">Expediting Details</h3>
                <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                  <div>
                    <dt className="text-xs font-medium text-slate-500 mb-1">Delivery Date</dt>
                    <dd className="text-sm font-semibold text-slate-800">{formatDate(item['Delivery Date'])}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs font-medium text-slate-500 mb-1">Delivery Code</dt>
                    <dd className="text-sm font-medium text-slate-700 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 inline-block mt-1">
                      {deliveryStatusMap[item['Delivery Code']] || item['Delivery Code'] || '—'}
                    </dd>
                  </div>
                  <div className="col-span-2 mt-2">
                    <dt className="text-xs font-medium text-slate-500 mb-2">Delivery Comments</dt>
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/60 shadow-inner min-h-[120px]">
                      {item['Delivery Comments'] ? (
                        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{item['Delivery Comments']}</p>
                      ) : (
                        <p className="text-sm text-slate-400 italic">No comments available for this line item.</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>

            </div>
          </>
        )}
      </div>
    </div>
  );
}
