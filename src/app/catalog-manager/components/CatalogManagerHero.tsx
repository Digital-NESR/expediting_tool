import CatalogManagerLogo from './CatalogManagerLogo';

export default function CatalogManagerHero({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#307c4c] via-[#2b6f44] to-[#1d4f31] p-5 text-white shadow-lg shadow-[#307c4c]/25 sm:p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', backgroundSize: '28px 28px' }}
      />
      <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-40 w-40 rounded-full bg-[#6aaf8e]/20 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3.5">
          <CatalogManagerLogo size="lg" />
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
            {subtitle && <p className="mt-1 max-w-2xl text-sm text-white/80">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  );
}
