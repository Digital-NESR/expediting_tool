'use server';

/**
 * ProcureGuard analytics reads. Both exports are public POST endpoints: the spend analytics guard on
 * analytics access and scope every query through analyticsScopedWhere(); the usage analytics are
 * admin-only.
 */
import type { QueryResultRow } from 'pg';
import { logger } from '@/lib/logger';
import { isActiveApprovalStatus, toUsd } from '@/lib/procureGuard-utils';
import {
  analyticsScopedWhere,
  getActor,
  requireAdminActor,
  requireProcureGuardAnalyticsAccess,
} from '@/lib/procure-guard/actor';
import {
  addMetric,
  buildReviewDurationMetrics,
  buildStats,
  requestMonth,
  topMetrics,
} from '@/lib/procure-guard/analytics';
import {
  adhocActiveStatuses,
  advanceActiveStatuses,
  PRIORITY_SORT_ORDER,
  STATUS_SORT_ORDER,
} from '@/lib/procure-guard/constants';
import { serialise, sql } from '@/lib/procure-guard/internals';
import { ensureProcureGuardUsageTables } from '@/lib/procure-guard/schema';
import { normalisePaymentCountries } from '@/lib/procure-guard/validation';
import type {
  AdhocPaymentRequest,
  AdvancePaymentRequest,
  ProcureGuardAdminAnalyticsData,
  ProcureGuardAnalyticsData,
  ProcureGuardAnalyticsMetric,
  ProcureGuardAnalyticsRequest,
  ProcureGuardHighValueRequest,
  ProcureGuardMonthlyMetric,
  ProcureGuardRequestType,
  ProcureGuardVendorMetric,
} from '@/types/procureGuard';

const log = logger('procure-guard');

export async function getProcureGuardAnalyticsData(): Promise<ProcureGuardAnalyticsData | null> {
  try {
    const actor = await getActor();
    requireProcureGuardAnalyticsAccess(actor);
    const scope = analyticsScopedWhere(actor);
    // Only the columns this page actually aggregates or returns. The aggregation stays in JS because
    // the same rows are ALSO returned wholesale as `requests` for the client-side table — pushing the
    // breakdowns into SQL GROUP BY would add a second full scan of both tables rather than remove
    // one. Narrowing SELECT * to these 13 columns is the win that was available: it drops the
    // attachment/notification/JSONB baggage from every row of both tables on the hottest read.
    // Keep this list in sync with the consumers below (addMetric / vendorTotals / monthly /
    // highValueOpenRequests / analyticsRequests / buildStats / buildReviewDurationMetrics /
    // normalisePaymentCountries / procureGuardThreshold). `contract_reference` is selected for the
    // advance table only: its presence is the adhoc-vs-advance discriminator further down.
    const ANALYTICS_COLUMNS =
      'id, reference_number, vendor_name, status, priority, requested_by_email, requested_by_name, amount, currency, spend_value_usd, country, created_at, reviewed_at';
    const [adhocRows, advanceRows] = await Promise.all([
      sql<QueryResultRow[]>(
        `SELECT ${ANALYTICS_COLUMNS} FROM procure_guard_adhoc_payments ${scope.where} ORDER BY created_at DESC`,
        scope.params,
      ),
      sql<QueryResultRow[]>(
        `SELECT ${ANALYTICS_COLUMNS}, contract_reference FROM procure_guard_advance_payments ${scope.where} ORDER BY created_at DESC`,
        scope.params,
      ),
    ]);

    const adhoc = normalisePaymentCountries(serialise<AdhocPaymentRequest[]>(adhocRows));
    const advance = normalisePaymentCountries(serialise<AdvancePaymentRequest[]>(advanceRows));
    const all = [...adhoc, ...advance];

    const adhocVendors = new Map<string, ProcureGuardAnalyticsMetric>();
    const advanceVendors = new Map<string, ProcureGuardAnalyticsMetric>();
    const statusBreakdown = new Map<string, ProcureGuardAnalyticsMetric>();
    const priorityBreakdown = new Map<string, ProcureGuardAnalyticsMetric>();
    const requesters = new Map<string, ProcureGuardAnalyticsMetric>();
    const vendorTotals = new Map<string, ProcureGuardVendorMetric>();
    const monthly = new Map<string, ProcureGuardMonthlyMetric>();

    for (const row of adhoc) {
      const amount = toUsd(row.amount, row.currency);
      addMetric(adhocVendors, row.vendor_name, amount);
      addMetric(statusBreakdown, row.status, amount);
      addMetric(priorityBreakdown, row.priority, amount);
      addMetric(requesters, row.requested_by_email, amount);

      const vendorKey = row.vendor_name.trim() || 'Unspecified';
      const vendor = vendorTotals.get(vendorKey) ?? {
        label: vendorKey,
        count: 0,
        amount: 0,
        adhoc_count: 0,
        adhoc_amount: 0,
        advance_count: 0,
        advance_amount: 0,
      };
      vendor.count += 1;
      vendor.amount += amount;
      vendor.adhoc_count += 1;
      vendor.adhoc_amount += amount;
      vendorTotals.set(vendorKey, vendor);

      const monthKey = requestMonth(row.created_at);
      const month = monthly.get(monthKey) ?? {
        month: monthKey,
        adhoc_count: 0,
        adhoc_amount: 0,
        advance_count: 0,
        advance_amount: 0,
        total_count: 0,
        total_amount: 0,
      };
      month.adhoc_count += 1;
      month.adhoc_amount += amount;
      month.total_count += 1;
      month.total_amount += amount;
      monthly.set(monthKey, month);
    }

    for (const row of advance) {
      const amount = toUsd(row.amount, row.currency);
      addMetric(advanceVendors, row.vendor_name, amount);
      addMetric(statusBreakdown, row.status, amount);
      addMetric(priorityBreakdown, row.priority, amount);
      addMetric(requesters, row.requested_by_email, amount);

      const vendorKey = row.vendor_name.trim() || 'Unspecified';
      const vendor = vendorTotals.get(vendorKey) ?? {
        label: vendorKey,
        count: 0,
        amount: 0,
        adhoc_count: 0,
        adhoc_amount: 0,
        advance_count: 0,
        advance_amount: 0,
      };
      vendor.count += 1;
      vendor.amount += amount;
      vendor.advance_count += 1;
      vendor.advance_amount += amount;
      vendorTotals.set(vendorKey, vendor);

      const monthKey = requestMonth(row.created_at);
      const month = monthly.get(monthKey) ?? {
        month: monthKey,
        adhoc_count: 0,
        adhoc_amount: 0,
        advance_count: 0,
        advance_amount: 0,
        total_count: 0,
        total_amount: 0,
      };
      month.advance_count += 1;
      month.advance_amount += amount;
      month.total_count += 1;
      month.total_amount += amount;
      monthly.set(monthKey, month);
    }

    const highValueOpenRequests: ProcureGuardHighValueRequest[] = all
      .filter((row) => isActiveApprovalStatus(row.status))
      .map((row) => {
        const requestType: ProcureGuardRequestType =
          'contract_reference' in row ? 'advance' : 'adhoc';
        return {
          id: row.id,
          request_type: requestType,
          reference_number: row.reference_number,
          vendor_name: row.vendor_name,
          status: row.status,
          amount: Number(row.amount || 0),
          amount_usd: toUsd(row.amount, row.currency),
          currency: row.currency,
          created_at: row.created_at,
        };
      })
      .sort((a, b) => b.amount_usd - a.amount_usd)
      .slice(0, 8);

    const analyticsRequests: ProcureGuardAnalyticsRequest[] = all.map((row) => {
      const requestType: ProcureGuardRequestType =
        'contract_reference' in row ? 'advance' : 'adhoc';
      return {
        id: row.id,
        request_type: requestType,
        reference_number: row.reference_number,
        vendor_name: row.vendor_name?.trim() || 'Unspecified',
        status: row.status,
        requested_by_email: row.requested_by_email,
        requested_by_name: row.requested_by_name ?? null,
        amount: Number(row.amount || 0),
        amount_usd: toUsd(row.amount, row.currency),
        currency: row.currency,
        created_at: row.created_at,
      };
    });

    return {
      actor,
      requests: analyticsRequests,
      stats: buildStats(adhoc, advance),
      top_vendors: [...vendorTotals.values()]
        .sort((a, b) => b.count - a.count || b.amount - a.amount)
        .slice(0, 10),
      top_adhoc_vendors: topMetrics(adhocVendors, 10),
      top_advance_vendors: topMetrics(advanceVendors, 10),
      status_breakdown: topMetrics(statusBreakdown, STATUS_SORT_ORDER.length),
      priority_breakdown: topMetrics(priorityBreakdown, PRIORITY_SORT_ORDER.length),
      requester_breakdown: topMetrics(requesters, 10),
      monthly_trend: [...monthly.values()]
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-12),
      review_duration_metrics: buildReviewDurationMetrics(adhoc, advance),
      high_value_open_requests: highValueOpenRequests,
      generated_at: new Date().toISOString(),
    };
  } catch (err) {
    log.error('getProcureGuardAnalyticsData.failed', err);
    return null;
  }
}

export async function getProcureGuardAdminAnalyticsData(): Promise<ProcureGuardAdminAnalyticsData | null> {
  try {
    const actor = await requireAdminActor();
    await ensureProcureGuardUsageTables();

    const windowWhere = `occurred_at >= NOW() - INTERVAL '30 days'`;
    const [summaryRows, pageRows, clickRows, userRows, recentRows, pendingRows] = await Promise.all(
      [
        sql<QueryResultRow[]>(`
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS page_views,
          COUNT(*) FILTER (WHERE event_type = 'click')::int AS clicks,
          COUNT(DISTINCT session_id)::int AS sessions,
          COUNT(DISTINCT user_email)::int AS users,
          COALESCE(ROUND(AVG(duration_ms) FILTER (WHERE event_type = 'page_view'))::int, 0) AS average_page_duration_ms,
          COALESCE(SUM(duration_ms) FILTER (WHERE event_type = 'page_view'), 0)::int AS total_page_duration_ms,
          COALESCE(ROUND(AVG(duration_ms) FILTER (WHERE event_type = 'click'))::int, 0) AS average_click_delay_ms
        FROM procure_guard_usage_events
        WHERE ${windowWhere}
      `),
        sql<QueryResultRow[]>(`
        SELECT
          path,
          COALESCE(NULLIF(MAX(page_title), ''), path) AS page_title,
          COUNT(*)::int AS views,
          COUNT(DISTINCT session_id)::int AS sessions,
          COALESCE(ROUND(AVG(duration_ms))::int, 0) AS average_duration_ms,
          COALESCE(SUM(duration_ms), 0)::int AS total_duration_ms,
          COALESCE(MAX(duration_ms), 0)::int AS longest_duration_ms
        FROM procure_guard_usage_events
        WHERE ${windowWhere}
          AND event_type = 'page_view'
        GROUP BY path
        ORDER BY total_duration_ms DESC, views DESC, path ASC
        LIMIT 20
      `),
        sql<QueryResultRow[]>(`
        WITH click_labels AS (
          SELECT
            path,
            target_tag,
            target_href,
            LEFT(COALESCE(NULLIF(TRIM(target_text), ''), NULLIF(TRIM(target_href), ''), NULLIF(TRIM(target_role), ''), NULLIF(TRIM(target_tag), ''), 'Unknown click'), 180) AS target_label,
            user_email,
            duration_ms
          FROM procure_guard_usage_events
          WHERE ${windowWhere}
            AND event_type = 'click'
        )
        SELECT
          target_label,
          COALESCE(target_tag, '') AS target_tag,
          target_href,
          path,
          COUNT(*)::int AS clicks,
          COUNT(DISTINCT user_email)::int AS users,
          COALESCE(ROUND(AVG(duration_ms))::int, 0) AS average_click_delay_ms,
          COALESCE(MAX(duration_ms), 0)::int AS slowest_click_delay_ms
        FROM click_labels
        GROUP BY target_label, target_tag, target_href, path
        ORDER BY clicks DESC, average_click_delay_ms DESC, target_label ASC
        LIMIT 30
      `),
        sql<QueryResultRow[]>(`
        SELECT
          COALESCE(user_email, 'Unknown') AS user_email,
          COALESCE(MAX(user_name), COALESCE(user_email, 'Unknown')) AS user_name,
          COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS page_views,
          COUNT(*) FILTER (WHERE event_type = 'click')::int AS clicks,
          COUNT(DISTINCT session_id)::int AS sessions,
          COALESCE(ROUND(AVG(duration_ms) FILTER (WHERE event_type = 'page_view'))::int, 0) AS average_page_duration_ms,
          COALESCE(ROUND(AVG(duration_ms) FILTER (WHERE event_type = 'click'))::int, 0) AS average_click_delay_ms,
          MAX(occurred_at) AS last_seen_at
        FROM procure_guard_usage_events
        WHERE ${windowWhere}
        GROUP BY user_email
        ORDER BY last_seen_at DESC
        LIMIT 25
      `),
        sql<QueryResultRow[]>(`
        SELECT id::int AS id, event_type, user_email, user_name, path, page_title, target_text, target_href, duration_ms, occurred_at
        FROM procure_guard_usage_events
        WHERE ${windowWhere}
        ORDER BY occurred_at DESC
        LIMIT 50
      `),
        // The two status lists were spelled out inside this SQL string, so adding a workflow stage
        // left this counter quietly behind. Derived from the same constants the workflow uses, and
        // bound as parameters the way the reminder job already does it.
        sql<QueryResultRow[]>(
          `
        SELECT (
          (SELECT COUNT(*) FROM procure_guard_adhoc_payments WHERE status IN (${adhocActiveStatuses.map(() => '?').join(', ')})) +
          (SELECT COUNT(*) FROM procure_guard_advance_payments WHERE status IN (${advanceActiveStatuses.map(() => '?').join(', ')}))
        )::int AS pending_review
      `,
          [...adhocActiveStatuses, ...advanceActiveStatuses],
        ),
      ],
    );

    return {
      actor,
      pending_review: Number(pendingRows[0]?.pending_review ?? 0),
      summary: serialise<ProcureGuardAdminAnalyticsData['summary']>(
        summaryRows[0] ?? {
          page_views: 0,
          clicks: 0,
          sessions: 0,
          users: 0,
          average_page_duration_ms: 0,
          total_page_duration_ms: 0,
          average_click_delay_ms: 0,
        },
      ),
      page_metrics: serialise<ProcureGuardAdminAnalyticsData['page_metrics']>(pageRows),
      click_metrics: serialise<ProcureGuardAdminAnalyticsData['click_metrics']>(clickRows),
      user_metrics: serialise<ProcureGuardAdminAnalyticsData['user_metrics']>(userRows),
      recent_events: serialise<ProcureGuardAdminAnalyticsData['recent_events']>(recentRows),
      generated_at: new Date().toISOString(),
    };
  } catch (err) {
    log.error('getProcureGuardAdminAnalyticsData.failed', err);
    return null;
  }
}
