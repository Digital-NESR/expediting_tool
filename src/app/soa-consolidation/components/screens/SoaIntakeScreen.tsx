import type { ScreenProps } from '../../types';

export default function SoaIntakeScreen({ vm }: ScreenProps) {
  return (
    <div className="animate-[fadeIn_0.2s_ease]">
      <div className="mb-4">
        <h1 className="text-[20px] font-bold mb-[3px]">SOA Intake</h1>
        <p className="text-[12px] text-sns-grey">
          Vendor-facing secure upload experience (portal preview)
        </p>
      </div>
      <div className="bg-[#F0F4F1] border-2 border-dashed border-sns-green rounded-[10px] px-4 py-3 mb-4 flex items-center gap-2.5">
        <div className="bg-sns-green text-white rounded-md px-2.5 py-1 text-[11px] font-bold shrink-0">
          PREVIEW
        </div>
        <div className="text-[12px] text-sns-green">
          This is what the vendor sees when they click the secure link in their request email. No
          account creation required.
        </div>
      </div>

      <div className="bg-white rounded-xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.1)] max-w-[680px] mx-auto">
        <div className="bg-sns-green px-5.5 py-4 flex items-center justify-between">
          <div>
            <div className="text-white font-bold text-[14px] tracking-[2px]">NESR</div>
            <div className="text-[rgba(255,255,255,0.7)] text-[11px]">
              Vendor Statement of Account Portal
            </div>
          </div>
          <div className="bg-[rgba(255,255,255,0.15)] rounded-md px-3 py-[5px] text-white text-[11px] font-bold">
            Q3 2026
          </div>
        </div>
        <div className="p-5.5">
          <div className="border-b border-b-[#E0E0E0] pb-3.5 mb-4">
            <div className="text-[16px] font-bold mb-1.5">Statement of Account Submission</div>
            <div className="grid grid-cols-[1fr_1fr] gap-2">
              <div className="bg-[#F5F5F5] rounded-md px-3 py-2">
                <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold">
                  Legal Entity
                </div>
                <div className="text-[13px] font-bold mt-0.5">NESR Saudi Arabia Co.</div>
              </div>
              <div className="bg-[#F5F5F5] rounded-md px-3 py-2">
                <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold">
                  Submission Deadline
                </div>
                <div className="text-[13px] font-bold text-[#E65100] mt-0.5">15 July 2026</div>
              </div>
            </div>
          </div>
          <div className="mb-3.5">
            <div className="text-[12px] font-bold mb-2 text-sns-ink">Required Information</div>
            <div className="grid grid-cols-[1fr_1fr] gap-2 mb-2">
              <div>
                <div className="text-[11px] text-sns-grey mb-[3px] font-bold">Vendor Name *</div>
                <div className="border border-sns-line rounded-[5px] px-2.5 py-2 text-[12px] text-sns-grey">
                  Al-Zamil Industrial Inv.
                </div>
              </div>
              <div>
                <div className="text-[11px] text-sns-grey mb-[3px] font-bold">Vendor No. *</div>
                <div className="border border-sns-line rounded-[5px] px-2.5 py-2 text-[12px] text-sns-grey font-[family-name:monospace]">
                  SA-023456
                </div>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_1fr] gap-2 mb-2">
              <div>
                <div className="text-[11px] text-sns-grey mb-[3px] font-bold">Period *</div>
                <div className="border border-sns-line rounded-[5px] px-2.5 py-2 text-[12px] text-sns-grey">
                  Q3 2026 (Apr – Jun 2026)
                </div>
              </div>
              <div>
                <div className="text-[11px] text-sns-grey mb-[3px] font-bold">Currency *</div>
                <div className="border border-sns-line rounded-[5px] px-2.5 py-2 text-[12px] text-sns-grey">
                  SAR
                </div>
              </div>
            </div>
          </div>
          <div className="border-2 border-dashed border-sns-line rounded-lg p-5 text-center mb-3.5 bg-[#FAFAFA]">
            <div className="text-[24px] mb-1.5">📄</div>
            <div className="text-[13px] font-bold text-sns-ink mb-1">Upload SOA File</div>
            <div className="text-[11px] text-sns-grey mb-2.5">
              Excel (.xlsx) or signed PDF · Max 10MB
            </div>
            <div
              onClick={vm.onOpenUploadFlow}
              className="bg-sns-green text-white inline-block px-[18px] py-2 rounded-md text-[12px] font-bold cursor-pointer"
            >
              Browse File
            </div>
          </div>
          <div className="bg-[#F0F7F3] border border-sns-green-pale rounded-md px-3 py-2.5 text-[11px] text-sns-green leading-[1.5]">
            Your submission is encrypted and stored securely. It will be validated against the NESR
            SOA template and acknowledged within 24 hours. Contact aarashidi@nesr.com with any
            questions.
          </div>
        </div>
      </div>
    </div>
  );
}
