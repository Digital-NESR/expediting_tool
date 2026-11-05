import { describe, expect, it } from 'vitest';
import {
  EXCEPTIONAL_MODEL,
  EXCEPTIONAL_UNIT_PRICE_USD,
  WIP_QUANTITY,
  WIP_SERVICE_ITEM_ID,
  WIP_UNKNOWN,
  buildWipPayload,
  buildWipProblemPayload,
  fixedUnitPriceUsd,
  wipBuildError,
  wipName,
} from '@/lib/laptop-procurement/freshservice';
import { toUnitPrice } from '@/lib/laptop-procurement/prices';
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

describe('prices that are rules rather than data', () => {
  it('leaves an ordinary model to the price table', () => {
    // null is not "free" and not "zero" - it means no rule applies, so ask
    // laptop_device_prices. Getting this wrong would let a rule silently
    // override a figure an admin keyed in.
    expect(fixedUnitPriceUsd('Dell Pro 14 Plus')).toBeNull();
    expect(fixedUnitPriceUsd('Dell Latitude 5000 series - Core i5')).toBeNull();
  });

  it('leaves a blank model to the table too', () => {
    expect(fixedUnitPriceUsd('')).toBeNull();
    expect(fixedUnitPriceUsd('   ')).toBeNull();
  });
});

describe('reading a price back out of the database', () => {
  it('turns the NUMERIC string the driver returns into a number', () => {
    // The real shape: NUMERIC(12,2) with no pg type parser registered. Left as
    // a string it would reach Freshservice quoted, as "450.00".
    expect(toUnitPrice('450.00')).toBe(450);
    expect(toUnitPrice('1200.50')).toBe(1200.5);
  });

  it('passes a real number through', () => {
    expect(toUnitPrice(450)).toBe(450);
  });

  it('treats an absent, zero or negative price as unpriced', () => {
    // Zero is rejected by the table's CHECK as well, but a WIP reading $0
    // claims the device was free, so it is refused on the way out too.
    for (const v of [null, undefined, '', '0', 0, -5, 'abc', NaN]) {
      expect(toUnitPrice(v)).toBeNull();
    }
  });
});

describe('an exceptional device', () => {
  it('is worth a nominal dollar, and no admin has to key it', () => {
    // Priced by rule rather than by row: nobody knows what the device is until
    // the request exists, so there is nothing to put on the cost sheet.
    expect(fixedUnitPriceUsd(EXCEPTIONAL_MODEL)).toBe(1);
  });

  it('is not zero, which would read as free', () => {
    expect(EXCEPTIONAL_UNIT_PRICE_USD).toBe(1);
    expect(EXCEPTIONAL_UNIT_PRICE_USD).not.toBe(0);
  });

  it('gets a WIP rather than being refused', () => {
    // Before the dollar rule this was the case that could not raise a WIP at
    // all, because the Freshservice field is a mandatory decimal.
    const r = request({ requested_model: EXCEPTIONAL_MODEL });
    const built = buildWipPayload(r, EMAIL, fixedUnitPriceUsd(EXCEPTIONAL_MODEL));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload.custom_fields.total_value_usd).toBe(1);
    expect(built.payload.custom_fields.model).toBe(EXCEPTIONAL_MODEL);
  });

  it('is matched exactly, not by looking for the word "other"', () => {
    // A real catalogued model should never fall through to a dollar.
    expect(fixedUnitPriceUsd('Other')).toBeNull();
    expect(fixedUnitPriceUsd('Dell Latitude 5000 series - Core i5')).toBeNull();
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

describe('alerting when the WIP never reached Freshservice', () => {
  /* The real case: a request fully approved without the IT Manager ever
     specifying a model, which is how PLP01694 failed. The workflow's own
     failure email cannot fire for this — Freshservice was never called — so
     this payload is the only thing that reaches a person. */
  const NO_MODEL = wipBuildError(['model', 'total value (USD)']);

  it('carries the reason, which is what makes the email worth reading', () => {
    const p = buildWipProblemPayload(request({ requested_model: null }), NO_MODEL, EMAIL);
    expect(p.problem).toBe(NO_MODEL);
    expect(p.problem).toContain('missing: model');
  });

  it('mirrors the real payload field names so one email template renders both', () => {
    const p = buildWipProblemPayload(request(), NO_MODEL, EMAIL);
    const real = buildWipPayload(request(), EMAIL, 100);
    expect(real.ok).toBe(true);
    if (!real.ok) return;
    expect(Object.keys(p.custom_fields).sort()).toEqual(
      Object.keys(real.payload.custom_fields).sort(),
    );
  });

  it('marks what was missing rather than leaving it blank', () => {
    // A blank cell reads as a rendering fault; a dash reads as "this was absent",
    // which is the whole point of the message.
    const p = buildWipProblemPayload(
      request({ requested_model: null, cost_center: '  ' }),
      NO_MODEL,
      EMAIL,
      [],
      null,
    );
    expect(p.custom_fields.model).toBe(WIP_UNKNOWN);
    expect(p.custom_fields.cost_center).toBe(WIP_UNKNOWN);
    expect(p.custom_fields.total_value_usd).toBe(WIP_UNKNOWN);
  });

  it('shows a price it does know', () => {
    const p = buildWipProblemPayload(request(), NO_MODEL, EMAIL, [], 100);
    expect(p.custom_fields.total_value_usd).toBe(100);
  });

  it('still identifies the request when every field is missing', () => {
    // Whatever else is absent, the reference number has to survive — it is the
    // only way the reader finds the request this is about.
    const p = buildWipProblemPayload(
      request({ country: null, company_code: null, cost_center: null, requested_model: null }),
      NO_MODEL,
      EMAIL,
    );
    expect(String(p.custom_fields.name)).toContain('PLP01633');
  });

  it('sends an empty recipient when there is no IT Manager, for the workflow to fall back on', () => {
    // The one failure with nobody to address: the workflow substitutes the
    // standing mailbox, so it is not silently dropped.
    const p = buildWipProblemPayload(request(), 'No active IT Manager is configured.', '');
    expect(p.email).toBe('');
  });

  it('never CCs the owner twice', () => {
    const p = buildWipProblemPayload(request(), NO_MODEL, EMAIL, [
      'SBagalkot@nesr.com',
      'itm@nesr.com',
    ]);
    expect(p.cc_emails).toEqual(['itm@nesr.com']);
  });

  it('omits the CC field rather than sending an empty list', () => {
    const p = buildWipProblemPayload(request(), NO_MODEL, EMAIL, []);
    expect('cc_emails' in p).toBe(false);
  });
});
