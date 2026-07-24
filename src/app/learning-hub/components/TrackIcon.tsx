import { Boxes, LayoutGrid, Building2, BookOpen } from 'lucide-react';

// Renders the icon for a track directly (rather than resolving to a component
// reference at render time) so each track icon stays a statically-named JSX tag.
export default function TrackIcon({ icon, className, style }: { icon?: string | null; className?: string; style?: React.CSSProperties }) {
  if (icon === 'boxes') return <Boxes className={className} style={style} />;
  if (icon === 'layout-grid') return <LayoutGrid className={className} style={style} />;
  if (icon === 'building-2') return <Building2 className={className} style={style} />;
  return <BookOpen className={className} style={style} />;
}
