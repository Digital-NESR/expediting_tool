/**
 * ProcureGuard analytics aggregation — pure functions over already-scoped rows.
 *
 * A plain module, deliberately NOT `'use server'`: the scoping happens in the action that fetches
 * the rows, so none of this may be reachable on its own.
 */
import {
  getPermissionProfile,
  getProcureGuardAvailableActions,
  isActiveApprovalStatus,
  procureGuardThreshold,
  toUsd,
} from '@/lib/procureGuard-utils';
import type {
  AdhocPaymentRequest,
  AdvancePaymentRequest,
  ProcureGuardAnalyticsMetric,
  ProcureGuardReviewDurationMetric,
} from '@/types/procureGuard';

export function requestMonth(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function addMetric(map: Map<string, ProcureGuardAnalyticsMetric>, label: string | null | undefined, amount: unknown) {
  const key = label?.trim() || 'Unspecified';
  const current = map.get(key) ?? { label: key, count: 0, amount: 0 };
  current.count += 1;
  current.amount += Number(amount || 0);
  map.set(key, current);
}

export function topMetrics(map: Map<string, ProcureGuardAnalyticsMetric>, limit = 8): ProcureGuardAnalyticsMetric[] {
  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.amount - a.amount)
    .slice(0, limit);
}

function hoursBetween(startValue: string | null | undefined, endMs: number): number {
  const start = startValue ? new Date(startValue) : null;
  if (!start || Number.isNaN(start.getTime())) return 0;
  return Math.max(0, (endMs - start.getTime()) / 36e5);
}

type ReviewDurationDraft = ProcureGuardReviewDurationMetric & { longestUpdatedAtMs: number };

export function buildReviewDurationMetrics(
  adhoc: AdhocPaymentRequest[],
  advance: AdvancePaymentRequest[],
): ProcureGuardReviewDurationMetric[] {
  const nowMs = Date.now();
  const adminPermissions = getPermissionProfile('Admin');
  const groups = new Map<string, ReviewDurationDraft>();

  for (const row of [
    ...adhoc.map(request => ({ requestType: 'adhoc' as const, request })),
    ...advance.map(request => ({ requestType: 'advance' as const, request })),
  ]) {
    if (!isActiveApprovalStatus(row.request.status)) continue;

    const threshold = procureGuardThreshold(row.request);
    const actions = getProcureGuardAvailableActions(
      adminPermissions,
      row.requestType,
      row.request.status,
      threshold.amount,
      threshold.currency,
    );
    // When the request entered its CURRENT stage: the last approval, or submission if never
    // actioned. `updated_at` is bumped by viewer edits and attachment writes, which used to reset
    // the age of a request nobody had actually reviewed. Matches the reminder job's "open since".
    const enteredAt = row.request.reviewed_at || row.request.created_at;
    const stuckHours = hoursBetween(enteredAt, nowMs);
    const groupKey = `${row.requestType}:${row.request.status}:${actions.ownerLabel}`;
    const enteredAtMs = new Date(enteredAt).getTime();
    const current = groups.get(groupKey) ?? {
      request_type: row.requestType,
      status: row.request.status,
      owner_label: actions.ownerLabel,
      count: 0,
      average_hours: 0,
      total_hours: 0,
      longest_hours: 0,
      oldest_request_id: row.request.id,
      oldest_reference_number: row.request.reference_number,
      oldest_vendor_name: row.request.vendor_name,
      oldest_updated_at: enteredAt,
      longestUpdatedAtMs: Number.isNaN(enteredAtMs) ? nowMs : enteredAtMs,
    };

    current.count += 1;
    current.total_hours += stuckHours;

    if (stuckHours >= current.longest_hours) {
      current.longest_hours = stuckHours;
      current.oldest_request_id = row.request.id;
      current.oldest_reference_number = row.request.reference_number;
      current.oldest_vendor_name = row.request.vendor_name;
      current.oldest_updated_at = enteredAt;
      current.longestUpdatedAtMs = Number.isNaN(enteredAtMs) ? current.longestUpdatedAtMs : enteredAtMs;
    }

    groups.set(groupKey, current);
  }

  return [...groups.values()]
    .map(row => ({
      request_type: row.request_type,
      status: row.status,
      owner_label: row.owner_label,
      count: row.count,
      average_hours: row.count ? row.total_hours / row.count : 0,
      total_hours: row.total_hours,
      longest_hours: row.longest_hours,
      oldest_request_id: row.oldest_request_id,
      oldest_reference_number: row.oldest_reference_number,
      oldest_vendor_name: row.oldest_vendor_name,
      oldest_updated_at: row.oldest_updated_at,
    }))
    .sort((a, b) => b.total_hours - a.total_hours || b.average_hours - a.average_hours || a.owner_label.localeCompare(b.owner_label));
}

export function buildStats(adhoc: AdhocPaymentRequest[], advance: AdvancePaymentRequest[]) {
  const all = [...adhoc, ...advance];
  const totalAmount = all.reduce((sum, r) => sum + toUsd(r.amount, r.currency), 0);
  return {
    adhoc_total: adhoc.length,
    advance_total: advance.length,
    pending_review: all.filter(r => isActiveApprovalStatus(r.status)).length,
    approved: all.filter(r => r.status === 'Approved').length,
    rejected: all.filter(r => r.status === 'Rejected').length,
    total_requested_amount: totalAmount,
    adhoc_requested_amount: adhoc.reduce((sum, r) => sum + toUsd(r.amount, r.currency), 0),
    advance_requested_amount: advance.reduce((sum, r) => sum + toUsd(r.amount, r.currency), 0),
    average_request_amount: all.length ? totalAmount / all.length : 0,
    active_vendor_count: new Set(all.map(r => r.vendor_name.trim().toLowerCase()).filter(Boolean)).size,
    active_requester_count: new Set(all.map(r => r.requested_by_email.trim().toLowerCase()).filter(Boolean)).size,
  };
}
