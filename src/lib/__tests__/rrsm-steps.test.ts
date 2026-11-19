import { describe, expect, it } from 'vitest';
import {
  describeSteps,
  fastForward,
  openingStage,
  stageAfterBuyerDecision,
  stageAfterSupplier,
} from '../rrsm/steps';
import { visibleNav } from '../rrsm/nav';

const both = { supplier: true, ops: true };
const supplierOnly = { supplier: true, ops: false };
const opsOnly = { supplier: false, ops: true };
const none = { supplier: false, ops: false };

describe('openingStage', () => {
  it('starts each line at the first step the country runs', () => {
    expect(openingStage(both)).toBe('awaiting_supplier');
    expect(openingStage(supplierOnly)).toBe('awaiting_supplier');
    expect(openingStage(opsOnly)).toBe('submitted');
    expect(openingStage(none)).toBe('validated');
  });
});

describe('stageAfterSupplier', () => {
  it('skips Ops when the country does not validate', () => {
    expect(stageAfterSupplier(both, false)).toBe('submitted');
    expect(stageAfterSupplier(supplierOnly, false)).toBe('validated');
  });
  it('always holds a proposed change for the buyer', () => {
    expect(stageAfterSupplier(supplierOnly, true)).toBe('submitted');
  });
});

describe('stageAfterBuyerDecision', () => {
  it('validates the line only when Ops are not a step', () => {
    expect(stageAfterBuyerDecision(both)).toBeNull();
    expect(stageAfterBuyerDecision(supplierOnly)).toBe('validated');
  });
});

describe('fastForward', () => {
  it('moves lines past a step switched off mid-cycle, never backwards', () => {
    expect(fastForward(opsOnly, 'awaiting_supplier', false)).toBe('submitted');
    expect(fastForward(none, 'awaiting_supplier', false)).toBe('validated');
    expect(fastForward(supplierOnly, 'submitted', false)).toBe('validated');
    expect(fastForward(supplierOnly, 'submitted', true)).toBeNull();
    expect(fastForward(both, 'awaiting_supplier', false)).toBeNull();
    expect(fastForward(none, 'closed', false)).toBeNull();
    expect(fastForward(none, 'returned', false)).toBeNull();
  });
});

describe('visibleNav with steps', () => {
  const ids = (steps: { supplier: boolean; ops: boolean }) =>
    visibleNav({ canBuy: true, canValidate: true }, steps).map((i) => i.id);
  it('hides the page of a step the country does not run', () => {
    expect(ids(both)).toEqual(expect.arrayContaining(['suppliers', 'validation']));
    expect(ids(opsOnly)).not.toContain('suppliers');
    expect(ids(supplierOnly)).not.toContain('validation');
    expect(ids(none)).toEqual(expect.not.arrayContaining(['suppliers', 'validation']));
  });
});

describe('describeSteps', () => {
  it('says the flow in one line', () => {
    expect(describeSteps(none)).toBe('Straight to PR & PO');
    expect(describeSteps(opsOnly)).toBe('Ops validation → PR & PO');
  });
});
