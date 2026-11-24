'use client';

/* "Excel" and "Print / PDF" for the Health Board views (UX phase 6). Excel is a plain download
   link to the export route; Print opens the browser's print dialog, where "Save as PDF" gives the
   PDF. The print styles below lay the page out landscape, drop the buttons and menus, and let the
   wide tables print whole instead of scrolling. */

import { Download, Printer } from 'lucide-react';

const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  html, body { background: #fff !important; }
  .hb-print-hide { display: none !important; }
  .hb-print-unclip { overflow: visible !important; }
  .hb-print-unclip table { font-size: 9px; }
  .hb-print-unclip th, .hb-print-unclip td { position: static !important; }
  details:not([open]) > *:not(summary) { display: none; }
}
`;

export default function BoardActions({ exportHref }: { exportHref: string }) {
  return (
    <span className="hb-print-hide inline-flex items-center gap-2">
      <style>{PRINT_CSS}</style>
      <a
        href={exportHref}
        download
        className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
      >
        <Download className="h-4 w-4" />
        Excel
      </a>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
      >
        <Printer className="h-4 w-4" />
        Print / PDF
      </button>
    </span>
  );
}
