import { describe, expect, it } from 'vitest';
import { wipFailureReason, wipState } from '@/app/laptop-procurement/lib/wipState';
import type { LaptopRequest } from '@/types/laptopProcurement';

function request(over: Partial<LaptopRequest> = {}): LaptopRequest {
  return {
    status: 'Procure New',
    freshservice_request_id: null,
    freshservice_error: null,
    freshservice_attempted_at: null,
    ...over,
  } as LaptopRequest;
}

const WHEN = '2026-11-03T09:45:37Z';

describe('what the screen says about the WIP', () => {
  it('reports a raised WIP with its number', () => {
    const s = wipState(
      request({ freshservice_request_id: 145476, freshservice_attempted_at: WHEN }),
    );
    expect(s).toEqual({ kind: 'raised', serviceRequestId: 145476 });
  });

  it('reads the id back as a number when the driver hands it over as a string', () => {
    // freshservice_request_id is BIGINT and no pg type parser is registered, so
    // this is the shape that actually arrives, not an edge case.
    const s = wipState(request({ freshservice_request_id: '145476' as unknown as number }));
    expect(s).toEqual({ kind: 'raised', serviceRequestId: 145476 });
  });

  it('reports a failure when an attempt was made and no id came back', () => {
    const s = wipState(
      request({ freshservice_attempted_at: WHEN, freshservice_error: 'Freshservice unreachable' }),
    );
    expect(s).toEqual({ kind: 'failed', reason: 'Freshservice unreachable' });
  });

  it('never reports a failed WIP as merely pending', () => {
    // The whole point of the section: these two must not look alike, because one
    // needs someone to act and the other does not.
    const failed = wipState(request({ freshservice_attempted_at: WHEN }));
    const pending = wipState(request());
    expect(failed?.kind).toBe('failed');
    expect(pending?.kind).toBe('pending');
  });

  it('reports pending once a request is fully approved but nothing has been tried', () => {
    expect(wipState(request())).toEqual({ kind: 'pending' });
  });

  it('says nothing at all before the request is fully approved', () => {
    for (const status of ['Pending IT Manager', 'Pending Country Manager', 'Rejected', 'Draft']) {
      expect(wipState(request({ status: status as LaptopRequest['status'] }))).toBeNull();
    }
  });

  it('still reports a raised WIP on a request that has since moved status', () => {
    // A WIP that exists is a fact about SAP, not about the request's current
    // state, so it keeps being reported.
    const s = wipState(
      request({ status: 'Cancelled' as LaptopRequest['status'], freshservice_request_id: 145476 }),
    );
    expect(s).toEqual({ kind: 'raised', serviceRequestId: 145476 });
  });

  it('still reports a failure on a request that has since moved status', () => {
    const s = wipState(
      request({ status: 'Cancelled' as LaptopRequest['status'], freshservice_attempted_at: WHEN }),
    );
    expect(s?.kind).toBe('failed');
  });

  it('ignores a zero or negative id rather than linking to a ticket that is not there', () => {
    expect(wipState(request({ freshservice_request_id: 0 }))?.kind).toBe('pending');
    expect(wipState(request({ freshservice_request_id: -1 }))?.kind).toBe('pending');
  });
});

describe('the failure reason', () => {
  it('unwraps the workflow answer rather than showing the envelope', () => {
    // Exactly what recordOutcome stores when n8n answers 502.
    const raw =
      'n8n returned 502: {"ok":false,"error":"Forbidden - perhaps check your credentials?"}';
    expect(wipFailureReason(raw)).toBe('Forbidden - perhaps check your credentials?');
  });

  it('keeps a plain sentence as it is', () => {
    const raw = 'No active IT Manager is configured for Iraq, so the WIP has no owner.';
    expect(wipFailureReason(raw)).toBe(raw);
  });

  it('keeps the raw text when the body is not the shape it expected', () => {
    const raw = 'n8n returned 500: {"message":"boom"}';
    expect(wipFailureReason(raw)).toBe(raw);
  });

  it('keeps the raw text when the braces are not valid JSON', () => {
    const raw = 'Could not reach the WIP workflow: fetch failed {truncated';
    expect(wipFailureReason(raw)).toBe(raw);
  });

  it('says something rather than nothing when no reason was stored', () => {
    for (const raw of [null, undefined, '', '   ']) {
      expect(wipFailureReason(raw)).toMatch(/no reason was recorded/i);
    }
  });
});
