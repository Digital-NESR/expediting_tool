/*
 * Shared-session sync for the Learning Hub Red Bull Distribution Game (multiplayer).
 *
 * The game (a static app in an iframe) fetches these endpoints to read/write the one JSON blob
 * that is a live game. State lives in learning_game_sessions (learning_hub_db). Writes use
 * optimistic locking (a version column) so two players acting at once merge via client retry
 * instead of clobbering each other. Signed-in NESR users only — enforced here and by middleware.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import learningHubPool from '@/lib/db-learning-hub';

export const dynamic = 'force-dynamic';

const GAME_KEY = 'red_bull_distribution';
const CODE_RE = /^[A-Z0-9]{4,8}$/;
const MAX_STATE_BYTES = 256 * 1024;

let schemaReady: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await learningHubPool.query(`
        CREATE TABLE IF NOT EXISTS learning_game_sessions (
          code TEXT PRIMARY KEY,
          game_key TEXT NOT NULL DEFAULT 'red_bull_distribution',
          host_email TEXT,
          state JSONB NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
      await learningHubPool.query(
        `CREATE INDEX IF NOT EXISTS idx_lgsess_updated ON learning_game_sessions (updated_at)`,
      );
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

async function requireUserEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  return email || null;
}

export async function GET(req: NextRequest) {
  const email = await requireUserEmail();
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const code = (req.nextUrl.searchParams.get('code') || '').trim().toUpperCase();
  if (!CODE_RE.test(code)) return NextResponse.json({ error: 'bad_code' }, { status: 400 });

  try {
    await ensureSchema();
    const r = await learningHubPool.query(
      `SELECT state, version FROM learning_game_sessions WHERE code = $1 AND game_key = $2`,
      [code, GAME_KEY],
    );
    if (!r.rows[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ state: r.rows[0].state, version: r.rows[0].version });
  } catch (err) {
    console.error('[red-bull session GET]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const email = await requireUserEmail();
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: {
    code?: unknown;
    state?: unknown;
    create?: unknown;
    baseVersion?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const code = String(body?.code ?? '').trim().toUpperCase();
  const state = body?.state;
  if (!CODE_RE.test(code)) return NextResponse.json({ error: 'bad_code' }, { status: 400 });
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return NextResponse.json({ error: 'bad_state' }, { status: 400 });
  }
  if (JSON.stringify(state).length > MAX_STATE_BYTES) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }

  try {
    await ensureSchema();

    if (body.create) {
      // Opportunistic cleanup so abandoned rooms don't accumulate (fire-and-forget).
      learningHubPool
        .query(`DELETE FROM learning_game_sessions WHERE updated_at < NOW() - INTERVAL '12 hours'`)
        .catch(() => {});
      const ins = await learningHubPool.query(
        `INSERT INTO learning_game_sessions (code, game_key, host_email, state, version)
         VALUES ($1, $2, $3, $4, 1)
         ON CONFLICT (code) DO NOTHING
         RETURNING version`,
        [code, GAME_KEY, email, state],
      );
      if (!ins.rows[0]) return NextResponse.json({ error: 'code_exists' }, { status: 409 });
      return NextResponse.json({ ok: true, version: ins.rows[0].version });
    }

    const baseVersion = Number(body.baseVersion);
    if (!Number.isFinite(baseVersion)) {
      return NextResponse.json({ error: 'bad_version' }, { status: 400 });
    }

    const upd = await learningHubPool.query(
      `UPDATE learning_game_sessions
         SET state = $1, version = version + 1, updated_at = NOW()
       WHERE code = $2 AND game_key = $3 AND version = $4
       RETURNING version`,
      [state, code, GAME_KEY, baseVersion],
    );
    if (upd.rows[0]) return NextResponse.json({ ok: true, version: upd.rows[0].version });

    // No row updated → either the session is gone or another write bumped the version first.
    const cur = await learningHubPool.query(
      `SELECT state, version FROM learning_game_sessions WHERE code = $1 AND game_key = $2`,
      [code, GAME_KEY],
    );
    if (!cur.rows[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(
      { conflict: true, state: cur.rows[0].state, version: cur.rows[0].version },
      { status: 409 },
    );
  } catch (err) {
    console.error('[red-bull session POST]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
