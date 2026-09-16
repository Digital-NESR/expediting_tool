import type { CountryStatus, EvidenceType, Standing, ToastType, VendorStatus } from '../types';

/* The view model says what a row or figure MEANS; these maps are the only place that decides
   what each meaning looks like. They sit beside the components rather than inside one of them
   because the same badge appears on several screens, and a per-screen copy is exactly how the
   greens drifted apart before the shared `sns-*` tokens existed.

   The greens, greys and rules come from those tokens. The oranges, blues, reds and the pale
   status washes are one-offs SOA inherited from the source design and have no token, so they
   stay as arbitrary values spelled out verbatim. */

/** Border-top rule on a KPI card, coloured by how the figure it heads is standing. */
export const STANDING_BORDER_TOP: Record<Standing, string> = {
  'on-track': 'border-t-sns-green',
  behind: 'border-t-[#E65100]',
  breach: 'border-t-[#B71C1C]',
  'in-flight': 'border-t-[#1565C0]',
  neutral: 'border-t-sns-grey',
};

/** Text colour for a figure — a KPI value, a cumulative percentage. */
export const STANDING_TEXT: Record<Standing, string> = {
  'on-track': 'text-sns-green',
  behind: 'text-[#E65100]',
  breach: 'text-[#B71C1C]',
  'in-flight': 'text-[#1565C0]',
  neutral: 'text-sns-grey',
};

/** Fill for a progress bar reporting the same standing. */
export const STANDING_BG: Record<Standing, string> = {
  'on-track': 'bg-sns-green',
  behind: 'bg-[#E65100]',
  breach: 'bg-[#B71C1C]',
  'in-flight': 'bg-[#1565C0]',
  neutral: 'bg-sns-grey',
};

/** Pill badge (wash background, matching text) for a vendor's response status. */
export const VENDOR_STATUS_BADGE: Record<VendorStatus, string> = {
  received: 'bg-sns-green-wash text-sns-green',
  requested: 'bg-[#E3F2FD] text-[#1565C0]',
  reminded: 'bg-[#FFF3E0] text-[#E65100]',
  non_responder: 'bg-[#FFEBEE] text-[#B71C1C]',
};

/** Solid fill of the same status, for the stacked response bar and its legend dots. */
export const VENDOR_STATUS_FILL: Record<VendorStatus, string> = {
  received: 'bg-sns-green',
  requested: 'bg-[#1565C0]',
  reminded: 'bg-[#E65100]',
  non_responder: 'bg-[#B71C1C]',
};

/* The filter tabs tint themselves with their own status colour when selected — the same hue at
   ~9% for the fill (the trailing `18` is the alpha byte) and full strength for the rule and
   text. "All" has no status of its own, so it borrows the portal green. */
export const FILTER_TAB_SELECTED: Record<'all' | VendorStatus, string> = {
  all: 'border-sns-green bg-[#2A7E4F18] text-sns-green',
  received: 'border-sns-green bg-[#2A7E4F18] text-sns-green',
  requested: 'border-[#1565C0] bg-[#1565C018] text-[#1565C0]',
  reminded: 'border-[#E65100] bg-[#E6510018] text-[#E65100]',
  non_responder: 'border-[#B71C1C] bg-[#B71C1C18] text-[#B71C1C]',
};

/** Pill badge for where a country has got to in the cycle. */
export const COUNTRY_STATUS_BADGE: Record<CountryStatus, string> = {
  not_started: 'bg-[#F5F5F5] text-sns-grey',
  in_progress: 'bg-[#E3F2FD] text-[#1565C0]',
  requests_sent: 'bg-[#E1F5FE] text-[#1565C0]',
  reminders_sent: 'bg-[#FFF3E0] text-[#E65100]',
  consolidating: 'bg-[#F3E5F5] text-[#6A1B9A]',
  handed_off: 'bg-sns-green-wash text-sns-green',
};

/** Solid fill keying an audit-trail entry to the kind of action it records. */
export const EVIDENCE_TYPE_FILL: Record<EvidenceType, string> = {
  email: 'bg-[#1565C0]',
  upload: 'bg-sns-green',
  reminder: 'bg-[#E65100]',
  scope: 'bg-[#6A1B9A]',
  info: 'bg-sns-grey',
  handoff: 'bg-sns-green',
};

/** Toast background by how the news lands. */
export const TOAST_FILL: Record<ToastType, string> = {
  success: 'bg-sns-green',
  warning: 'bg-[#E65100]',
  info: 'bg-[#333]',
};
