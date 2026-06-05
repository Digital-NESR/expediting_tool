import { NextResponse } from 'next/server';
import { getProcureGuardUser } from '@/lib/auth';
import procureGuardPool from '@/lib/db-procureguard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type TrackingPayload = {
  session_id?: unknown;
  event_type?: unknown;
  path?: unknown;
  page_title?: unknown;
  target_tag?: unknown;
  target_text?: unknown;
  target_href?: unknown;
  target_role?: unknown;
  duration_ms?: unknown;
  occurred_at?: unknown;
  metadata?: unknown;
};

async function ensureUsageTable(): Promise<void> {
  async function querySchema(statement: string) {
    try {
      await procureGuardPool.query(statement);
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
      if (code !== '23505' && code !== '42P07' && code !== '42710') throw err;
    }
  }

  await querySchema(`
    CREATE TABLE IF NOT EXISTS procure_guard_usage_events (
      id BIGSERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_email TEXT,
      user_name TEXT,
      event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'click')),
      path TEXT NOT NULL,
      page_title TEXT,
      target_tag TEXT,
      target_text TEXT,
      target_href TEXT,
      target_role TEXT,
      duration_ms INTEGER,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await querySchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_usage_events_occurred_at ON procure_guard_usage_events (occurred_at DESC)`);
  await querySchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_usage_events_path ON procure_guard_usage_events (path)`);
  await querySchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_usage_events_user ON procure_guard_usage_events (user_email)`);
  await querySchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_usage_events_type ON procure_guard_usage_events (event_type)`);
}

function cleanText(value: unknown, fallback = ''): string {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim().slice(0, 500);
}

function cleanOptionalText(value: unknown): string | null {
  const text = cleanText(value);
  return text ? text : null;
}

function cleanDuration(value: unknown): number | null {
  const duration = Math.round(Number(value));
  if (!Number.isFinite(duration) || duration < 0) return null;
  return Math.min(duration, 24 * 60 * 60 * 1000);
}

function cleanMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function POST(request: Request) {
  try {
    const user = await getProcureGuardUser();
    if (!user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json() as TrackingPayload;
    const eventType = cleanText(payload.event_type);
    if (eventType !== 'page_view' && eventType !== 'click') {
      return NextResponse.json({ success: false, error: 'Invalid event type' }, { status: 400 });
    }

    const path = cleanText(payload.path, '/procure-guard');
    const sessionId = cleanText(payload.session_id);
    if (!sessionId || !path.startsWith('/procure-guard')) {
      return NextResponse.json({ success: false, error: 'Invalid tracking event' }, { status: 400 });
    }

    await ensureUsageTable();

    await procureGuardPool.query(
      `INSERT INTO procure_guard_usage_events (
         session_id, user_email, user_name, event_type, path, page_title,
         target_tag, target_text, target_href, target_role, duration_ms, occurred_at, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12::timestamptz, NOW()), $13::jsonb)`,
      [
        sessionId,
        user.email.toLowerCase(),
        user.name ?? user.email,
        eventType,
        path.slice(0, 500),
        cleanOptionalText(payload.page_title),
        cleanOptionalText(payload.target_tag),
        cleanOptionalText(payload.target_text),
        cleanOptionalText(payload.target_href),
        cleanOptionalText(payload.target_role),
        cleanDuration(payload.duration_ms),
        typeof payload.occurred_at === 'string' ? payload.occurred_at : null,
        JSON.stringify(cleanMetadata(payload.metadata)),
      ],
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[ProcureGuard tracking]', err);
    return NextResponse.json({ success: false, error: 'Tracking failed' }, { status: 500 });
  }
}
