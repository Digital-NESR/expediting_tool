'use client';

/* The PR link dialog over the preview board, with sample SAP suggestions, for the help screenshots.
   Its buttons do nothing: there is no signed-in buyer and no database behind the preview. */

import { useMemo } from 'react';
import type { BoardLine, PrSuggestions } from '@/app/actions/rrsm/cycle';
import PrLinkDialog from '@/app/rrsm/PrLinkDialog';

export default function PreviewPrLink({
  line,
  supplierName,
  suggestions,
}: {
  line: BoardLine;
  supplierName: string;
  suggestions: PrSuggestions;
}) {
  const money = useMemo(
    () => new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [],
  );
  return (
    <PrLinkDialog
      line={line}
      supplierName={supplierName}
      siblings={[5]}
      money={money}
      onClose={() => {}}
      onDone={() => {}}
      preview={suggestions}
    />
  );
}
