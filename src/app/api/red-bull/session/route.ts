/*
 * Shared-session sync for the Learning Hub Red Bull Distribution Game (multiplayer).
 *
 * The game (a static app in an iframe) fetches these endpoints to read/write the one JSON blob
 * that is a live game. State lives in learning_game_sessions (learning_hub_db). Writes use
 * optimistic locking (a version column) so two players acting at once merge via client retry
 * instead of clobbering each other. Signed-in NESR users only — enforced here and by the proxy.
 *
 * learning_game_sessions is created by database/migrations/learning-hub/001_baseline.sql; the
 * requireSchema() calls below only assert that the migrations have been run.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import learningHubPool from '@/lib/db-learning-hub';
import { requireSchema } from '@/lib/db/schema-version';

export const dynamic = 'force-dynamic';

const GAME_KEY = 'red_bull_distribution';
const CODE_RE = /^[A-Z0-9]{4,8}$/;
const MAX_STATE_BYTES = 256 * 1024;
// A room is considered abandoned, and stops counting against its host, on the same schedule the
// cleanup below deletes it.
const ROOM_TTL = '12 hours';
// One person needs one room at a time; the slack is for retries and rooms they walked away from.
const MAX_ROOMS_PER_HOST = 10;
// Generous enough for a trainer-led session with a full classroom in it, since locking a real player
// out of a running game would be worse than the write it prevents.
const MAX_PARTICIPANTS = 40;

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
    await requireSchema(learningHubPool, 'learning-hub', '001_baseline');
    // Reading stays open to any signed-in user holding the code, because that is how a joiner sees
    // the room before the room knows them. Writing is where the roster check lives.
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

  const code = String(body?.code ?? '')
    .trim()
    .toUpperCase();
  const state = body?.state;
  if (!CODE_RE.test(code)) return NextResponse.json({ error: 'bad_code' }, { status: 400 });
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return NextResponse.json({ error: 'bad_state' }, { status: 400 });
  }
  // Measured in bytes, not in string length: .length counts UTF-16 code units, so a state full of
  // non-ASCII would sail past a limit meant to bound what actually reaches the column.
  if (Buffer.byteLength(JSON.stringify(state), 'utf8') > MAX_STATE_BYTES) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }

  try {
    await requireSchema(learningHubPool, 'learning-hub', '001_baseline');

    if (body.create) {
      // Opportunistic cleanup so abandoned rooms don't accumulate (fire-and-forget).
      learningHubPool
        .query(`DELETE FROM learning_game_sessions WHERE updated_at < NOW() - $1::interval`, [
          ROOM_TTL,
        ])
        .catch(() => {});

      /*
       * One host can only hold a handful of rooms open at once, so a script cannot fill the table by
       * calling create in a loop. Only rooms inside the TTL count: the cleanup above is
       * fire-and-forget, and a host should not be turned away over rooms that are already dead but
       * not yet deleted.
       */
      const live = await learningHubPool.query(
        `SELECT COUNT(*)::int AS n FROM learning_game_sessions
          WHERE game_key = $1 AND host_email = $2 AND updated_at > NOW() - $3::interval`,
        [GAME_KEY, email, ROOM_TTL],
      );
      if (Number(live.rows[0]?.n ?? 0) >= MAX_ROOMS_PER_HOST) {
        return NextResponse.json({ error: 'too_many_rooms' }, { status: 429 });
      }

      const ins = await learningHubPool.query(
        `INSERT INTO learning_game_sessions (code, game_key, host_email, state, version, participant_emails)
         VALUES ($1, $2, $3, $4, 1, ARRAY[$3::TEXT])
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

    /*
     * Writes are limited to the room's roster, and the roster is closed once it fills up. A caller
     * already on it, or the host, always gets through; anyone else is admitted only while there is
     * room left, and is recorded on the way in. That is as far as ownership can be enforced while the
     * code is the only thing a joiner presents: the game has no join step distinct from its first
     * write, and the player ids inside the state blob are random client-side strings with no link to
     * a signed-in identity. So a stranger who obtains a code can still take a seat in a half-empty
     * room — the same as a stranger who is handed the code legitimately — but they can no longer
     * wander into a room that is already full, and every writer is now on record.
     */
    const upd = await learningHubPool.query(
      `UPDATE learning_game_sessions
         SET state = $1,
             version = version + 1,
             updated_at = NOW(),
             participant_emails =
               CASE WHEN $5 = ANY(COALESCE(participant_emails, ARRAY[]::TEXT[]))
                    THEN participant_emails
                    ELSE COALESCE(participant_emails, ARRAY[]::TEXT[]) || $5::TEXT
               END
       WHERE code = $2 AND game_key = $3 AND version = $4
         AND (
           host_email = $5
           OR $5 = ANY(COALESCE(participant_emails, ARRAY[]::TEXT[]))
           OR COALESCE(ARRAY_LENGTH(participant_emails, 1), 0) < $6
         )
       RETURNING version`,
      [state, code, GAME_KEY, baseVersion, email, MAX_PARTICIPANTS],
    );
    if (upd.rows[0]) return NextResponse.json({ ok: true, version: upd.rows[0].version });

    // No row updated → the session is gone, another write bumped the version first, or the caller has
    // no claim on this room. The client retries a version conflict, so those must stay distinct.
    const cur = await learningHubPool.query(
      `SELECT state, version, host_email, participant_emails
         FROM learning_game_sessions WHERE code = $1 AND game_key = $2`,
      [code, GAME_KEY],
    );
    if (!cur.rows[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const row = cur.rows[0];
    const roster: string[] = row.participant_emails ?? [];
    const allowed =
      row.host_email === email || roster.includes(email) || roster.length < MAX_PARTICIPANTS;
    if (!allowed) return NextResponse.json({ error: 'not_a_participant' }, { status: 403 });

    return NextResponse.json(
      { conflict: true, state: row.state, version: row.version },
      { status: 409 },
    );
  } catch (err) {
    console.error('[red-bull session POST]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
