import type { ScreenProps } from '../types';

/**
 * The states the prototype never had, all of them reachable on an ordinary morning.
 *
 * A tool whose fixtures always held a live quarter and a scoped country could render none of
 * these; the database can be in all of them. Each says who fixes it and where, because "no data"
 * on its own sends the reader to ask someone.
 *
 * `no-extract` is the one that caused real confusion: opening a cycle and taking its spend
 * snapshot are two separate admin steps, and between them the tool looked open for business with
 * nothing in it.
 */
const COPY: Record<string, { title: string; lead: string; next: string }> = {
  'no-cycle': {
    title: 'No SOA cycle is open',
    lead: 'Nothing can be scoped, requested or consolidated until a quarter is opened and its PO snapshot is extracted.',
    next: 'An administrator opens the cycle on /admin, under SOA Consolidation, and runs the extract against it.',
  },
  'no-country': {
    title: 'Your access names no active country',
    lead: 'You hold a grant for SOA Consolidation, but none of the countries it covers is currently active.',
    next: 'An administrator can activate the country, or widen your grant, from the SOA access matrix on /admin.',
  },
  'no-extract': {
    title: 'The quarter is open, but its PO snapshot has not been taken',
    lead: 'Opening a cycle and extracting the receipted spend behind it are two steps. Until the second one runs there are no suppliers to scope from, so every figure on these screens reads zero — not because the country is empty, but because nothing has been read yet.',
    next: 'An administrator runs the extract on /admin, under SOA Consolidation → Cycles. It aggregates every GRN’d PO line in the cycle’s window and takes a few seconds.',
  },
  'not-scoped': {
    title: 'This country has not been scoped yet',
    lead: 'The cycle is open, but nobody has drawn this country’s vendor list from the PO snapshot, so there is no one to chase.',
    next: 'Open Vendor Scoping and run "Scope this country". It selects every supplier above the cycle’s threshold.',
  },
};

export default function EmptyState({ vm }: ScreenProps) {
  const copy = COPY[vm.emptyKind];
  if (!copy) return null;

  return (
    <div className="animate-[fadeIn_0.2s_ease] mx-auto max-w-[620px] pt-10">
      <div className="rounded-[10px] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.07)] border-t-4 border-t-sns-grey">
        <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-sns-grey mb-1.5">
          {vm.contextLine}
        </div>
        <h1 className="text-[20px] font-bold mb-2">{copy.title}</h1>
        <p className="text-[12px] text-sns-grey leading-[1.6] mb-3.5">{copy.lead}</p>
        <div className="rounded-lg border border-sns-green-pale bg-sns-green-wash px-3.5 py-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-sns-green mb-1">
            What happens next
          </div>
          <div className="text-[12px] text-sns-ink leading-[1.5]">{copy.next}</div>
        </div>
        {vm.emptyKind === 'not-scoped' && (
          <button
            type="button"
            onClick={() => vm.navItems.find((n) => n.id === 'scoping')?.onClick()}
            className="mt-3.5 rounded-[7px] bg-sns-green px-3.5 py-[9px] text-[12px] font-bold text-white"
          >
            Go to Vendor Scoping →
          </button>
        )}
      </div>
    </div>
  );
}
