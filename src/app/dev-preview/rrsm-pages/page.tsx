/*
 * The RRSM dashboard, service register and cycle history, signed out, for development only.
 *
 * The real pages are behind SSO and a per-country grant, and no country is live yet, so the data
 * here is a fixture shaped on the Kuwait workbook. `?page=dashboard|register|history|empty`
 * picks the screen; `empty` is the dashboard for a country with no cycle open.
 * `?role=ops|buyer` renders as somebody holding only that role, to check what the sidebar hides.
 *
 * Dev-only twice over: `notFound()` removes it from a production build, and the `/dev-preview`
 * entry in src/proxy.ts is only added outside production.
 */
import { notFound } from 'next/navigation';
import type { HistoryRow, RegisterRow, RrsmOverview, RrsmScope } from '@/app/actions/rrsm/overview';
import type { RegisterEditorData } from '@/app/actions/rrsm/register';
import RrsmDashboardClient from '@/app/rrsm/RrsmDashboardClient';
import RrsmReportsClient from '@/app/rrsm/RrsmReportsClient';
import RrsmRegisterClient from '@/app/rrsm/RrsmRegisterClient';
import { PREVIEW_REFS, PREVIEW_REGISTRY, PREVIEW_UNIT_LINKS } from './registry-fixture';

export const dynamic = 'force-dynamic';

const KW = {
  code: 'KW',
  name: 'Kuwait',
  currency: 'KWD',
  flag: '🇰🇼',
  live: true,
  supplierValidation: true,
  opsValidation: true,
  rentalsEnabled: true,
  recurrentEnabled: false,
  recurrentReminders: false,
};
const AE = {
  code: 'AE',
  name: 'United Arab Emirates (UAE)',
  currency: 'AED',
  flag: '🇦🇪',
  live: true,
  supplierValidation: true,
  opsValidation: true,
  rentalsEnabled: true,
  recurrentEnabled: false,
  recurrentReminders: false,
};

function scopeFor(role?: string): RrsmScope {
  if (role === 'ops')
    return { country: KW, available: [KW], canBuy: false, canValidate: true, isAdmin: false };
  if (role === 'buyer')
    return { country: KW, available: [KW], canBuy: true, canValidate: false, isAdmin: false };
  return { country: KW, available: [KW, AE], canBuy: true, canValidate: true, isAdmin: true };
}

const OVERVIEW: RrsmOverview = {
  cycle: {
    id: 3,
    period: '2026-11-01',
    opensOn: '2026-10-26',
    closesOn: '2026-11-25',
    status: 'open',
    lines: 48,
    value: 18_240.5,
    byStage: { awaiting_supplier: 9, submitted: 14, returned: 2, validated: 11, closed: 12 },
    awaitingPo: 7,
    sap: {
      ok: true,
      total: 114,
      released: 113,
      underRelease: 1,
      notInSap: 0,
      serviceEntered: 2,
      loadedAt: '2026-11-18T11:17',
      waiting: [
        {
          po: '5150009399',
          supplier: 'Suhail Al Mazroui Transportation &',
          value: 500000,
          currency: 'AED',
          createdOn: '2026-11-13',
          waitingWith: null,
          daysWaiting: null,
        },
      ],
    },
  },
  suppliers: { inCycle: 6, notInvited: 1, waiting: 2, submitted: 3 },
  register: { activeLines: 51, suppliers: 7, offHire: 4 },
};

const NO_CYCLE: RrsmOverview = {
  cycle: null,
  suppliers: { inCycle: 0, notInvited: 0, waiting: 0, submitted: 0 },
  register: { activeLines: 51, suppliers: 7, offHire: 4 },
};

function reg(partial: Partial<RegisterRow> & Pick<RegisterRow, 'id' | 'description'>): RegisterRow {
  return {
    supplierCode: '100482',
    registryCode: '',
    supplierName: 'Al Mulla Rental Co.',
    category: 'Transportation',
    assetRef: '',
    segment: 'CPVEN_CT',
    costCenter: 'C541110101',
    costCenterName: '1154- CT-CPVEN -KWT',
    serviceNumber: '310000000011',
    operatingModel: 'segment_based',
    uom: 'month',
    rate: 250,
    paymentTerms: 'NT30',
    startsOn: '2025-01-01',
    contractEndsOn: '',
    offHireDate: '',
    ownerEmail: '',
    requesterEmail: '',
    entity: '',
    purchasingGroup: '',
    plant: '',
    active: true,
    cycles: 3,
    ...partial,
  };
}

const EDITOR: RegisterEditorData = {
  canEdit: true,
  uoms: [
    { code: 'month', label: 'Month' },
    { code: 'day', label: 'Day' },
    { code: 'hour', label: 'Hour' },
    { code: 'headcount', label: 'Headcount' },
    { code: 'unit', label: 'Unit' },
  ],
  suppliers: [
    {
      code: '100482',
      name: 'Al Mulla Rental Co.',
      contactEmails: ['fleet@almulla.example'],
      active: true,
      linesHere: 4,
    },
    {
      code: '100911',
      name: 'Gulf Guarding Services',
      contactEmails: [],
      active: true,
      linesHere: 1,
    },
    {
      code: '100733',
      name: 'Kuwait Real Estate Holdings',
      contactEmails: ['leasing@kreh.example', 'ap@kreh.example'],
      active: true,
      linesHere: 1,
    },
    {
      code: '200150',
      name: 'Emirates Plant Hire',
      contactEmails: ['ops@eph.example'],
      active: true,
      linesHere: 0,
    },
  ],
};

/* Contract dates are relative to today so the "in N days" labels stay meaningful whenever this
   preview is opened. */
function inDays(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const REGISTER: RegisterRow[] = [
  reg({
    id: 1,
    description: 'CT-TOYOTA PRADO -23X70474',
    assetRef: '23X70474',
    contractEndsOn: inDays(12),
  }),
  reg({
    id: 2,
    description: 'CT-NISSAN PATROL -41K22018',
    assetRef: '41K22018',
    rate: 310,
    contractEndsOn: inDays(-4),
  }),
  reg({
    id: 3,
    description: 'NPS-TOYOTA HILUX -77A10233',
    assetRef: '77A10233',
    segment: 'NPS_CMT',
    rate: 180,
    contractEndsOn: inDays(64),
  }),
  reg({
    id: 4,
    description: 'Security guard, Ahmadi yard',
    supplierCode: '100911',
    supplierName: 'Gulf Guarding Services',
    serviceNumber: '330000000004',
    operatingModel: 'shared_support',
    uom: 'headcount',
    rate: 420,
    contractEndsOn: inDays(220),
  }),
  reg({
    id: 5,
    description: 'Staff house, Mangaf block 4',
    supplierCode: '100733',
    supplierName: 'Kuwait Real Estate Holdings',
    serviceNumber: '330000000001',
    operatingModel: 'shared_support',
    rate: 1_450,
  }),
  reg({
    id: 6,
    description: 'CT-MITSUBISHI CANTER -12B99001',
    assetRef: '12B99001',
    offHireDate: '2026-08-31',
    contractEndsOn: '2026-12-31',
  }),
  /* Loaded but never in a cycle, so the editor offers Delete; and no rate agreed yet. */
  reg({
    id: 7,
    description: 'Crane 50T, Mussafah yard',
    supplierCode: '200150',
    supplierName: 'Emirates Plant Hire',
    category: 'Equipment Rental',
    costCenter: 'TBC',
    serviceNumber: '',
    rate: null,
    uom: 'day',
    cycles: 0,
  }),
];

const HISTORY: HistoryRow[] = [
  {
    id: 3,
    period: '2026-11-01',
    opensOn: '2026-10-26',
    closesOn: '2026-11-25',
    status: 'open',
    closedAt: '',
    lines: 48,
    closedLines: 12,
    value: 18_240.5,
    suppliers: 6,
    withPo: 23,
  },
  {
    id: 2,
    period: '2026-10-01',
    opensOn: '2026-09-26',
    closesOn: '2026-10-25',
    status: 'closed',
    closedAt: '2026-10-29',
    lines: 47,
    closedLines: 47,
    value: 17_905,
    suppliers: 6,
    withPo: 47,
  },
  {
    id: 1,
    period: '2026-09-01',
    opensOn: '2026-08-26',
    closesOn: '2026-09-25',
    status: 'closed',
    closedAt: '2026-09-30',
    lines: 45,
    closedLines: 45,
    value: 17_120.75,
    suppliers: 5,
    withPo: 45,
  },
];

export default async function RrsmPagesPreview({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; role?: string; steps?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const sp = searchParams ? await searchParams : {};
  const base = scopeFor(sp.role);
  /* ?steps=supplier|ops|none shows a country that runs only that step, or neither. */
  const steps =
    sp.steps === 'none'
      ? { supplierValidation: false, opsValidation: false }
      : sp.steps === 'supplier'
        ? { supplierValidation: true, opsValidation: false }
        : sp.steps === 'ops'
          ? {
              supplierValidation: false,
              opsValidation: true,
              rentalsEnabled: true,
              recurrentEnabled: false,
              recurrentReminders: false,
            }
          : null;
  const scope: RrsmScope =
    steps && base.country ? { ...base, country: { ...base.country, ...steps } } : base;

  switch (sp.page) {
    case 'register':
      return (
        <RrsmRegisterClient
          scope={scope}
          rows={REGISTER.map((r) => ({ ...r, registryCode: PREVIEW_UNIT_LINKS[r.id] ?? '' }))}
          /* Ops read the register; buyers and admins edit it. */
          editor={{ ...EDITOR, canEdit: scope.canBuy }}
          registry={{ ok: true, items: PREVIEW_REGISTRY }}
          previewRefs={PREVIEW_REFS}
          preview
        />
      );
    case 'register-empty':
      return (
        <RrsmRegisterClient
          scope={scope}
          rows={[]}
          editor={EDITOR}
          registry={{ ok: true, items: [] }}
          preview
        />
      );
    case 'reports':
      /* The sample register as a month's lines: same units, so both groupings have content. */
      return (
        <RrsmReportsClient
          scope={scope}
          history={HISTORY}
          report={{
            sources: [
              { key: '3', label: 'November 2026' },
              { key: '2', label: 'October 2026' },
              { key: 'register', label: 'On hire now (register)' },
            ],
            source: '3',
            units: REGISTER.map((r, i) => ({
              supplierCode: r.supplierCode,
              supplierName: r.supplierName,
              category: r.category || 'Uncategorised',
              description: r.description,
              assetRef: r.assetRef,
              segment: r.segment,
              costCenter: r.costCenter,
              uom: r.uom,
              qty: 1,
              rate: r.rate,
              value: r.rate ?? 0,
              stage: (['submitted', 'validated', 'closed'] as const)[i % 3],
              onHire: !r.offHireDate,
            })),
          }}
        />
      );
    case 'empty':
      return <RrsmDashboardClient scope={scope} overview={NO_CYCLE} />;
    default:
      return <RrsmDashboardClient scope={scope} overview={OVERVIEW} />;
  }
}
