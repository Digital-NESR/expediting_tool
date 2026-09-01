'use client';

import { useState } from 'react';
import { GLASS } from './LaptopShell';

type AudienceKey = 'requester' | 'approver' | 'general';

interface HelpSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

interface AudienceMaterial {
  key: AudienceKey;
  label: string;
  blurb: string;
  sections: HelpSection[];
}

const AUDIENCES: AudienceMaterial[] = [
  {
    key: 'requester',
    label: 'For Requesters',
    blurb: 'How to submit a laptop or desktop request and track it through to approval.',
    sections: [
      {
        heading: 'Submitting a request',
        paragraphs: [
          'Start a request from "New Request" in the sidebar. There are three types, and the fields you see change based on which one you pick:',
        ],
        bullets: [
          'New Employee — for HR to request a device for someone joining the company. You pick the company, department, and cost center the new hire belongs to.',
          'Upgrade/Replacement — for yourself, when your current device needs replacing.',
          'Unit — for a shared or company-owned asset rather than a specific person.',
        ],
      },
      {
        heading: 'What you’ll need',
        bullets: [
          'Country — pick it yourself; it’s never auto-filled. This decides which Country Manager, IT Director, and Supply Chain Director will review the request, so pick carefully.',
          'Company Code / Company Name / Cost Center — for New Employee requests, filtered by the country you selected.',
          'Special Requirements / Justification — a short explanation of why the device is needed.',
        ],
      },
      {
        heading: 'What happens after you submit',
        paragraphs: [
          'Your request goes to your country’s IT Manager first. From there it moves through Country Manager, IT Director, and Supply Chain Director in order. Once fully approved, it becomes an IT ticket for fulfillment.',
          'You can watch it move on the Requests page — the status badge and "Current Owner" field always show exactly who has it right now.',
        ],
      },
      {
        heading: 'Cancelling a request',
        paragraphs: [
          'You can cancel a request yourself only while it’s still with the IT Manager (status "Submitted" or "IT Approval"). Once it has moved past that stage, ask your IT Manager or an Admin to reject it back to you if it’s no longer needed.',
        ],
      },
    ],
  },
  {
    key: 'approver',
    label: 'For Approvers',
    blurb: 'How to review, approve, or reject requests at your stage — IT Manager, Country Manager, IT Director, or Supply Chain Director.',
    sections: [
      {
        heading: 'The approval chain',
        bullets: [
          'IT Manager — triages the request: repair the existing device, assign one from stock, or specify a brand new device to procure.',
          'Country Manager — approves the request forward, or flags it for new-device procurement if what’s on file isn’t good enough.',
          'IT Director — reviews and approves forward.',
          'Supply Chain Director — gives the final sign-off, which creates the IT ticket.',
        ],
      },
      {
        heading: 'IT Manager’s decision',
        paragraphs: [
          'You have three options: Repaired & Closed (ends the request), Assign existing laptop (hand over a specific unit from stock), or Procure New & Send to Country Manager (specify a brand-new device up front, skipping the Country Manager’s own procure-new round-trip).',
          'Assign and Procure New both also ask for the Existing Device details — the device being replaced (brand, model, serial, age, SAP Asset ID) — in the same popup, so it’s never a separate step you can forget.',
        ],
      },
      {
        heading: 'A decision comment is always required',
        paragraphs: [
          'Every decision button — Approve, Assign, Repair, Procure New, and Reject — stays disabled until you’ve written a comment. There’s no separate reject pop-up anymore: if you reject, that same comment becomes the rejection reason the IT Manager sees.',
        ],
      },
      {
        heading: 'Country Manager, IT Director, Supply Chain Director',
        bullets: [
          'Approve & Send — forwards to the next stage.',
          'Reject — always bounces the request all the way back to the IT Manager to fix and resend, regardless of which stage rejected it.',
          'Procure New (Country Manager only) — flags the request for a brand-new device if the assigned unit isn’t acceptable, sending it to the IT Team to specify what to procure.',
        ],
      },
      {
        heading: 'My Work vs. Requests',
        paragraphs: [
          'My Work only shows requests that need YOUR decision right now. Requests shows everything in your scope, including items currently sitting with someone else in the chain.',
        ],
      },
      {
        heading: 'Delegating your authority',
        paragraphs: [
          'Use the Delegate page to hand a specific role you hold — stage and country — to a colleague while you’re away, with optional start/end dates. You can revoke it at any time, and it expires automatically if you set an end date.',
        ],
      },
      {
        heading: 'Reading device age',
        paragraphs: [
          'Wherever a device’s age is shown — the existing device being replaced, or the unit being assigned — it’s color-coded: green for 5+ years, red for anything younger, as a quick cue for whether replacement makes sense.',
        ],
      },
    ],
  },
  {
    key: 'general',
    label: 'General Overview',
    blurb: 'What Laptop Procurement is for, and how a request flows from submission to a ticket.',
    sections: [
      {
        heading: 'Purpose',
        paragraphs: [
          'Laptop Procurement tracks every laptop and desktop request — new hires, upgrades, replacements, and shared units — through one auditable approval chain, replacing ad hoc email requests.',
        ],
      },
      {
        heading: 'The flow at a glance',
        bullets: [
          'Requester submits a request.',
          'IT Manager triages it — repair, assign existing, or procure new.',
          'Country Manager approves it forward, or flags it for new-device procurement.',
          'IT Director reviews it.',
          'Supply Chain Director gives the final approval.',
          'An IT ticket is created for fulfillment.',
        ],
      },
      {
        heading: 'Roles',
        bullets: [
          'Requester — anyone signed in can submit and track their own requests.',
          'Reviewer — IT Manager, Country Manager, IT Director, or Supply Chain Director authority, granted per country through the approver matrix rather than a fixed account role.',
          'Admin — manages permissions, the approver matrix, and the device catalog from the Admin Panel.',
        ],
      },
      {
        heading: 'Getting access',
        paragraphs: [
          'Everyone signed in can already submit requests as a Requester — there’s nothing to request there. Approval authority for a specific country and stage is granted by an Admin through the approver matrix; contact an Admin if you need reviewer access.',
        ],
      },
    ],
  },
];

function HelpSectionCard({ section }: { section: HelpSection }) {
  return (
    <div className={`${GLASS} p-5`}>
      <h3 className="text-sm font-bold text-slate-900">{section.heading}</h3>
      <div className="mt-2.5 space-y-2.5">
        {section.paragraphs?.map((p, i) => (
          <p key={i} className="text-sm leading-relaxed text-slate-600">{p}</p>
        ))}
        {section.bullets && (
          <ul className="space-y-1.5">
            {section.bullets.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-600">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#307c4c]" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function LaptopHelpContent() {
  const [audienceKey, setAudienceKey] = useState<AudienceKey>('requester');
  const audience = AUDIENCES.find(a => a.key === audienceKey) ?? AUDIENCES[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {AUDIENCES.map(a => {
          const active = a.key === audienceKey;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => setAudienceKey(a.key)}
              className={`rounded-lg border px-4 py-2 text-sm font-bold transition-colors ${
                active
                  ? 'border-[#307c4c] bg-[#307c4c]/10 text-[#307c4c]'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      <p className="text-sm text-slate-500">{audience.blurb}</p>

      <div className="space-y-4">
        {audience.sections.map(section => (
          <HelpSectionCard key={section.heading} section={section} />
        ))}
      </div>
    </div>
  );
}
