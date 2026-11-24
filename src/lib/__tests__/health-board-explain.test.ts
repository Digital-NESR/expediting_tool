import { describe, expect, it } from 'vitest';
import {
  describeProvenance,
  explainYtd,
  isGap,
  kpiFrontiers,
  provenanceKey,
} from '@/lib/health-board/explain';
import { kpiByCode } from '@/lib/health-board/definitions';
import type { KpiValue } from '@/lib/health-board/calc';

const k = (code: string) => kpiByCode(code)!;

describe('explaining a YTD', () => {
  it('names the months the calculation used', () => {
    expect(explainYtd(k('KPI - OTD'), { January: 1, February: 2, March: 3, July: 4 })).toBe(
      'YTD is the average of 4 months entered (Jan, Feb, Mar, Jul).',
    );
    expect(explainYtd(k('KPI - OTD'), { January: 1, February: 2, March: 3, April: 4 })).toBe(
      'YTD is the average of 4 months entered (Jan–Apr).',
    );
    expect(explainYtd(k('KPI - DSOH'), { January: 151, July: 133 })).toBe(
      'YTD is the latest month with a value: July.',
    );
    expect(explainYtd(k('KPI - InvRecon Acc'), { March: 99, June: 98 })).toBe(
      'YTD is the average of 2 quarters entered (Mar, Jun).',
    );
    expect(explainYtd(k('KPI - FMT - ICPO Transfer out'), { January: -1 })).toBe(
      'YTD is the sum of 1 month (Jan).',
    );
    expect(explainYtd(k('KPI - P&L (M&S)'), { January: 1 })).toMatch(/Finance's year-to-date/);
    expect(explainYtd(k('KPI - OTD'), {})).toBe('No month has a value yet.');
  });
});

describe('gaps versus months not reached yet', () => {
  const v = (kpi: string, period: KpiValue['period'], country = 'Global'): KpiValue =>
    ({ kpi, year: 2026, period, country, value: 1, targetWords: null, category: 'x' }) as KpiValue;

  it('a KPI reaches as far as its latest month for any country', () => {
    const f = kpiFrontiers(
      [v('KPI - OTD', 'July', 'Oman'), v('KPI - OTD', 'March'), v('KPI - OTD', 'Target')],
      2026,
    );
    expect(f['KPI - OTD']).toBe(6);
  });

  it('a blank month up to that point is a gap; after it, not reached yet', () => {
    expect(isGap(k('KPI - OTD'), 'May', 6)).toBe(true);
    expect(isGap(k('KPI - OTD'), 'August', 6)).toBe(false);
    expect(isGap(k('KPI - OTD'), 'May', undefined)).toBe(false);
  });

  it('a quarterly KPI is only missing in quarter-end months', () => {
    expect(isGap(k('KPI - InvRecon Acc'), 'April', 5)).toBe(false);
    expect(isGap(k('KPI - InvRecon Acc'), 'March', 5)).toBe(true);
  });
});

describe('describing where a value came from', () => {
  it('says the file, the date and what it replaced', () => {
    const text = describeProvenance(
      {
        file: 'Correction.csv',
        kind: 'upload',
        by: 'someone@nesr.com',
        at: '2026-11-24T08:50:37Z',
        sharepointModified: null,
        previous: { value: '99.49', changedAt: '2026-11-24T08:50:37Z' },
      },
      'Days',
    );
    expect(text).toBe(
      'Uploaded 24 Nov 2026 by someone@nesr.com (Correction.csv). Replaced 99.49 days on 24 Nov 2026.',
    );
  });

  it('for the initial load, gives the SharePoint edit date', () => {
    expect(
      describeProvenance(
        {
          file: 'export.csv',
          kind: 'initial-load',
          by: 'x',
          at: '2026-11-24T07:27:49Z',
          sharepointModified: '2025-04-16T10:16:46Z',
          previous: null,
        },
        '%',
      ),
    ).toBe(
      'From the initial load (export.csv), 24 Nov 2026. Last edited in SharePoint 16 Apr 2025.',
    );
  });

  it('keys a cell by KPI, period and country', () => {
    expect(provenanceKey('KPI - OTD', 'July', 'Oman')).toBe('KPI - OTD|July|Oman');
  });
});
