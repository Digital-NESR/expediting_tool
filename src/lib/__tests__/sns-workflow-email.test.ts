import { describe, expect, it } from 'vitest';
import { buildWorkflowEmail, type WorkflowEmailInput } from '@/lib/sns-notify';

/**
 * The published mail used to assert "valid for twelve months from today" while
 * showing no date at all. Twelve months is the ceiling a requestor may pick,
 * not the window they get — so the claim and the record disagreed whenever
 * someone chose a shorter one, and nothing in the mail let a reader tell.
 */
function email(over: Partial<WorkflowEmailInput> = {}) {
  return buildWorkflowEmail({
    event: 'published',
    registryId: 'SOL-GLB-0001100315-2609271201',
    classification: 'Sole-Source',
    country: 'Global',
    supplierName: 'McCoy Global FZE',
    supplierId: '0001100315',
    scope: 'Casing Running & Tubing Services',
    expiry: '2027-03-15',
    actor: 'Nader Galal — Category Manager / Supply Chain Director',
    note: '',
    recordUrl: 'https://scagents.nesr.com/sns-registry?record=18',
    ...over,
  });
}

describe('the workflow email and the record expiry', () => {
  it('shows the record own expiry, formatted', () => {
    expect(email().bodyHtml).toContain('15 Mar 2027');
  });

  it('no longer claims twelve months from today', () => {
    expect(email().bodyHtml).not.toContain('twelve months from today');
  });

  it('labels it as the validity of the ID', () => {
    expect(email().bodyHtml).toContain('Valid until');
  });

  it('states the extended date on a renewal', () => {
    const html = email({ event: 'renewed', expiry: '2028-01-04' }).bodyHtml;
    expect(html).toContain('04 Jan 2028');
  });

  it('omits the row on a closure — a retired record has no validity left', () => {
    expect(email({ event: 'closed' }).bodyHtml).not.toContain('Valid until');
  });

  it('omits the row when the record has no expiry yet', () => {
    const html = email({ event: 'submitted', expiry: '' }).bodyHtml;
    expect(html).not.toContain('Valid until');
    expect(html).not.toContain('—</td>');
  });

  it('keeps the other rows in place', () => {
    const html = email().bodyHtml;
    for (const label of [
      'Registry ID',
      'Classification',
      'Country',
      'Supplier',
      'Scope',
      'Actioned by',
    ]) {
      expect(html).toContain(label);
    }
  });
});
