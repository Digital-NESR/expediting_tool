'use client';

import { useRouter } from 'next/navigation';
import type { SgTaxonomyRow } from '@/lib/sourceguide/types';
import DecompositionClient from './DecompositionClient';

/**
 * SourceGuide's copy of the drill-down, with the one link that belongs to SourceGuide.
 *
 * The drill-down itself is shared with the launcher's standalone page, which cannot offer the
 * guide's search: it needs a grant that reader may not hold.
 */
export default function TaxonomyWithSearch({ rows }: { rows: SgTaxonomyRow[] }) {
  const router = useRouter();
  return <DecompositionClient rows={rows} onSearch={() => router.push('/sourceguide/search')} />;
}
