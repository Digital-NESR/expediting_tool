import type { ReactNode } from 'react';
import AnalyticsHeader from './AnalyticsHeader';
import { sectionById, type SectionId } from './sections';

/** The page around one board: the shared header, then the board with the padding it always had. */
export default function BoardShell({
  section,
  adminPreview,
  children,
}: {
  section: SectionId;
  adminPreview: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50 font-sans text-slate-900">
      <AnalyticsHeader section={sectionById(section)} adminPreview={adminPreview} />
      <main className="flex flex-1 flex-col">
        <div className="flex-1 p-6">{children}</div>
      </main>
    </div>
  );
}
