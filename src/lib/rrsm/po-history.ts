/**
 * A recurrent service's PO history, from SAP: which of the supplier's POs were for this service,
 * and what they cost year on year.
 *
 * SAP does not say which service a PO was for, so it is worked out two ways:
 *   1. Every PO number recorded on the service (its last PO, renewal POs, earlier values in its
 *      log) is in, always.
 *   2. The supplier's other service POs are in when their line texts share a word with the
 *      service's name or description ("Zoho Analytics Sub 16.11.26-15.11.27" for "Zoho
 *      Analytics"). Generic words (renewal, licence, support...) do not count, nor does the
 *      supplier's own name when the service has a more specific word.
 * A PO can carry several services (one Microsoft reseller PO holds two companies' Office 365), so
 * only the lines that match best are counted; a recorded PO with no matching line counts in full.
 *
 * Pure: the queries are in the action, the rules are here and tested.
 */

export interface PoLineIn {
  poNumber: string;
  item: string;
  description: string;
  value: number;
  currency: string;
  created: string; // YYYY-MM-DD
  releaseState: string;
}

export interface HistoryPo {
  poNumber: string;
  created: string;
  year: number;
  currency: string;
  releaseState: string;
  value: number;
  /** The lines counted for this service. */
  lines: { item: string; description: string; value: number }[];
  /** Lines on the PO that were left out as belonging to something else. */
  otherLines: number;
  recorded: boolean;
  matchedOn: string[];
}

export interface HistoryYear {
  year: number;
  /** Total per currency, e.g. { USD: 11379.36 }. */
  totals: Record<string, number>;
  pos: number;
  /** Change against the year before in the same currency, as a fraction (0.12 = +12 %). */
  change: Record<string, number | null>;
}

const STOP = new Set(
  (
    'the and for with from service services renewal renew annual yearly year years license licence ' +
    'licenses licences subscription support management provision nesr new users user tool software ' +
    'amc contract months month plus pro hq dubai uae per one all via charges charge fees fee cost'
  ).split(' '),
);

export function serviceWords(text: string): string[] {
  return [
    ...new Set(
      String(text ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)),
    ),
  ];
}

export function matchServicePos(
  serviceText: string,
  supplierName: string,
  lines: PoLineIn[],
  recorded: string[],
): HistoryPo[] {
  /* The supplier's own name ("Zoho" in Zoho Corporation) is on every one of its POs, so it only
     counts when the service has nothing more specific to go on ("SpeedExam" from SpeedExam). */
  const vendor = new Set(serviceWords(supplierName));
  const all = serviceWords(serviceText);
  const specific = all.filter((w) => !vendor.has(w));
  const want = new Set(specific.length ? specific : all);
  const recordedSet = new Set(recorded.map((p) => p.trim()).filter(Boolean));
  const byPo = new Map<string, PoLineIn[]>();
  for (const l of lines)
    (byPo.get(l.poNumber) ?? byPo.set(l.poNumber, []).get(l.poNumber)!).push(l);

  const out: HistoryPo[] = [];
  for (const [poNumber, ls] of byPo) {
    const hits = (l: PoLineIn) => serviceWords(l.description).filter((w) => want.has(w));
    const top = Math.max(0, ...ls.map((l) => hits(l).length));
    const isRecorded = recordedSet.has(poNumber);
    if (!top && !isRecorded) continue;
    const counted = top ? ls.filter((l) => hits(l).length === top) : ls;
    const first = ls.reduce((a, b) => (a.created <= b.created ? a : b));
    out.push({
      poNumber,
      created: first.created,
      year: Number(first.created.slice(0, 4)),
      currency: first.currency,
      releaseState: first.releaseState,
      value: round(counted.reduce((n, l) => n + l.value, 0)),
      lines: counted
        .sort((a, b) => a.item.localeCompare(b.item, undefined, { numeric: true }))
        .map((l) => ({ item: l.item, description: l.description, value: l.value })),
      otherLines: ls.length - counted.length,
      recorded: isRecorded,
      matchedOn: [...new Set(counted.flatMap(hits))],
    });
  }
  return out.sort(
    (a, b) => b.created.localeCompare(a.created) || b.poNumber.localeCompare(a.poNumber),
  );
}

export function rollupByYear(pos: HistoryPo[]): HistoryYear[] {
  const map = new Map<number, HistoryYear>();
  for (const p of pos) {
    const y = map.get(p.year) ?? { year: p.year, totals: {}, pos: 0, change: {} };
    y.totals[p.currency] = round((y.totals[p.currency] ?? 0) + p.value);
    y.pos++;
    map.set(p.year, y);
  }
  const years = [...map.values()].sort((a, b) => a.year - b.year);
  for (let i = 0; i < years.length; i++) {
    const prev = years.find((y) => y.year === years[i].year - 1);
    for (const [cur, v] of Object.entries(years[i].totals)) {
      const before = prev?.totals[cur];
      years[i].change[cur] = before ? round((v - before) / before, 4) : null;
    }
  }
  return years.reverse();
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
