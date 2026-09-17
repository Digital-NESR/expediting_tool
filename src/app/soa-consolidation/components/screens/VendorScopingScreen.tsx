'use client';

import { useEffect } from 'react';
import type { ScopeRowKind, ScreenProps } from '../../types';
import TableToolbar from '../TableToolbar';
import { STANDING_BORDER_TOP, STANDING_TEXT } from '../tones';

const COLUMNS = 'grid-cols-[34px_44px_1fr_110px_104px_128px]';

/* The three row states. Two of them are not free choices, so they are coloured differently from
   an ordinary row rather than only being disabled: a champion has to be able to see, at a glance
   down a 525-row list, which boxes they are not being offered. */
const ROW_TONE: Record<ScopeRowKind, string> = {
  free: '',
  locked: 'bg-[#F5FAF7]',
  excluded: 'bg-[#FAFAFA]',
};

const NAME_TONE: Record<ScopeRowKind, string> = {
  free: 'text-sns-ink',
  locked: 'text-sns-ink',
  excluded: 'text-[#9E9E9E]',
};

const STATE_BADGE: Record<ScopeRowKind, string> = {
  free: 'bg-sns-green-wash text-sns-green',
  locked: 'bg-[#E3F2FD] text-[#1565C0]',
  excluded: 'bg-[#F0F0F0] text-[#9E9E9E]',
};

/* One class string per state rather than a base plus an override: two conflicting Tailwind
   backgrounds in the same attribute are resolved by the stylesheet's order, not the string's. */
function stateBadgeClass(kind: ScopeRowKind, checked: boolean): string {
  if (kind !== 'free') return STATE_BADGE[kind];
  return checked ? STATE_BADGE.free : 'bg-[#F0F0F0] text-sns-grey';
}

function stateLabel(kind: ScopeRowKind, checked: boolean): string {
  if (kind === 'excluded') return 'Excluded';
  if (kind === 'locked') return 'Contacted';
  return checked ? 'Selected' : 'Not selected';
}

/**
 * Vendor Scoping — the champion's own list of who this country will chase.
 *
 * It used to be one button. `scopeSoaCountry` swept in every supplier above the cycle's threshold
 * and that was the whole decision, which is a reasonable default and a poor rule: a champion knows
 * which of their suppliers is a dormant shell, which two codes are the same company, and which
 * $180,000 vendor matters more than a $300,000 one.
 *
 * So this screen now shows every supplier in the cycle's PO snapshot with a tick box, and the
 * threshold is offered as a shortcut rather than applied as a rule. Three things it is careful
 * about:
 *
 *   The list is fetched here, not carried in the page payload. 525 rows are wanted on exactly one
 *   of eight screens.
 *
 *   Ticking is a draft. Nothing is written until "Save selection" is pressed, and the button says
 *   what it is about to do. Writing per tick would be 525 round trips and would let a misclick
 *   change the database.
 *
 *   Rank and cumulative % come from the server, ranked across the whole country. They are shown
 *   unchanged while the search box filters the rows, so "#1" never comes to mean "first hit".
 */
export default function VendorScopingScreen({ vm }: ScreenProps) {
  /* The screen asks for its own data the first time it renders. `scopeNeedsLoad` goes false as
     soon as the request is in flight, so this settles after one call. */
  const { scopeNeedsLoad, onLoadCandidates } = vm;
  useEffect(() => {
    if (scopeNeedsLoad) onLoadCandidates();
  }, [scopeNeedsLoad, onLoadCandidates]);

  const cov = vm.scopeCoverage;

  return (
    <div className="animate-[fadeIn_0.2s_ease]">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold mb-[3px]">Vendor Scoping</h1>
          <p className="text-[12px] text-sns-grey">{vm.contextLine}</p>
          <p className="text-[11px] text-sns-grey mt-0.5">{vm.scopeIntroLine}</p>
        </div>
        {vm.canScope && vm.scopeLoaded && (
          <div className="flex items-center gap-2 shrink-0">
            {vm.scopeDirty && (
              <button
                type="button"
                onClick={vm.onDiscardScope}
                disabled={vm.busy}
                className="bg-white text-sns-grey border border-sns-line px-3 py-[9px] rounded-[7px] text-[12px] font-bold disabled:opacity-50"
              >
                Discard changes
              </button>
            )}
            <button
              type="button"
              onClick={vm.onSaveScope}
              disabled={!vm.scopeCanSave}
              className="bg-sns-green text-white border-none px-3.5 py-[9px] rounded-[7px] text-[12px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {vm.scopeSaveLabel}
            </button>
          </div>
        )}
      </div>

      {!vm.canScope && (
        <div className="bg-white rounded-lg border-l-4 border-l-[#E65100] px-3.5 py-2.5 mb-3 text-[12px] text-sns-ink shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
          You have read-only access to {vm.countryLabel}, so the selection below cannot be changed.
          A champion or a manager for this country can change it.
        </div>
      )}

      {vm.scopeLoading && (
        <div className="bg-white rounded-[10px] p-5 text-center text-[12px] text-sns-grey shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
          Reading every supplier in this cycle&apos;s PO snapshot…
        </div>
      )}

      {!!vm.scopeError && (
        <div className="bg-white rounded-[10px] p-5 border-t-4 border-t-[#B71C1C] shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
          <div className="text-[14px] font-bold mb-1.5">The supplier list could not be read</div>
          <p className="text-[12px] text-sns-grey leading-[1.6] max-w-[620px]">{vm.scopeError}</p>
          <button
            type="button"
            onClick={vm.onLoadCandidates}
            className="mt-3 bg-sns-green text-white border-none px-3.5 py-2 rounded-[7px] text-[12px] font-bold"
          >
            Try again
          </button>
        </div>
      )}

      {!!vm.scopeEmptyReason && (
        <div className="bg-white rounded-[10px] p-5 border-t-4 border-t-sns-grey shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
          <div className="text-[14px] font-bold mb-1.5">There is nothing to select yet</div>
          <p className="text-[12px] text-sns-grey leading-[1.6] max-w-[620px]">
            {vm.scopeEmptyReason}
          </p>
        </div>
      )}

      {vm.scopeLoaded && !vm.scopeEmptyReason && (
        <>
          {/* The coverage card is deliberately the largest thing on the screen: the selected share
              of the country's balance is the figure the whole quarter is judged on, and it moves
              on every tick. The other three are counts that give it context. */}
          <div className="grid grid-cols-1 gap-2.5 mb-3 lg:grid-cols-[1.7fr_1fr_1fr_1fr]">
            <div
              className={`bg-white rounded-[10px] px-4 py-3.5 border-t-4 ${STANDING_BORDER_TOP[cov.standing]} shadow-[0_1px_3px_rgba(0,0,0,0.07)]`}
            >
              <div className="text-[10px] uppercase tracking-[0.5px] text-sns-grey font-bold mb-1">
                Selected share of country balance
              </div>
              <div className="flex items-baseline gap-2">
                <div
                  className={`text-[38px] font-bold leading-none ${STANDING_TEXT[cov.standing]}`}
                >
                  {cov.label}
                </div>
                <div className="text-[11px] text-sns-grey">
                  {cov.selectedLabel} of {cov.totalLabel}
                </div>
              </div>
              <div className="relative h-2 rounded-[4px] bg-[#F0F0F0] mt-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-[4px] ${cov.meetsTarget ? 'bg-sns-green' : 'bg-[#E65100]'}`}
                  style={{ width: `${cov.barPct}%` }}
                />
                {/* The target marker, so the bar is read against the number that matters. */}
                <div
                  className="absolute top-0 h-full w-[2px] bg-sns-ink"
                  style={{ left: `${cov.markerPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-[10px] text-sns-grey">
                  Target {cov.targetPct}% · {cov.targetValueLabel}
                </span>
                <span className="text-[10px] text-sns-grey">
                  Ceiling {cov.reachablePct}% if every selectable supplier is ticked
                </span>
              </div>
              <div
                className={`text-[11px] font-bold mt-1.5 leading-[1.4] ${
                  cov.meetsTarget
                    ? 'text-sns-green'
                    : cov.targetUnreachable
                      ? 'text-[#B71C1C]'
                      : 'text-[#E65100]'
                }`}
              >
                {cov.verdictLabel}
              </div>
            </div>

            {vm.scopeCards.map((kpi) => (
              <div
                key={kpi.label}
                className={`bg-white rounded-[10px] px-4 py-3.5 border-t-4 ${STANDING_BORDER_TOP[kpi.accent]} shadow-[0_1px_3px_rgba(0,0,0,0.07)]`}
              >
                <div className="text-[10px] uppercase tracking-[0.5px] text-sns-grey font-bold mb-1">
                  {kpi.label}
                </div>
                <div
                  className={`text-[30px] font-bold leading-none my-1 ${STANDING_TEXT[kpi.accent]}`}
                >
                  {kpi.value}
                </div>
                <div className="text-[10px] text-sns-grey mt-[3px] leading-[1.3]">{kpi.sub}</div>
              </div>
            ))}
          </div>

          {!!vm.scopeDirtyLine && (
            <div className="bg-white rounded-lg border-l-4 border-l-[#E65100] px-3.5 py-2.5 mb-3 text-[12px] text-sns-ink shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
              {vm.scopeDirtyLine}
            </div>
          )}

          {!vm.scopeDirty && !!vm.scopeSavedLine && (
            <div className="bg-white rounded-lg border-l-4 border-l-[#6A1B9A] px-3.5 py-2.5 mb-3 shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
              <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold mb-0.5">
                Last saved
              </div>
              <div className="text-[12px] text-sns-ink leading-[1.5]">{vm.scopeSavedLine}</div>
            </div>
          )}

          {!vm.isScoped && !vm.scopeDirty && (
            <div className="bg-white rounded-lg border-l-4 border-l-sns-grey px-3.5 py-2.5 mb-3 text-[12px] text-sns-grey leading-[1.5] shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
              Nothing has been selected for {vm.countryLabel} yet. Tick the suppliers this country
              will chase and save — everything above the threshold is a sensible starting point, and
              the first shortcut below ticks exactly those.
            </div>
          )}

          {vm.canScope && (
            <div className="flex gap-2 flex-wrap mb-3">
              {vm.scopeBulkActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className="bg-white text-left border border-sns-line rounded-[7px] px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:border-sns-green"
                >
                  <span className="block text-[12px] font-bold text-sns-ink">{action.label}</span>
                  <span className="block text-[10px] text-sns-grey mt-px">{action.hint}</span>
                </button>
              ))}
            </div>
          )}

          <TableToolbar table={vm.scopeTable} placeholder="Filter by supplier name or number" />

          <div className="bg-white rounded-[10px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
            <div
              className={`grid ${COLUMNS} gap-2 px-3.5 py-2.5 bg-sns-green text-white text-[10px] font-bold uppercase tracking-[0.5px] items-center border-l-[3px] border-l-transparent`}
            >
              <div>Pick</div>
              <div>#</div>
              <div>Supplier</div>
              <div>PO Amount</div>
              <div>Cumulative %</div>
              <div>State</div>
            </div>
            {vm.scopeTable.isEmpty && (
              <div className="px-3.5 py-6 text-center text-[12px] text-sns-grey">
                {vm.scopeTable.rangeLabel}
              </div>
            )}
            {vm.scopeRows.map((row, i) => (
              <div
                key={row.vendorNo}
                className={`grid ${COLUMNS} gap-2 px-3.5 py-[9px] text-[12px] border-b border-b-[#F0F0F0] items-center ${
                  row.kind === 'free'
                    ? i % 2 === 0
                      ? 'bg-white'
                      : 'bg-[#F8FBF9]'
                    : ROW_TONE[row.kind]
                } ${row.isDirty ? 'border-l-[3px] border-l-[#E65100]' : 'border-l-[3px] border-l-transparent'}`}
              >
                <div>
                  <input
                    type="checkbox"
                    checked={row.checked}
                    disabled={row.disabled}
                    onChange={row.onToggle}
                    aria-label={row.toggleLabel}
                    className="h-[15px] w-[15px] accent-sns-green align-middle disabled:cursor-not-allowed"
                  />
                </div>
                <div className="text-sns-grey text-[11px]">{row.rank}</div>
                <div className="min-w-0">
                  <div className={`font-bold truncate ${NAME_TONE[row.kind]}`}>{row.name}</div>
                  <div className="text-[10px] text-sns-grey font-[family-name:monospace] mt-px">
                    {row.vendorNo}
                    {row.isUnreachable && <span className="text-[#B71C1C]"> · no email</span>}
                  </div>
                  {!!row.noteLabel && (
                    <div className="text-[10px] text-sns-grey mt-px leading-[1.4]">
                      {row.noteLabel}
                    </div>
                  )}
                </div>
                <div className={`font-bold ${NAME_TONE[row.kind]}`}>
                  {row.valueLabel}
                  {row.overThreshold && (
                    <span className="text-[10px] font-normal text-sns-grey"> ▲</span>
                  )}
                </div>
                <div className={`font-bold ${STANDING_TEXT[row.cumStanding]}`}>{row.cumPct}%</div>
                <div>
                  <span
                    className={`${stateBadgeClass(row.kind, row.checked)} rounded-xl px-[9px] py-0.5 text-[10px] font-bold inline-block`}
                  >
                    {stateLabel(row.kind, row.checked)}
                  </span>
                  {row.isDirty && (
                    <span className="block text-[10px] text-[#E65100] font-bold mt-px">
                      unsaved
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-sns-grey mt-2 leading-[1.5]">
            ▲ marks a supplier above the cycle&apos;s threshold. Rank and cumulative % are positions
            in the whole country, not in the rows currently on screen, and excluded suppliers stay
            in the balance the percentage is measured against.
          </p>
        </>
      )}
    </div>
  );
}
