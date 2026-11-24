'use client';

/*
 * Click a row of the overview table to keep it highlighted, so the eye can follow it across every
 * month (owner, 24 Nov 2026). Clicking it again, clicking another row, or pressing Escape moves or
 * clears the highlight. Links inside a row (the KPI name, the (i)) still work as links.
 *
 * The table itself is rendered on the server; this wrapper only sets data-selected on the clicked
 * <tr data-row>, and the row's classes style that state. Nothing else on the page changes.
 */
import { useEffect, useRef } from 'react';

export default function RowHighlight({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const clear = () =>
      root.querySelectorAll('tr[data-selected]').forEach((r) => r.removeAttribute('data-selected'));
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('a, button, input, select, textarea')) return;
      const row = target.closest('tr[data-row]');
      if (!row || !root.contains(row)) return;
      const wasSelected = row.hasAttribute('data-selected');
      clear();
      if (!wasSelected) row.setAttribute('data-selected', 'true');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear();
    };
    root.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
