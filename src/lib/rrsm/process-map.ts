/**
 * The month's process as one country runs it, for the process map on Help & Training (user
 * request, 25 Nov 2026).
 *
 * Pure: the steps a country goes through follow from its settings in Admin -> RRSM (which modules
 * it runs, and whether suppliers and/or Ops validate), so the map is computed here rather than
 * drawn by hand per country, and stays right when an admin switches a step on or off.
 */

export type ProcessActor = 'buyer' | 'supplier' | 'ops' | 'requester' | 'sap';

export const ACTOR_LABEL: Record<ProcessActor, string> = {
  buyer: 'Buyer',
  supplier: 'Supplier',
  ops: 'Ops validator',
  requester: 'Requester',
  sap: 'SAP, automatic',
};

export interface ProcessStep {
  actor: ProcessActor;
  title: string;
  /** Where in RRSM it happens (page and button), or how. */
  where: string;
  detail: string;
  /** Only sometimes needed (e.g. a supplier changed a rate). */
  optional?: boolean;
  /** What happens when this step sends something back. */
  loop?: string;
}

export interface ProcessSettings {
  supplier: boolean;
  ops: boolean;
  rentals: boolean;
  recurrent: boolean;
  /** Recurrent reminders are mailed (off until an admin switches them on). */
  reminders: boolean;
}

/** The monthly rentals cycle, open to close, with only the steps this country runs. */
export function rentalSteps(s: Pick<ProcessSettings, 'supplier' | 'ops'>): ProcessStep[] {
  const startsAt = s.supplier ? 'Awaiting supplier' : s.ops ? 'Submitted' : 'Validated';
  const steps: ProcessStep[] = [
    {
      actor: 'buyer',
      title: 'Open the month',
      where: 'PR & PO → Open [month]',
      detail: `Every unit on hire in the Service Registry is copied in at today's rate and last month's quantity. Lines start at "${startsAt}".`,
    },
  ];

  if (s.supplier) {
    steps.push(
      {
        actor: 'buyer',
        title: 'Invite the suppliers',
        where: 'Supplier validation → Send invitations',
        detail:
          'Tick which documents each supplier must upload (Delivery Note, Timesheet, Invoice). Each gets a personal link by email. Remind anyone who has not submitted.',
      },
      {
        actor: 'supplier',
        title: 'Confirm the month',
        where: 'Emailed link + one-time code',
        detail:
          'Checks on hire, days and quantity, changes the rate if it changed, uploads the documents and submits.',
      },
      {
        actor: 'buyer',
        title: 'Accept or reject rate changes',
        where: 'PR & PO → yellow box on the line',
        detail:
          'Only where a supplier changed a rate or pricing unit. Accept (optionally for future months too) or Reject.',
        optional: true,
      },
    );
  }

  if (s.ops) {
    steps.push(
      {
        actor: 'buyer',
        title: 'Send the lines to Ops',
        where: 'PR & PO → Send to their usual validators (or tick + pick)',
        detail:
          'Pick the validator from the directory. They get one email and see only those lines and the supplier documents.',
      },
      {
        actor: 'ops',
        title: 'Validate what was used',
        where: 'Ops validation → Validated',
        detail: 'Confirms on hire, days and quantity against what was on site.',
        loop: 'Return (with a reason) sends the line back to the buyer, who fixes it and sends it to Ops again.',
      },
    );
  }

  if (!s.supplier && !s.ops) {
    steps.push({
      actor: 'buyer',
      title: 'Check the quantities',
      where: 'PR & PO, and the Service Registry',
      detail:
        'Nobody validates in this country, so lines open ready for the PO. Check each line; fix a wrong unit in the Service Registry.',
    });
  }

  steps.push(
    {
      actor: 'buyer',
      title: 'Link each line to its PR',
      where: 'PR & PO → PR matching / Link PR',
      detail:
        'RRSM links what it can from SAP on its own. Confirm the uncertain ones ("Check"), and link the rest by picking or typing the PR.',
    },
    {
      actor: 'sap',
      title: 'PO, approval and GR fill in',
      where: 'Read from SAP several times a day',
      detail:
        'Once the PR is on a PO: the PO number, its release and the GR no. appear on the line.',
    },
    {
      actor: 'buyer',
      title: 'Close the month',
      where: 'PR & PO → Close all ready',
      detail:
        'Closes every validated line that has a PO. Closed lines are what next month compares against.',
    },
  );
  return steps;
}

/** Recurrent services: the yearly renewal of a contract, subscription or AMC. */
export function recurrentSteps(s: Pick<ProcessSettings, 'reminders'>): ProcessStep[] {
  return [
    {
      actor: 'buyer',
      title: 'Record the service',
      where: 'Recurrent services → Add service',
      detail:
        'Supplier, department, expiry, last PO and the requester-validators who decide on the renewal.',
    },
    {
      actor: 'requester',
      title: 'Hear it is due',
      where: s.reminders
        ? 'Email at 90, 60, 30, 14, 7 and 0 days'
        : 'Recurrent services (reminders are off here)',
      detail: s.reminders
        ? 'One email per person listing everything of theirs coming up for renewal.'
        : 'Reminders are switched off for this country, so requesters check the page (or the buyer tells them).',
    },
    {
      actor: 'requester',
      title: 'Decide',
      where: 'Recurrent services → open the service',
      detail: 'Renew as is, Renew with changes (say what changes) or Cancel. The buyer is emailed.',
    },
    {
      actor: 'buyer',
      title: 'Renew in SAP and record it',
      where: 'Recurrent services → the service',
      detail:
        'Raise the PR/PO as usual, then record the new PO and the new expiry. The service is Active again.',
    },
  ];
}

/** One line saying which steps a country runs, for the map's header. */
export function describeCountry(s: ProcessSettings): string {
  const parts: string[] = [];
  if (s.rentals) {
    parts.push(
      s.supplier && s.ops
        ? 'Rentals: supplier and Ops validation'
        : s.supplier
          ? 'Rentals: supplier validation, no Ops step'
          : s.ops
            ? 'Rentals: Ops validation, no supplier step'
            : 'Rentals: no validation steps, straight to PR & PO',
    );
  }
  if (s.recurrent) {
    parts.push(`Recurrent services, reminders ${s.reminders ? 'on' : 'off'}`);
  }
  return parts.join(' · ') || 'No module switched on yet';
}
