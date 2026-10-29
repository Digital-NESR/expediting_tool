import { describe, expect, it } from 'vitest';
import { extractServiceRequestId } from '@/lib/laptop-procurement/wip';

/**
 * What the app accepts back from the WIP workflow.
 *
 * The Respond to Webhook node can be wired to return the Freshservice reply
 * whole, or just the id, or an object the workflow assembled — so the id is
 * looked for rather than read from one fixed path. Being wrong here means a
 * WIP that was actually created gets recorded as failed, and the next run
 * raises a second one.
 */
describe('finding the service request id in the workflow response', () => {
  it('reads it from the Freshservice reply passed straight through', () => {
    // The real shape, from SR-144437.
    const body = {
      service_request: {
        id: 144437,
        subject: 'Request for Sakina Bagalkot : WIP Creation Request',
      },
    };
    expect(extractServiceRequestId(body)).toBe(144437);
  });

  it('reads a flat id', () => {
    expect(extractServiceRequestId({ id: 144437 })).toBe(144437);
  });

  it('reads the snake and camel spellings a Set node might produce', () => {
    expect(extractServiceRequestId({ service_request_id: 144437 })).toBe(144437);
    expect(extractServiceRequestId({ serviceRequestId: 144437 })).toBe(144437);
  });

  it('reads an id n8n stringified', () => {
    expect(extractServiceRequestId({ id: '144437' })).toBe(144437);
  });

  it('reads the first item when n8n wraps the response in an array', () => {
    expect(extractServiceRequestId([{ service_request: { id: 144437 } }])).toBe(144437);
  });

  it('returns null rather than inventing one', () => {
    expect(extractServiceRequestId({})).toBeNull();
    expect(extractServiceRequestId(null)).toBeNull();
    expect(extractServiceRequestId('144437')).toBeNull();
    expect(extractServiceRequestId({ ok: false, error: 'Freshservice unreachable' })).toBeNull();
  });

  it('ignores a zero or negative id', () => {
    expect(extractServiceRequestId({ id: 0 })).toBeNull();
    expect(extractServiceRequestId({ id: -1 })).toBeNull();
  });

  it('ignores a non-integer', () => {
    expect(extractServiceRequestId({ id: 1.5 })).toBeNull();
    expect(extractServiceRequestId({ id: 'SR-144437' })).toBeNull();
  });

  it('survives a self-referencing object without hanging', () => {
    const loop: Record<string, unknown> = { nested: {} };
    (loop.nested as Record<string, unknown>).back = loop;
    expect(extractServiceRequestId(loop)).toBeNull();
  });
});
