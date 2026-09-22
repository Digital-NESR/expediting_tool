import { STATUS_LABEL, STATUS_STYLE } from './constants';
import { daysFromToday } from './date';
import type {
  Classification,
  DisplayStatus,
  RegistryRecord,
  RoleKind,
  ScopeNode,
  TaxCategory,
} from './types';

/**
 * What to call a record that has no Registry ID yet.
 *
 * `Draft #17` rather than "not issued": a record in validation is discussed in
 * mail, in the inbox and across screens before it ever has an ID, and everyone
 * needs the same handle for it. The notification emails already use this
 * spelling — `sns.ts` falls back to it when building their payload — so the
 * screens must match, or the reader cannot tie the mail to the row.
 */
export function recordLabel(r: { id: string | null; rid: number }): string {
  return r.id || `Draft #${r.rid}`;
}

export function money(n: number): string {
  if (!n) return '—';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + n;
}

export function displayStatus(r: RegistryRecord): DisplayStatus {
  if (r.base !== 'Active' && r.base !== 'Extended') return r.base;
  if (!r.expiry) return r.base;
  const d = daysFromToday(r.expiry);
  if (d < 0) return 'Expired';
  if (d <= 60) return 'Expiring soon';
  return r.base;
}

/** How a status is written on screen — see STATUS_LABEL for why it differs. */
export function statusLabel(s: DisplayStatus): string {
  return STATUS_LABEL[s] ?? s;
}

export function statusStyle(s: DisplayStatus): [string, string, string] {
  return STATUS_STYLE[s] || STATUS_STYLE.Draft;
}

export function clsStyle(cls: Classification): [string, string] {
  return cls === 'SGL' ? ['#E3EFE8', '#1D5B39'] : ['#EDECE6', '#6B5A16'];
}

export function clsLabel(cls: Classification): string {
  return cls === 'SGL' ? 'SINGLE-SOURCE' : 'SOLE-SOURCE';
}

export function roleKind(role: string | null): RoleKind {
  const r = role || '';
  if (r.indexOf('Validator L1') === 0) return 'l1';
  if (r.indexOf('Validator L2') === 0) return 'l2';
  if (r.indexOf('Requestor') === 0) return 'req';
  if (r.indexOf('Read-only') === 0) return 'ro';
  return 'lead';
}

export function nodeKey(n: ScopeNode): string {
  return n.cat + '|' + n.sub + '|' + n.fam + '|' + (n.com || '');
}

export function leafOf(n: ScopeNode): string {
  return n.com || n.fam;
}

export function nodePath(n: ScopeNode): string {
  return n.cat + ' › ' + n.sub + (n.com ? ' › ' + n.fam + ' › ' : ' › ');
}

/* ─── Taxonomy lookups ─────────────────────────────────────────
   The tree now comes from the database, so each lookup takes it as an
   argument rather than closing over a module-level constant. */

export function taxCategories(tax: TaxCategory[]): { name: string; spend: string }[] {
  return tax.map((t) => ({ name: t.name, spend: t.spendType }));
}

export function taxSubs(tax: TaxCategory[], cat: string): string[] {
  const c = tax.find((t) => t.name === cat);
  return c ? c.subs.map((s) => s.name) : [];
}

export function taxFamilies(tax: TaxCategory[], cat: string, sub: string): string[] {
  const c = tax.find((t) => t.name === cat);
  const s = c?.subs.find((x) => x.name === sub);
  return s ? s.families.map((f) => f.name) : [];
}

export function taxCommodities(
  tax: TaxCategory[],
  cat: string,
  sub: string,
  fam: string,
): string[] {
  const c = tax.find((t) => t.name === cat);
  const s = c?.subs.find((x) => x.name === sub);
  const f = s?.families.find((x) => x.name === fam);
  return f ? f.commodities : [];
}
