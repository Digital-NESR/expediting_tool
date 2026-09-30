'use client';

import { useCallback, useState } from 'react';
import EmailTemplateCard from '../EmailTemplateCard';
import RecipientList from '../RecipientList';
import type { ScreenProps } from '../../types';
import SendProgressBar from '../SendProgress';
import { useConfirm } from '../useConfirm';

/**
 * Outreach: approve the letter, check who it reaches, send it.
 *
 * It used to end on a third step of its own, which held four counts and the delivery log and no
 * decision. The counts were the same ones Response Tracking's filter tabs carry, and the delivery
 * log belongs beside the vendors it names, so both moved there and the send moved to the foot of
 * the recipient list. Sending is now one press on the screen that shows what the press will do,
 * rather than a press on a page whose only content was a summary of the page before it.
 */
export default function OutreachScreen({ vm }: ScreenProps) {
  /* Two steps rather than two screens: the letter and its recipients are one task done in order,
     and splitting them across sidebar entries invites sending before anybody has read what is
     going out. */
  const [step, setStep] = useState<'letter' | 'recipients'>('letter');
  const [extraCc, setExtraCc] = useState<string[]>([]);
  const [ccRemoved, setCcRemoved] = useState<string[]>([]);
  const onCcChange = useCallback((emails: string[]) => setExtraCc(emails), []);
  const onCcRemovedChange = useCallback((emails: string[]) => setCcRemoved(emails), []);
  const { ask, dialog } = useConfirm();

  /* Sending is the one act here that cannot be taken back. Once 61 letters are in 61 suppliers'
     inboxes there is no version of this tool that retrieves them, so the count and the letter
     being sent are stated once more before it happens. */
  async function confirmSend(kind: 'request' | 'reminder', count: string) {
    const ok = await ask({
      title: kind === 'request' ? 'Send the statement request?' : 'Send a reminder?',
      confirmLabel: kind === 'request' ? `Send to ${count}` : `Remind ${count}`,
      tone: 'normal',
      body: (
        <>
          <strong>
            {count} {count === '1' ? 'vendor' : 'vendors'}
          </strong>{' '}
          will be emailed the letter you approved, each with the blank template attached and their
          own upload link. This cannot be undone.
        </>
      ),
    });
    if (!ok) return;
    if (kind === 'request') vm.onSendRequests(extraCc, ccRemoved);
    else vm.onSendReminders(extraCc, ccRemoved);
  }

  const steps = [
    { id: 'letter', n: 1, label: 'Letter' },
    { id: 'recipients', n: 2, label: 'Recipients' },
  ] as const;

  const canSendAnything = vm.hasUnrequested || vm.canSendReminders;

  return (
    <div className="animate-[fadeIn_0.2s_ease]">
      {dialog}
      <div className="mb-4">
        <h1 className="text-[20px] font-bold mb-[3px]">Outreach</h1>
        <p className="text-[12px] text-sns-grey">
          Automated vendor outreach, {vm.contextLine} · Statements due {vm.deadlineLabel}
        </p>
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
            onCcRemovedChange={onCcRemovedChange}
          />

          {/* The send sits under the list it will use, and says how many letters it is about to
              put out. A button reading only "Send" is the one that gets pressed twice. */}
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5">
            {/* While a send runs the buttons are gone, not merely disabled: there is nothing
                sensible to press, and a greyed button for two minutes reads as a hang. */}
            {vm.sendProgress ? (
              <SendProgressBar progress={vm.sendProgress} pct={vm.sendProgressPct} />
            ) : (
              <>
                {!canSendAnything && (
                  <span className="text-[11.5px] text-sns-grey">
                    {vm.canAct
                      ? 'Every vendor in scope has already been written to. Chase individual suppliers from Response Tracking.'
                      : 'You can read this country but not send on it.'}
                  </span>
                )}
                {vm.hasUnrequested && (
                  <button
                    type="button"
                    onClick={() => confirmSend('request', String(vm.unrequestedCount))}
                    disabled={vm.busy}
                    className="bg-sns-green text-white border-none px-4 py-[9px] rounded-[7px] text-[13px] font-bold disabled:opacity-50"
                  >
                    Send the request to {vm.unrequestedCount}{' '}
                    {vm.unrequestedCount === 1 ? 'vendor' : 'vendors'}
                  </button>
                )}
                {vm.canSendReminders && (
                  <button
                    type="button"
                    onClick={() => confirmSend('reminder', vm.remindCount)}
                    disabled={vm.busy}
                    className="bg-[#E65100] text-white border-none px-4 py-[9px] rounded-[7px] text-[13px] font-bold disabled:opacity-50"
                  >
                    Send a reminder to {vm.remindCount}{' '}
                    {vm.remindCount === '1' ? 'vendor' : 'vendors'}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
