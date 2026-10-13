import { describe, expect, it } from 'vitest';
import { REQUEST_COLUMNS } from '../exportRequestsXlsx';
import type { LaptopRequest } from '@/types/laptopProcurement';

/** Only the fields the sheet reads; the rest of LaptopRequest is irrelevant here. */
function request(over: Partial<LaptopRequest> = {}): LaptopRequest {
  return {
    id: 1,
    reference_number: 'PLP01633',
    status: 'Procure New',
    request_type: 'Unit',
    pending_with: null,
    created_at: '2026-10-11T16:14:00.000Z',
    updated_at: '2026-10-12T11:46:00.000Z',
    requested_by_name: 'Omeed Qasim',
    requested_by_email: 'oqasim@nesr.com',
    employee_id: '4326',
    computer_for: 'WHM-II ENI',
    country: 'Iraq',
    department: 'Coiled Tubing',
    company_code: '2765',
    company_name: 'NESR DMCC- Iraq South',
    cost_center: 'C651110101',
    type_of_device: 'Laptop',
    requested_model: 'Dell Latitude 5000 series - Core i5',
    special_requirements: 'Laptop required for WHM-II ENI',
    ...over,
  } as LaptopRequest;
}

const cell = (r: LaptopRequest, name: string) => {
  const col = REQUEST_COLUMNS.find((c) => c.name === name);
  if (!col) throw new Error(`No column named ${name}`);
  return col.of(r);
};

describe('the requests spreadsheet', () => {
  it('carries the department, which the old list view never showed', () => {
    expect(cell(request(), 'Department')).toBe('Coiled Tubing');
  });

  it('writes a blank cell for a missing value, never "null"', () => {
    const blank = request({ department: null, company_name: null, pending_with: null });
    for (const name of ['Department', 'Company Name', 'Pending With']) {
      expect(cell(blank, name)).toBe('');
    }
  });

  it('pulls each identifying column from its own field', () => {
    const r = request();
    expect(cell(r, 'Reference')).toBe('PLP01633');
    expect(cell(r, 'Requester')).toBe('Omeed Qasim');
    expect(cell(r, 'Requester Email')).toBe('oqasim@nesr.com');
    expect(cell(r, 'Cost Center')).toBe('C651110101');
    expect(cell(r, 'Status')).toBe('Procure New');
  });

  it('keeps the replaced device separate from the assigned one', () => {
    // current_* is the device being replaced; assigned_* is the second-hand
    // unit handed over. Collapsing them would misreport the asset record.
    const r = request({
      current_model: 'Latitude 5420',
      serial_no: 'OLD-1',
      assigned_model: 'Latitude 5540',
      assigned_serial_no: 'NEW-9',
    });
    expect(cell(r, 'Existing Model')).toBe('Latitude 5420');
    expect(cell(r, 'Existing Serial No.')).toBe('OLD-1');
    expect(cell(r, 'Assigned Model')).toBe('Latitude 5540');
    expect(cell(r, 'Assigned Serial No.')).toBe('NEW-9');
  });

  it('gives every approver both a decision and a comment column', () => {
    for (const role of ['IT Manager', 'Country Manager', 'IT Director', 'Supply Chain Director']) {
      expect(REQUEST_COLUMNS.some((c) => c.name === `${role} Decision`)).toBe(true);
      expect(REQUEST_COLUMNS.some((c) => c.name === `${role} Comment`)).toBe(true);
    }
  });

  it('names every column exactly once', () => {
    const names = REQUEST_COLUMNS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
