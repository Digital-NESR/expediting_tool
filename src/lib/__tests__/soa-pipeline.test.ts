import { describe, expect, it } from 'vitest';
import { pipelineStage } from '@/app/soa-consolidation/lib';
import type { Vendor } from '@/app/soa-consolidation/types';

/**
 * The workflow pipeline is the first thing on the dashboard and is read as a summary of where a
 * country stands. It used to be a lookup from `country_cycles.status` through a table that mapped
 * `in_progress` to step 4 — so a country with no vendors, no requests and no responses rendered
 * PO Upload, Scope and Requests all ticked with Responses under way.
 *
 * The case that caught it is the first test below, and it is the one that must never come back.
 */

function vendor(status: Vendor['status']): Vendor {
  return {
    id: '1',
    name: 'A Vendor',
    no: '0001',
    openPO: 1_000_000,
    status,
    reqDate: '—',
    remDate: null,
    respDate: null,
    requestedAt: null,
    remindedAt: null,
    respondedAt: null,
    currency: 'USD',
    invCount: 0,
    contactEmails: [],
    submissions: [],
  };
}

const stage = (
  vendors: Vendor[],
  { extract = true, handedOff = false, consolidating = false } = {},
) => pipelineStage(vendors, extract, handedOff, consolidating);

describe('pipelineStage', () => {
  it('claims nothing for a cycle whose snapshot has not been taken', () => {
    // The exact state that rendered three ticks and an active Responses step.
    const s = stage([], { extract: false });
    expect(s.extractTaken).toBe(false);
    expect(s.scopeDone).toBe(false);
    expect(s.requestsDone).toBe(false);
    expect(s.responsesDone).toBe(false);
    expect(s.handoffDone).toBe(false);
  });

  it('ticks PO Upload once the snapshot exists, and nothing beyond it', () => {
    const s = stage([]);
    expect(s.extractTaken).toBe(true);
    expect(s.scopeDone).toBe(false);
    expect(s.requestsDone).toBe(false);
  });

  it('ticks Scope only when the country actually has vendors', () => {
    expect(stage([]).scopeDone).toBe(false);
    expect(stage([vendor('scoped')]).scopeDone).toBe(true);
  });

  it('leaves Requests unfinished while any vendor has not been written to', () => {
    // A partial send is not a sent batch, which is the honest reading.
    expect(stage([vendor('requested'), vendor('scoped')]).requestsDone).toBe(false);
    expect(stage([vendor('requested'), vendor('reminded')]).requestsDone).toBe(true);
  });

  it('finishes Responses only when every vendor has settled', () => {
    expect(stage([vendor('received'), vendor('requested')]).responsesDone).toBe(false);
    // A non-responder is settled: the chase ended, just not with a statement.
    expect(stage([vendor('received'), vendor('non_responder')]).responsesDone).toBe(true);
  });

  it('never reports Responses done for a country with no vendors', () => {
    // Vacuously "all zero vendors have settled" would tick a step nobody worked.
    expect(stage([]).responsesDone).toBe(false);
  });

  it('counts vendors by what is actually outstanding', () => {
    const s = stage([
      vendor('scoped'),
      vendor('requested'),
      vendor('reminded'),
      vendor('received'),
      vendor('non_responder'),
    ]);
    expect(s.notYetRequested).toBe(1);
    expect(s.awaitingCount).toBe(2);
    expect(s.settledCount).toBe(2);
  });

  it('ticks Consolidate while consolidating, and Handoff only once handed off', () => {
    const consolidating = stage([vendor('received')], { consolidating: true });
    expect(consolidating.consolidateDone).toBe(true);
    expect(consolidating.handoffDone).toBe(false);

    const done = stage([vendor('received')], { handedOff: true });
    expect(done.consolidateDone).toBe(true);
    expect(done.handoffDone).toBe(true);
  });
});
