import ProcureGuardLogo from './ProcureGuardLogo';

// Shared gradient page banner so every ProcureGuard page matches the dashboard look.
export default function ProcureGuardHero({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#307c4c] to-[#1d4f31] p-4 text-white shadow-lg shadow-[#307c4c]/25">
      <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <ProcureGuardLogo size="lg" />
          <div>
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h1>
            {subtitle && <p className="mt-0.5 max-w-2xl text-xs text-white/80 sm:text-sm">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  );
}
