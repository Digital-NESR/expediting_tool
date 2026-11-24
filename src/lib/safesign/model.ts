/**
 * The vocabulary of SafeSign, and the rules that need no database.
 *
 * Kept free of imports from the server so the client pages and the tests can use the same labels
 * and the same "is this overdue / is a reminder due" logic the server applies.
 */

export const RESPONSE_TYPES = [
  'acknowledge',
  'sign_letter',
  'upload_signed',
  'submit_documents',
  'action_plan',
] as const;
export type ResponseType = (typeof RESPONSE_TYPES)[number];

export const RESPONSE_TYPE_LABEL: Record<ResponseType, string> = {
  acknowledge: 'Acknowledge',
  sign_letter: 'Sign the letter',
  upload_signed: 'Upload signed copy',
  submit_documents: 'Submit documents',
  action_plan: 'Action plan',
};

export const RESPONSE_TYPE_HINT: Record<ResponseType, string> = {
  acknowledge: 'Supplier enters name and job title, ticks the confirmation and clicks Acknowledge.',
  sign_letter:
    'Supplier draws a signature in the browser. A signed copy of the letter is saved with a signature page.',
  upload_signed: 'Supplier downloads the letter, signs it, and uploads the scan.',
  submit_documents: 'Supplier uploads the files you ask for, with a comment.',
  action_plan:
    'Supplier uploads a plan. You accept it or send it back with comments; every version is kept.',
};

export const ATTACHMENT_MODES = ['none', 'optional', 'required'] as const;
export type AttachmentMode = (typeof ATTACHMENT_MODES)[number];

export const ATTACHMENT_LABEL: Record<AttachmentMode, string> = {
  none: 'No extra files',
  optional: 'Supporting documents optional',
  required: 'Supporting documents required',
};

export type RequestStatus = 'pending' | 'completed' | 'under_review' | 'changes_requested';

/** What a dashboard cell shows. `overdue` is derived, never stored. */
export type DisplayStatus = RequestStatus | 'overdue' | 'not_sent';

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  pending: 'Pending',
  completed: 'Completed',
  under_review: 'Under review',
  changes_requested: 'Changes requested',
  overdue: 'Overdue',
  not_sent: 'Not sent',
};

/** Tailwind classes per status, spelled out so the compiler can see them. */
export const STATUS_CLASS: Record<DisplayStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  under_review: 'bg-sky-50 text-sky-700 ring-sky-200',
  changes_requested: 'bg-orange-50 text-orange-700 ring-orange-200',
  overdue: 'bg-rose-50 text-rose-700 ring-rose-200',
  not_sent: 'bg-slate-50 text-slate-500 ring-slate-200',
};

/** Statuses where the ball is in the supplier's court, so reminders apply. */
export function awaitingSupplier(status: RequestStatus): boolean {
  return status === 'pending' || status === 'changes_requested';
}

/** `yyyy-mm-dd` for a date in UTC. Deadlines are whole days. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both `yyyy-mm-dd`). Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(from.slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(to.slice(0, 10) + 'T00:00:00Z');
  return Math.round((b - a) / 86_400_000);
}

export function displayStatus(
  status: RequestStatus,
  deadline: string,
  today: string,
  sent = true,
): DisplayStatus {
  if (!sent) return 'not_sent';
  if (awaitingSupplier(status) && daysBetween(today, deadline) < 0) return 'overdue';
  return status;
}

/**
 * Whether today's reminder run should email this request.
 *
 * Before the deadline: on each day listed in `remindDaysBefore` (3 and 1 by default). On the
 * deadline day itself if 0 is listed. After it: every `overdueEveryDays` days, counted from the
 * deadline. Never twice on one day, whatever the schedule says, because the cron can be re-run.
 */
export function reminderDue(input: {
  status: RequestStatus;
  deadline: string;
  today: string;
  remindDaysBefore: number[];
  overdueEveryDays: number;
  lastRemindedDay: string | null;
}): boolean {
  if (!awaitingSupplier(input.status)) return false;
  if (input.lastRemindedDay === input.today) return false;

  const left = daysBetween(input.today, input.deadline);
  if (left >= 0) return input.remindDaysBefore.includes(left);

  if (input.overdueEveryDays <= 0) return false;
  return -left % input.overdueEveryDays === 0;
}

/** Completed out of sent, the "10 out of 15" figure. */
export function compliance(statuses: RequestStatus[]): {
  done: number;
  total: number;
  pct: number;
} {
  const total = statuses.length;
  const done = statuses.filter((s) => s === 'completed').length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** Does this response type need the supplier to have a cover letter to work with? */
export function needsLetter(type: ResponseType): boolean {
  return type === 'sign_letter' || type === 'upload_signed';
}

/** Files larger than this are refused on upload, on both sides. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDay(day: string | null | undefined): string {
  if (!day) return '—';
  const d = new Date(String(day).slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return String(day);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatStamp(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Riyadh',
  });
}
