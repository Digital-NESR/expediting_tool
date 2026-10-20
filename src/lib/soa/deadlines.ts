/**
 * A country's effective deadlines: its own override, or the cycle's.
 *
 * Both dates are told to people. The collection deadline goes into the letter every supplier
 * receives and into the upload page they land on; the closing deadline is what a country is
 * judged late against and what gates its handoff. Six places read them, and if one of those
 * reads `cycles.submission_deadline` directly while the rest resolve an override, a supplier is
 * emailed one date and shown another on the page that date links to.
 *
 * So the resolution is SQL written once. `country_cycle_deadlines` holds a row only for a
 * country somebody has given its own dates to, and NULL in either column there still inherits,
 * which is why this is a COALESCE over a subquery rather than a join the caller must remember
 * to add. A query that forgets the join silently returns the cycle's date; a query that forgets
 * to call this does not compile differently, which is what the test over the source is for.
 *
 * `cycleAlias` and `countryExpr` are column expressions written by the caller. Nothing here
 * interpolates a value from a request.
 */

type DeadlineColumn = 'submission_deadline' | 'cycle_deadline';

const effective = (
  column: DeadlineColumn,
  cycleAlias: string,
  countryExpr: string,
  cycleIdExpr: string,
): string =>
  `COALESCE(
     (SELECT ccd.${column}
        FROM country_cycle_deadlines ccd
       WHERE ccd.cycle_id = ${cycleIdExpr} AND ccd.country_id = ${countryExpr}),
     ${cycleAlias}.${column}
   )`;

/**
 * When this country's suppliers were told their statements are due.
 *
 * @param cycleAlias   the `cycles` row in scope, e.g. `cy`
 * @param countryExpr  an expression yielding the country id, e.g. `cc.country_id` or `c.id`
 * @param cycleIdExpr  how to reach the cycle id; defaults to `<cycleAlias>.id`
 */
export const effectiveSubmissionDeadline = (
  cycleAlias: string,
  countryExpr: string,
  cycleIdExpr = `${cycleAlias}.id`,
): string => effective('submission_deadline', cycleAlias, countryExpr, cycleIdExpr);

/** When this country has to be reconciled, closed and handed off. */
export const effectiveCycleDeadline = (
  cycleAlias: string,
  countryExpr: string,
  cycleIdExpr = `${cycleAlias}.id`,
): string => effective('cycle_deadline', cycleAlias, countryExpr, cycleIdExpr);

/**
 * The statuses an administrator may set a country to, and what each one means.
 *
 * Deliberately not the whole `vendor_status` enum, which `country_cycles.status` shares: that
 * enum also carries per-vendor labels like `nil_balance` and `non_responder`, and a country set
 * to one of those would render as a blank badge nobody could explain. These six are the ones
 * `CountryStatus` in the tool knows how to draw.
 */
export const COUNTRY_STATUS_OPTIONS = [
  {
    value: 'not_started',
    label: 'Not started',
    hint: 'Enrolled but nothing scoped. Rarely the right answer once work exists.',
  },
  { value: 'in_progress', label: 'In progress', hint: 'Scoped, nothing sent yet.' },
  { value: 'requests_sent', label: 'Requests sent', hint: 'First round of letters is out.' },
  {
    value: 'reminders_sent',
    label: 'Reminders sent',
    hint: 'Chasing. This is where a reopened country normally belongs.',
  },
  {
    value: 'consolidating',
    label: 'Consolidating',
    hint: 'Collection done, statements being reconciled.',
  },
  {
    value: 'handed_off',
    label: 'Handed off',
    hint: 'Closed and passed to Accounts. Uploads stop.',
  },
] as const;

export type CountryStatusValue = (typeof COUNTRY_STATUS_OPTIONS)[number]['value'];

export const isCountryStatus = (value: string): value is CountryStatusValue =>
  COUNTRY_STATUS_OPTIONS.some((o) => o.value === value);
