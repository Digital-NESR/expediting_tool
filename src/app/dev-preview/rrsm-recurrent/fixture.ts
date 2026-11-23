/* Fixture board for the Recurrent services previews. Dev-only. */
import type { RecurrentBoard, RecurrentRow } from '@/app/actions/rrsm/recurrent';
import { EMPTY_SAP } from '@/lib/rrsm/sap';

const HQ = {
  code: 'HQ',
  name: 'HQ Dubai',
  currency: 'AED',
  flag: null,
  live: true,
  supplierValidation: true,
  opsValidation: true,
  rentalsEnabled: false,
  recurrentEnabled: true,
  recurrentReminders: false,
};

function row(p: Partial<RecurrentRow> & Pick<RecurrentRow, 'id' | 'serviceName'>): RecurrentRow {
  return {
    description: p.serviceName,
    storedStatus: 'active',
    status: 'active',
    renewalPeriod: 'yearly',
    poRenewalPeriod: 'Yearly',
    department: 'IT',
    contractExpiry: '2027-04-30',
    daysLeft: 158,
    lastPoNumber: '',
    lastPoValidTill: '',
    supplierCode: '1103450',
    supplierName: 'Freshworks Inc.',
    supplierContactName: 'Ishwarya Baskar',
    supplierContactEmail: 'ishwarya.baskar@freshworks.com',
    requesters: [{ name: 'Riswan Parambath', email: 'rparambath@nesr.com' }],
    buyerName: 'Aswathy Nair',
    buyerEmail: 'anair1@nesr.com',
    approver: '',
    requestType: '',
    annualValue: null,
    currency: 'AED',
    comments: '',
    renewal: null,
    suggestedExpiry: '2028-04-30',
    documents: [],
    canDecide: true,
    ...p,
  } as RecurrentRow;
}

const ROWS: RecurrentRow[] = [
  row({
    id: 1,
    serviceName: 'Website & DNS Management',
    description: 'Website Management, DNS Management and SSL Certificate',
    department: 'Business Development',
    contractExpiry: '2026-12-31',
    daysLeft: 38,
    status: 'due',
    lastPoNumber: '5160001121',
    supplierCode: '1103392',
    supplierName: 'AAA ITE SERVICENTRIX PVT. LTD',
    annualValue: 1488571,
    currency: 'AED',
    suggestedExpiry: '2027-12-31',
  }),
  row({
    id: 2,
    annualValue: 827796,
    currency: 'USD',
    serviceName: 'Nitro PDF',
    contractExpiry: '2025-11-16',
    daysLeft: -372,
    status: 'expired',
    lastPoNumber: '5160000825',
    supplierCode: '1103315',
    supplierName: 'Nitro Software Inc',
    suggestedExpiry: '2026-11-16',
    documents: [{ id: 1, kind: 'contract', fileName: 'Nitro-2025.pdf', uploadedAt: '2025-11-10' }],
  }),
  row({
    id: 3,
    serviceName: 'Zoho Analytics',
    description: 'Reporting Solution',
    contractExpiry: '2026-12-15',
    daysLeft: 22,
    status: 'awaiting_buyer',
    renewal: {
      id: 9,
      dueOn: '2026-12-15',
      decision: 'renew_changes',
      decisionNote: 'Drop from 25 to 15 users; add the Finance workspace.',
      decidedBy: 'rparambath@nesr.com',
      decidedAt: '2026-11-20',
      remindersSent: [90, 60, 30],
    },
    supplierName: 'Zoho Corporation Pte Ltd',
  }),
  row({
    id: 4,
    serviceName: 'Medical Insurance',
    department: 'Finance',
    requesters: [
      { name: 'Tariq Al Balushi', email: 'talbalushi@nesr.com' },
      { name: 'Riswan Parambath', email: 'rparambath@nesr.com' },
    ],
    supplierName: 'Abu Dhabi National Takaful Co',
    supplierCode: '1105483',
    contractExpiry: '2027-03-15',
    daysLeft: 112,
  }),
  row({
    id: 5,
    serviceName: 'Idea Hub',
    storedStatus: 'cancelled',
    status: 'cancelled',
    contractExpiry: '2023-07-10',
    daysLeft: -1232,
    supplierName: 'Technovert Solutions Inc',
    canDecide: false,
  }),
];

export function previewBoard(requester: boolean): RecurrentBoard {
  return {
    country: HQ,
    available: [HQ],
    enabled: true,
    canEdit: !requester,
    canBuy: !requester,
    canValidate: false,
    isAdmin: false,
    isRequester: requester,
    ownOnly: requester,
    rows: requester
      ? ROWS.filter((r) => r.requesters.some((p) => p.email === 'rparambath@nesr.com'))
      : ROWS,
    sap: EMPTY_SAP,
  };
}
