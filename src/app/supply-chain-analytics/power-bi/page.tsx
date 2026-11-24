import { redirect } from 'next/navigation';

/**
 * The Power BI Health Board was retired on 24 Nov 2026 in favour of the native board
 * (src/lib/health-board/RULES.md). This address is kept so old links and bookmarks still land.
 */
export default function RetiredPowerBiBoard() {
  redirect('/supply-chain-analytics/health-board');
}
