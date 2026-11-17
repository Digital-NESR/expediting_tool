import type { LaptopRequest } from '@/types/laptopProcurement';

/**
 * What the request screen says about the SAP WIP.
 *
 * The three shapes mirror the three meanings the columns carry (see
 * 003_freshservice_wip.sql): raised, tried and failed, or never attempted.
 * `null` is a fourth answer the columns cannot give on their own — the request
 * has not been fully approved, so no WIP was ever due and the section does not
 * belong on screen at all.
 *
 * Kept out of the component so the one thing that matters here — that a failed
 * WIP is never mistaken for an absent one — can be tested without rendering.
 */
export type WipState =
  | { kind: 'raised'; serviceRequestId: number }
  | { kind: 'failed'; reason: string }
  | { kind: 'raising' }
  | { kind: 'disabled' }
  | { kind: 'pending' };

/** The only status that raises a WIP, matching the guard in transitions.ts. */
const WIP_DUE_STATUS = 'Procure New';

/**
 * How long after approval a WIP with no recorded attempt is assumed to be in
 * flight rather than missing.
 *
 * The WIP is raised in `after()`, so it happens *after* the response that
 * re-renders this screen: at the instant the approver's click returns, the
 * request is at Procure New with nothing attempted, and saying "not raised"
 * there is accurate but reads as a fault. It is not one — it resolves a second
 * later.
 *
 * Two minutes is far longer than the work takes (the POST times out at 20s, and
 * n8n at 15s before that) and deliberately so: the cost of waiting too long is
 * a reassuring message for an extra minute, while the cost of being too eager
 * is crying failure over something that was about to succeed.
 */
const RAISING_WINDOW_MS = 2 * 60 * 1000;

type WipColumns = Pick<
  LaptopRequest,
  | 'status'
  | 'updated_at'
  | 'freshservice_request_id'
  | 'freshservice_error'
  | 'freshservice_attempted_at'
>;

/**
 * `enabled` is LAPTOP_FRESHSERVICE_WIP_ENABLED, read on the server and passed
 * down, because the columns alone cannot tell the two apart: a WIP that was
 * never attempted because the integration is switched off leaves exactly the
 * nulls that a WIP still in flight leaves. Without it the screen spends two
 * minutes promising a WIP is on its way and then reports it missing, for every
 * approved request, for as long as the switch is off.
 *
 * Defaults to true so the one fact a caller might not have cannot invent a
 * disabled state: a screen that wrongly says "raising" recovers on its own,
 * while one that wrongly says "switched off" would hide a real failure.
 */
export function wipState(
  request: WipColumns,
  now: number = Date.now(),
  enabled: boolean = true,
): WipState | null {
  /* The id is read before the attempt timestamp, and the timestamp before the
     status, because each earlier fact outranks the later one: a WIP that exists
     is reported however the request has since been edited. */
  const id = toPositiveInt(request.freshservice_request_id);
  if (id != null) return { kind: 'raised', serviceRequestId: id };

  if (request.freshservice_attempted_at) {
    return { kind: 'failed', reason: wipFailureReason(request.freshservice_error) };
  }

  if (request.status !== WIP_DUE_STATUS) return null;

  /* Asked after the id and the attempt, not before: switching the integration
     off does not rewrite history. A request that already carries a WIP still
     reports it, and one that already failed still shows why. */
  if (!enabled) return { kind: 'disabled' };

  return wasJustApproved(request.updated_at, now) ? { kind: 'raising' } : { kind: 'pending' };
}

/**
 * An unparseable or absent timestamp counts as not recent, so the screen falls
 * back to "not raised" — the state that prompts somebody to look, rather than a
 * reassurance that would never resolve.
 */
function wasJustApproved(updatedAt: string | null | undefined, now: number): boolean {
  if (!updatedAt) return false;
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return false;
  // Tolerates a clock a little ahead of the browser's: a future timestamp is
  // still "just now", not "a very long time ago".
  return t <= now + RAISING_WINDOW_MS && now - t < RAISING_WINDOW_MS;
}

/**
 * Freshservice ids are BIGINT, and no pg type parser is registered, so the
 * driver hands them back as strings however the TypeScript type reads. Coerced
 * here rather than trusting the declared `number`.
 */
function toPositiveInt(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

const FALLBACK_REASON = 'The WIP could not be raised, and no reason was recorded.';

/**
 * The stored failure as a sentence someone can act on.
 *
 * What `recordOutcome` writes is machine-shaped — the workflow's answer arrives
 * wrapped, as `n8n returned 502: {"ok":false,"error":"..."}` — and the useful
 * part is the inner `error`. Unwrapped here so the screen shows the reason
 * rather than the envelope, falling back to the raw text whenever it is not
 * that shape, since a reason that reads badly still beats no reason at all.
 */
export function wipFailureReason(raw: string | null | undefined): string {
  const text = (raw ?? '').trim();
  if (!text) return FALLBACK_REASON;

  const embedded = text.match(/\{[\s\S]*\}/);
  if (embedded) {
    try {
      const parsed: unknown = JSON.parse(embedded[0]);
      if (parsed && typeof parsed === 'object') {
        const inner = (parsed as Record<string, unknown>).error;
        if (typeof inner === 'string' && inner.trim()) return inner.trim();
      }
    } catch {
      // Not JSON after all — show what was stored.
    }
  }
  return text;
}
