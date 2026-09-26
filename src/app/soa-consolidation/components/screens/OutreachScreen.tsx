'use client';

import { useCallback, useState } from 'react';
import EmailTemplateCard from '../EmailTemplateCard';
import RecipientList from '../RecipientList';
import type { ScreenProps } from '../../types';

/**
 * Outreach.
 *
 * The prototype could only send reminders, which meant the first request could never be sent at
 * all: a freshly scoped country is 270 vendors sitting at `scoped`, and nothing moved them. Both
 * sends are here now, and each reports what actually happened rather than assuming it worked.
 */
export default function OutreachScreen({ vm }: ScreenProps) {
  /* Three steps rather than three screens: approving the letter, checking who it reaches and
     sending it are one task done in order, and splitting them across sidebar entries invites
     sending before anybody has read what is going out. */
  const [step, setStep] = useState<'letter' | 'recipients' | 'send'>('letter');
  const [extraCc, setExtraCc] = useState<string[]>([]);
  const onCcChange = useCallback((emails: string[]) => setExtraCc(emails), []);

  const steps = [
    { id: 'letter', n: 1, label: 'Letter' },
    { id: 'recipients', n: 2, label: 'Recipients' },
    { id: 'send', n: 3, label: 'Send' },
  ] as const;

  return (
    <div className="animate-[fadeIn_0.2s_ease]">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-[20px] font-bold mb-[3px]">Outreach</h1>
          <p className="text-[12px] text-sns-grey">
            Automated vendor outreach — {vm.contextLine} · Deadline {vm.deadlineLabel}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {step === 'send' && vm.hasUnrequested && (
            <button
              type="button"
              onClick={() => vm.onSendRequests(extraCc)}
              disabled={vm.busy}
              className="bg-sns-green text-white border-none px-4 py-[9px] rounded-[7px] text-[13px] font-bold disabled:opacity-50"
            >
              Send Initial Requests to {vm.unrequestedCount} Vendors
            </button>
          )}
          {step === 'send' && vm.canSendReminders && (
            <button
              type="button"
              onClick={() => vm.onSendReminders(extraCc)}
              disabled={vm.busy}
              className="bg-[#E65100] text-white border-none px-4 py-[9px] rounded-[7px] text-[13px] font-bold disabled:opacity-50"
            >
              Send Reminders to {vm.remindCount} Vendors
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 mb-4">
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id)}
            className={`flex items-center gap-1.5 px-3 py-[7px] rounded-[7px] text-[12px] font-bold border ${
              step === s.id
                ? 'bg-sns-green text-white border-sns-green'
                : 'bg-white text-sns-ink border-sns-line'
            }`}
          >
            <span
              className={`grid place-items-center w-[17px] h-[17px] rounded-full text-[10px] ${
                step === s.id ? 'bg-[rgba(255,255,255,0.25)]' : 'bg-[#ECEFEC] text-sns-grey'
              }`}
            >
              {s.n}
            </span>
            {s.label}
            {i < steps.length - 1 && <span className="text-[10px] opacity-50 ml-1">›</span>}
          </button>
        ))}
      </div>

      {step === 'letter' && (
        <EmailTemplateCard
          countryId={vm.activeCountryId}
          canEdit={vm.canScope}
          onNext={() => setStep('recipients')}
        />
      )}

      {step === 'recipients' && (
        <>
          <RecipientList
            countryId={vm.activeCountryId}
            canEdit={vm.canScope}
            senderEmail={vm.viewerEmail}
            onBack={() => setStep('letter')}
            onCcChange={onCcChange}
          />
          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={() => setStep('send')}
              className="bg-sns-green text-white border-none px-4 py-[9px] rounded-[7px] text-[13px] font-bold"
            >
              Next: send →
            </button>
          </div>
        </>
      )}

      {step === 'send' && (
      <>
      <div className="grid grid-cols-[repeat(4,1fr)] gap-2.5 mb-4">
        <div className="bg-white rounded-lg p-3.5 border-t-[3px] border-t-sns-green shadow-[0_1px_3px_rgba(0,0,0,0.07)] text-center">
          <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold mb-1">
            Not Yet Requested
          </div>
          <div className="text-[28px] font-bold text-sns-grey">{vm.unrequestedCount}</div>
          <div className="text-[10px] text-sns-grey">of {vm.totalCount} in scope</div>
        </div>
        <div className="bg-white rounded-lg p-3.5 border-t-[3px] border-t-[#1565C0] shadow-[0_1px_3px_rgba(0,0,0,0.07)] text-center">
          <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold mb-1">
            Reminders Sent
          </div>
          <div className="text-[28px] font-bold text-[#1565C0]">{vm.remindedCount}</div>
          <div className="text-[10px] text-sns-grey">Second request on file</div>
        </div>
        <div className="bg-white rounded-lg p-3.5 border-t-[3px] border-t-[#E65100] shadow-[0_1px_3px_rgba(0,0,0,0.07)] text-center">
          <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold mb-1">
            Awaiting Response
          </div>
          <div className="text-[28px] font-bold text-[#E65100]">{vm.remindCount}</div>
          <div className="text-[10px] text-sns-grey">Eligible for reminder</div>
        </div>
        <div className="bg-white rounded-lg p-3.5 border-t-[3px] border-t-sns-green shadow-[0_1px_3px_rgba(0,0,0,0.07)] text-center">
          <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold mb-1">
            Responses Received
          </div>
          <div className="text-[28px] font-bold text-sns-green">{vm.receivedCount}</div>
          <div className="text-[10px] text-sns-grey">{vm.coveragePct}% coverage</div>
        </div>
      </div>

      {/* Unreachable vendors and refused dispatches are the usual reason coverage stops moving,
          and neither was visible anywhere in the prototype. */}
      <div className="bg-white rounded-[10px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.07)] mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-sns-grey">
              Delivery
            </div>
            <div className="text-[12px] text-sns-ink mt-0.5">
              {vm.unreachableCount > 0 ? (
                <span className="text-[#B71C1C] font-bold">
                  {vm.unreachableCount} in-scope vendors have no email address and cannot be sent
                  anything.
                </span>
              ) : (
                <span>Every in-scope vendor has at least one contact address on file.</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={vm.onLoadFailures}
            disabled={vm.busy}
            className="bg-white text-sns-ink border border-sns-line px-3 py-[7px] rounded-md text-[11px] font-bold disabled:opacity-50"
          >
            {vm.failuresLoaded ? 'Refresh failed dispatches' : 'Show failed dispatches'}
          </button>
        </div>
        {vm.failuresLoaded && !vm.hasFailures && (
          <div className="text-[11px] text-sns-grey mt-2.5">
            No send has been refused for this country in this cycle.
          </div>
        )}
        {vm.hasFailures && (
          <div className="mt-2.5 border-t border-t-[#F0F0F0] pt-2.5">
            {vm.failures?.map((f) => (
              <div
                key={`${f.vendorNo}-${f.sentAt}`}
                className="flex gap-3 py-1.5 text-[11px] border-b border-b-[#F5F5F5] items-start"
              >
                <div className="w-[190px] shrink-0">
                  <div className="font-bold text-sns-ink">{f.vendorName}</div>
                  <div className="text-sns-grey font-[family-name:monospace] text-[10px]">
                    {f.vendorNo}
                  </div>
                </div>
                <div className="flex-1 text-[#B71C1C] leading-[1.4]">{f.error}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      </>
      )}
    </div>
  );
}
