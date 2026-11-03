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
  | { kind: 'pending' };

/** The only status that raises a WIP, matching the guard in transitions.ts. */
const WIP_DUE_STATUS = 'Procure New';

type WipColumns = Pick<
  LaptopRequest,
  'status' | 'freshservice_request_id' | 'freshservice_error' | 'freshservice_attempted_at'
>;

export function wipState(request: WipColumns): WipState | null {
  /* The id is read before the attempt timestamp, and the timestamp before the
     status, because each earlier fact outranks the later one: a WIP that exists
     is reported however the request has since been edited. */
  const id = toPositiveInt(request.freshservice_request_id);
  if (id != null) return { kind: 'raised', serviceRequestId: id };

  if (request.freshservice_attempted_at) {
    return { kind: 'failed', reason: wipFailureReason(request.freshservice_error) };
  }

  return request.status === WIP_DUE_STATUS ? { kind: 'pending' } : null;
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
