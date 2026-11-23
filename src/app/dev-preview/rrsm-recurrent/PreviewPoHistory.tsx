'use client';

/*
 * Sample SAP PO history for the recurrent dev previews, run through the real matching rules, so
 * the PO history panel can be seen without a session or Materials DB.
 */
import { PoHistoryLoader } from '@/app/rrsm/PoHistoryPanel';
import { matchServicePos, rollupByYear, type PoLineIn } from '@/lib/rrsm/po-history';

const L = (
  poNumber: string,
  created: string,
  description: string,
  value: number,
  item = '10',
  currency = 'USD',
): PoLineIn => ({
  poNumber,
  item,
  description,
  value,
  currency,
  created,
  releaseState: 'Released',
});

const SAMPLE: PoLineIn[] = [
  L('5160000590', '2022-10-02', 'Website+Infrastructure Service Dec22-Feb23', 26400),
  L('5160000772', '2023-09-27', 'Website+Infrastructure Service Dec23-Feb24', 26400),
  L('5160001121', '2024-07-05', 'Website+Infrastructure Service Jun-Aug24', 30360),
  L('5160001499', '2025-06-12', 'Website+Infrastructure Service Mar-May26', 33000),
  L('5160001924', '2026-06-18', 'Website+InfrastructureService Mar-May 27', 26400),
  L('5160001924', '2026-06-18', 'Mobile app maintenance Q1', 4500, '20'),
  L('5160001924', '2026-06-18', 'Intranet redesign phase 2', 7800, '30'),
];

async function load() {
  await new Promise((r) => setTimeout(r, 300));
  const pos = matchServicePos(
    'Website & DNS Management Website Management, DNS Management and SSL Certificate',
    'AAA ITE SERVICENTRIX PVT. LTD',
    SAMPLE,
    ['5160001121'],
  );
  return { ok: true, pos, years: rollupByYear(pos) };
}

export default function PreviewPoHistory({ children }: { children: React.ReactNode }) {
  return <PoHistoryLoader.Provider value={load}>{children}</PoHistoryLoader.Provider>;
}
