import { describe, expect, it } from 'vitest';
import {
  WIP_QUANTITY,
  WIP_SERVICE_ITEM_ID,
  buildWipPayload,
  unitPriceUsd,
  wipName,
} from '@/lib/laptop-procurement/freshservice';
import type { LaptopRequest } from '@/types/laptopProcurement';

/** PLP01633, the request the live test (SR-144437) was built from. */
function request(over: Partial<LaptopRequest> = {}): LaptopRequest {
  return {
    id: 1,
    reference_number: 'PLP01633',
    status: 'Procure New',
    request_type: 'Unit',
    country: 'Iraq',
    requested_by_name: 'Omeed Qasim',
    requested_by_email: 'oqasim@nesr.com',
    computer_for: 'WHM-II ENI',
    company_code: '2765',
    company_name: 'NESR DMCC- Iraq South',
    cost_center: 'C651110101',
    department: 'Coiled Tubing',
    type_of_device: 'Laptop',
    requested_model: 'Dell Latitude 5000 series - Core i5',
    ...over,
  } as LaptopRequest;
}

const EMAIL = 'sbagalkot@nesr.com';

describe('the Freshservice contract', () => {
  it('pins the service item and the quantity', () => {
    // 173 was read from the catalog, not guessed; every laptop request is for
    // exactly one device.
    expect(WIP_SERVICE_ITEM_ID).toBe(173);
    expect(WIP_QUANTITY).toBe(1);
  });

  it('sends the seven bare field names the item actually defines', () => {
    const r = buildWipPayload(request(), EMAIL, 100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Bare names, not cf_-prefixed. A wrong key is accepted by Freshservice and
    // silently left blank, so the exact set is pinned here.
    expect(Object.keys(r.payload.custom_fields).sort()).toEqual([
      'company_code',
      'cost_center',
      'country',
      'model',
      'name',
      'quantity',
      'total_value_usd',
    ]);
  });

  it('reproduces the payload that SR-144437 accepted', () => {
    const r = buildWipPayload(request(), EMAIL, 100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toEqual({
      email: EMAIL,
      custom_fields: {
        country: 'Iraq',
        company_code: '2765',
        cost_center: 'C651110101',
        name: 'Laptop for WHM-II ENI — PLP01633',
        model: 'Dell Latitude 5000 series - Core i5',
        quantity: 1,
        total_value_usd: 100,
      },
    });
  });
});

describe('the WIP name', () => {
  it('leads with the device and ends with the reference', () => {
    expect(wipName(request())).toBe('Laptop for WHM-II ENI — PLP01633');
  });

  it('falls back to the requester when nobody is named', () => {
    expect(wipName(request({ computer_for: null }))).toBe('Laptop for Omeed Qasim — PLP01633');
  });

  it('falls back to the email when there is no name either', () => {
    expect(wipName(request({ computer_for: null, requested_by_name: null }))).toBe(
      'Laptop for oqasim@nesr.com — PLP01633',
    );
  });

  it('never produces a dangling "for"', () => {
    const r = request({ computer_for: '   ', requested_by_name: '  ', type_of_device: null });
    expect(wipName(r)).toBe('Device for oqasim@nesr.com — PLP01633');
  });

  it('always carries the reference number', () => {
    for (const over of [{}, { computer_for: null }, { type_of_device: null }]) {
      expect(wipName(request(over))).toContain('PLP01633');
    }
  });
});

describe('refusing to send a partial WIP', () => {
  it('refuses a request with no cost center', () => {
    const r = buildWipPayload(request({ cost_center: null }), EMAIL, 100);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.missing).toEqual(['cost center']);
  });

  it('refuses when there is no price', () => {
    // 'Other (Exceptional case only)' and country 'Other' will both land here
    // once the real sheet replaces the placeholder.
    const r = buildWipPayload(request(), EMAIL, null);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.missing).toEqual(['total value (USD)']);
  });

  it('treats a zero price as missing, not as free', () => {
    expect(buildWipPayload(request(), EMAIL, 0).ok).toBe(false);
    expect(buildWipPayload(request(), EMAIL, -5).ok).toBe(false);
    expect(buildWipPayload(request(), EMAIL, NaN).ok).toBe(false);
  });

  it('lists every missing field at once, not just the first', () => {
    const r = buildWipPayload(
      request({ country: null, company_code: null, requested_model: '  ' }),
      '',
      null,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.missing).toEqual([
      'requester email',
      'country',
      'company code',
      'model',
      'total value (USD)',
    ]);
  });

  it('trims rather than sending padded values', () => {
    const r = buildWipPayload(request({ cost_center: '  C651110101  ' }), EMAIL, 100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.custom_fields.cost_center).toBe('C651110101');
  });
});

describe('the price placeholder', () => {
  it('prices anything with a model and a country, for now', () => {
    expect(unitPriceUsd('Dell Pro 14 Plus', 'Iraq')).toBe(100);
  });

  it('returns null rather than guessing when either side is blank', () => {
    expect(unitPriceUsd('', 'Iraq')).toBeNull();
    expect(unitPriceUsd('Dell Pro 14 Plus', '   ')).toBeNull();
  });
});

describe('keeping the country IT Manager in the loop', () => {
  it('carries the CC addresses through', () => {
    const r = buildWipPayload(request(), EMAIL, 100, ['itm.iraq@nesr.com', 'itm2.iraq@nesr.com']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.cc_emails).toEqual(['itm.iraq@nesr.com', 'itm2.iraq@nesr.com']);
  });

  it('omits the field rather than sending an empty list', () => {
    // An empty recipient is what made the Outlook node reject a whole message
    // on the S&S side; the safe shape is for the key not to be there at all.
    const r = buildWipPayload(request(), EMAIL, 100, []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect('cc_emails' in r.payload).toBe(false);
  });

  it('drops blanks and nulls from an unfilled matrix slot', () => {
    // laptop_approver_matrix has three IT Manager slots per country and most
    // countries fill one, so two nulls is the normal case, not the edge.
    const r = buildWipPayload(request(), EMAIL, 100, ['itm.iraq@nesr.com', null, undefined, '  ']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.cc_emails).toEqual(['itm.iraq@nesr.com']);
  });

  it('never CCs the requester, who is already on the ticket', () => {
    const r = buildWipPayload(request(), EMAIL, 100, ['SBagalkot@nesr.com', 'itm@nesr.com']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.cc_emails).toEqual(['itm@nesr.com']);
  });

  it('de-duplicates an IT Manager named in two slots', () => {
    const r = buildWipPayload(request(), EMAIL, 100, ['itm@nesr.com', 'ITM@nesr.com']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.cc_emails).toEqual(['itm@nesr.com']);
  });
});
