import type { ScreenProps } from '../../types';

export default function UploadModal({ vm }: ScreenProps) {
  return (
    <>
      <div className="bg-sns-green px-5 py-4 flex items-center justify-between">
        <div className="text-white font-bold text-[14px]">Accept SOA — {vm.modalVendorName}</div>
        <div onClick={vm.onCloseModal} className="text-white cursor-pointer text-[18px] opacity-70">
          ✕
        </div>
      </div>
      <div className="p-5">
        <div className="bg-[#F5F5F5] rounded-[7px] px-3.5 py-2.5 mb-3.5 text-[12px] text-sns-grey">
          <div className="font-bold text-sns-ink mb-0.5">{vm.modalVendorName}</div>
          <div>
            Vendor No: {vm.modalVendorNo} · PO Amount: {vm.modalVendorAmt}
          </div>
        </div>

        {vm.isUploadStep0 && (
          <div>
            <div className="border-2 border-dashed border-sns-line rounded-lg p-6 text-center bg-[#FAFAFA] mb-3.5">
              <div className="text-[28px] mb-2">📄</div>
              <div className="text-[13px] font-bold mb-1">Drop vendor SOA file here</div>
              <div className="text-[11px] text-sns-grey mb-3">
                Excel (.xlsx) or signed PDF · Max 10MB
              </div>
              <button
                onClick={vm.onSimulateUpload}
                className="bg-sns-green text-white border-none px-5 py-[9px] rounded-md text-[12px] font-bold"
              >
                Simulate File Upload
              </button>
            </div>
            <div className="text-[11px] text-sns-grey leading-[1.4]">
              File will be validated against the NESR SOA Template schema (Appendix 6.2). Required
              fields: Vendor No., Inv#, PO#, amounts, currency.
            </div>
          </div>
        )}

        {vm.isUploadStep1 && (
          <div className="text-center p-6">
            <div className="w-10 h-10 border-[3px] border-[#E0E0E0] border-t-sns-green rounded-full animate-[spin_0.8s_linear_infinite] mx-auto mb-3" />
            <div className="text-[13px] font-bold mb-1">Validating file…</div>
            <div className="text-[11px] text-sns-grey">
              Checking required fields: Vendor No., Inv#, PO#, amounts
            </div>
          </div>
        )}

        {vm.isUploadStep2 && (
          <div>
            <div className="bg-sns-green-wash border border-sns-green rounded-lg p-3.5 text-center mb-3.5">
              <div className="text-[24px] mb-1.5 text-sns-green">✓</div>
              <div className="text-[13px] font-bold text-sns-green mb-[3px]">
                File Validated Successfully
              </div>
              <div className="text-[11px] text-sns-grey">
                All required fields present · Format matches SOA Template
              </div>
            </div>
            <div className="bg-[#F5F5F5] rounded-md px-3.5 py-2.5 mb-3.5 text-[11px] text-sns-grey">
              <div className="grid grid-cols-[1fr_1fr] gap-1.5">
                <div>
                  <strong>Invoices detected:</strong> {vm.modalInvCount}
                </div>
                <div>
                  <strong>Currency:</strong> SAR
                </div>
                <div>
                  <strong>Period:</strong> Q3 2026
                </div>
                <div>
                  <strong>Vendor No.:</strong> {vm.modalVendorNo}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={vm.onCloseModal}
                className="flex-1 bg-[#F5F5F5] text-sns-grey border-none p-2.5 rounded-[7px] text-[12px] font-bold"
              >
                Cancel
              </button>
              <button
                onClick={vm.onAcceptSOA}
                className="flex-[2] bg-sns-green text-white border-none p-2.5 rounded-[7px] text-[12px] font-bold"
              >
                Accept &amp; Store SOA →
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
