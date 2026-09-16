'use server';

/*
 * Leaderboard backend for the Learning Hub "Red Bull Distribution Game" (a Beer-Game supply
 * chain simulator). Scores are posted from the game (running in an iframe) up to the wrapper,
 * which calls submitRedBullScore. Identity comes from the NextAuth session server-side — the
 * game never supplies the email. The leaderboard table lives in
 * database/migrations/learning-hub/001_baseline.sql; the calls below only assert it was applied.
 */

import type { QueryResultRow } from 'pg';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import learningHubPool from '@/lib/db-learning-hub';
import { createSqlHelpers } from '@/lib/db/sql';
import { requireSchema } from '@/lib/db/schema-version';

const GAME_KEY = 'red_bull_distribution';

/*
 * The game sends a small, fixed vocabulary: grades are Excellent/Solid/Choppy/Whiplashed, roles are
 * Retailer/Wholesaler/Distributor/Factory, patterns are step/seasonal/random. The longest of those is
 * eleven characters, so these caps leave room for labels the game may grow later while stopping a
 * tampered client from writing an essay into columns the leaderboard renders verbatim. An oversized
 * value is refused rather than trimmed, so a genuinely longer new label fails loudly here instead of
 * turning up mangled on the board.
 */
const MAX_GRADE_LEN = 16;
const MAX_LABEL_LEN = 32;
// A run is 20, 30 or 40 weeks today; the ceiling only has to keep the column sane.
const MAX_WEEKS = 520;
// Chain cost is a sum of holding and shortage charges, and the column is a 32-bit INTEGER.
const MAX_CHAIN_COST = 1_000_000_000;

const { sql } = createSqlHelpers(learningHubPool);

async function currentUser(): Promise<{ email: string; name: string } | null> {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || '').trim().toLowerCase();
  if (!email) return null;
  const name = (session?.user?.name || '').trim() || email.split('@')[0];
  return { email, name };
}

export interface RedBullScoreInput {
  score: number;
  grade?: string | null;
  chainCost?: number | null;
  role?: string | null;
  pattern?: string | null;
  weeks?: number | null;
  mode?: string | null;
}

export interface RedBullHistoryEntry {
  score: number;
  grade: string | null;
  role: string | null;
  pattern: string | null;
  weeks: number | null;
  mode: 'solo' | 'team';
  created_at: string;
}

export interface RedBullMeStats {
  best: number | null;
  plays: number;
  rank: number | null;
  avgScore: number | null;
  soloPlays: number;
  teamPlays: number;
  bestGrade: string | null;
}

export interface RedBullLeaderboardEntry {
  rank: number;
  player_name: string;
  score: number;
  grade: string | null;
  role: string | null;
  pattern: string | null;
  weeks: number | null;
  created_at: string;
  isMe: boolean;
}

export interface RedBullLeaderboard {
  top: RedBullLeaderboardEntry[];
  me: RedBullMeStats;
  history: RedBullHistoryEntry[];
}

/*
 * A field that is absent is fine and stores NULL; a field that is present but oversized or of the
 * wrong type fails the whole submission. Callers get a boolean back either way, so the shape stays
 * the same whichever branch rejects.
 */
type Checked<T> = { ok: true; value: T | null } | { ok: false };

function boundedText(v: unknown, max: number): Checked<string> {
  if (v == null) return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false };
  const trimmed = v.trim();
  if (!trimmed) return { ok: true, value: null };
  return trimmed.length <= max ? { ok: true, value: trimmed } : { ok: false };
}

function boundedInt(v: unknown, min: number, max: number): Checked<number> {
  if (v == null) return { ok: true, value: null };
  const n = Number(v);
  if (!Number.isFinite(n)) return { ok: false };
  const rounded = Math.round(n);
  return rounded >= min && rounded <= max ? { ok: true, value: rounded } : { ok: false };
}

export async function submitRedBullScore(input: RedBullScoreInput): Promise<{ success: boolean }> {
  try {
    await requireSchema(learningHubPool, 'learning-hub', '001_baseline');
    const user = await currentUser();
    if (!user) return { success: false };

    /*
     * Known limitation: the score cannot be trusted. The simulation runs entirely in the browser and
     * reports its own result, so anyone willing to open the console can post a perfect 100 without
     * playing. Proving a run happened would mean replaying the whole simulation server-side, which is
     * a rewrite of the game rather than a fix here. This is an internal training leaderboard and the
     * audit accepted the risk: read the board as a bit of fun, not as a record anything depends on.
     * The checks below only keep the stored row sane — they are not an anti-cheat measure.
     */
    const score = Number(input.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) return { success: false };

    const grade = boundedText(input.grade, MAX_GRADE_LEN);
    const role = boundedText(input.role, MAX_LABEL_LEN);
    const pattern = boundedText(input.pattern, MAX_LABEL_LEN);
    const weeks = boundedInt(input.weeks, 0, MAX_WEEKS);
    const chainCost = boundedInt(input.chainCost, 0, MAX_CHAIN_COST);
    if (!grade.ok || !role.ok || !pattern.ok || !weeks.ok || !chainCost.ok) {
      return { success: false };
    }

    const mode = input.mode === 'team' ? 'team' : 'solo';
    await sql(
      `INSERT INTO learning_game_scores
         (game_key, user_email, player_name, score, chain_cost, grade, role, pattern, weeks, mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        GAME_KEY,
        user.email,
        user.name,
        Math.round(score),
        chainCost.value,
        grade.value,
        role.value,
        pattern.value,
        weeks.value,
        mode,
      ],
    );
    return { success: true };
  } catch (err) {
    console.error('[submitRedBullScore]', err);
    return { success: false };
  }
}

/**
 * The top-25 board on its own. Split out of getRedBullLeaderboard() so the admin analytics page
 * (getRedBullGameStats) can ask for JUST the board: it used to call the whole leaderboard and throw
 * away `me` and `history`, paying for up to three extra queries against the admin's own scores.
 */
async function getRedBullTopScores(myEmail: string): Promise<RedBullLeaderboardEntry[]> {
  // Best run per player, ranked. The details shown are those of each player's best run.
  const rows = await sql<QueryResultRow[]>(
    `SELECT user_email,
            MAX(score) AS score,
            (ARRAY_AGG(player_name ORDER BY score DESC, created_at DESC))[1] AS player_name,
            (ARRAY_AGG(grade       ORDER BY score DESC, created_at DESC))[1] AS grade,
            (ARRAY_AGG(role        ORDER BY score DESC, created_at DESC))[1] AS role,
            (ARRAY_AGG(pattern     ORDER BY score DESC, created_at DESC))[1] AS pattern,
            (ARRAY_AGG(weeks       ORDER BY score DESC, created_at DESC))[1] AS weeks,
            (ARRAY_AGG(created_at  ORDER BY score DESC, created_at DESC))[1] AS created_at
     FROM learning_game_scores
     WHERE game_key = ?
     GROUP BY user_email
     ORDER BY score DESC, created_at ASC
     LIMIT 25`,
    [GAME_KEY],
  );

  return rows.map((r, i) => ({
    rank: i + 1,
    player_name: String(r.player_name || (r.user_email as string)?.split('@')[0] || 'Player'),
    score: Number(r.score),
    grade: (r.grade as string) ?? null,
    role: (r.role as string) ?? null,
    pattern: (r.pattern as string) ?? null,
    weeks: r.weeks == null ? null : Number(r.weeks),
    created_at: String(r.created_at),
    isMe: !!myEmail && String(r.user_email).toLowerCase() === myEmail,
  }));
}

export async function getRedBullLeaderboard(): Promise<RedBullLeaderboard> {
  try {
    await requireSchema(learningHubPool, 'learning-hub', '001_baseline');
    const user = await currentUser();
    const myEmail = user?.email ?? '';

    // Board + the viewer's own aggregate + the viewer's history are independent reads.
    const [top, mine, hist] = await Promise.all([
      getRedBullTopScores(myEmail),
      myEmail
        ? sql<QueryResultRow[]>(
            `SELECT COUNT(*)::int AS plays,
                    MAX(score) AS best,
                    ROUND(AVG(score))::int AS avg_score,
                    COUNT(*) FILTER (WHERE mode = 'team')::int AS team_plays,
                    COUNT(*) FILTER (WHERE mode IS DISTINCT FROM 'team')::int AS solo_plays,
                    (ARRAY_AGG(grade ORDER BY score DESC, created_at DESC))[1] AS best_grade
             FROM learning_game_scores WHERE game_key = ? AND user_email = ?`,
            [GAME_KEY, myEmail],
          )
        : Promise.resolve([] as QueryResultRow[]),
      myEmail
        ? sql<QueryResultRow[]>(
            `SELECT score, grade, role, pattern, weeks, mode, created_at
             FROM learning_game_scores WHERE game_key = ? AND user_email = ?
             ORDER BY created_at DESC LIMIT 20`,
            [GAME_KEY, myEmail],
          )
        : Promise.resolve([] as QueryResultRow[]),
    ]);

    let me: RedBullMeStats = {
      best: null,
      plays: 0,
      rank: null,
      avgScore: null,
      soloPlays: 0,
      teamPlays: 0,
      bestGrade: null,
    };
    let history: RedBullHistoryEntry[] = [];
    if (myEmail) {
      const best = mine[0]?.best == null ? null : Number(mine[0].best);
      const plays = Number(mine[0]?.plays ?? 0);
      let rank: number | null = null;
      if (best != null) {
        const rankRow = await sql<QueryResultRow[]>(
          `SELECT COUNT(*)::int AS ahead FROM (
             SELECT user_email, MAX(score) AS best
             FROM learning_game_scores WHERE game_key = ? GROUP BY user_email
           ) t WHERE t.best > ?`,
          [GAME_KEY, best],
        );
        rank = Number(rankRow[0]?.ahead ?? 0) + 1;
      }
      me = {
        best,
        plays,
        rank,
        avgScore: mine[0]?.avg_score == null ? null : Number(mine[0].avg_score),
        soloPlays: Number(mine[0]?.solo_plays ?? 0),
        teamPlays: Number(mine[0]?.team_plays ?? 0),
        bestGrade: (mine[0]?.best_grade as string) ?? null,
      };

      history = hist.map((h) => ({
        score: Number(h.score),
        grade: (h.grade as string) ?? null,
        role: (h.role as string) ?? null,
        pattern: (h.pattern as string) ?? null,
        weeks: h.weeks == null ? null : Number(h.weeks),
        mode: h.mode === 'team' ? 'team' : 'solo',
        created_at: String(h.created_at),
      }));
    }

    return { top, me, history };
  } catch (err) {
    console.error('[getRedBullLeaderboard]', err);
    return {
      top: [],
      me: {
        best: null,
        plays: 0,
        rank: null,
        avgScore: null,
        soloPlays: 0,
        teamPlays: 0,
        bestGrade: null,
      },
      history: [],
    };
  }
}

export interface RedBullGameStats {
  totalPlays: number;
  uniquePlayers: number;
  avgScore: number | null;
  bestScore: number | null;
  soloPlays: number;
  teamPlays: number;
  top: RedBullLeaderboardEntry[];
}

/** Aggregate stats + top leaderboard for the admin analytics page. */
export async function getRedBullGameStats(): Promise<RedBullGameStats> {
  try {
    await requireSchema(learningHubPool, 'learning-hub', '001_baseline');
    const user = await currentUser();
    const myEmail = user?.email ?? '';
    // Only the board is needed here. This used to call getRedBullLeaderboard() and discard its `me`
    // and `history`, which cost up to three extra queries on every admin analytics load.
    const [agg, top] = await Promise.all([
      sql<QueryResultRow[]>(
        `SELECT COUNT(*)::int AS total_plays,
                COUNT(DISTINCT user_email)::int AS unique_players,
                ROUND(AVG(score))::int AS avg_score,
                MAX(score) AS best_score,
                COUNT(*) FILTER (WHERE mode = 'team')::int AS team_plays,
                COUNT(*) FILTER (WHERE mode IS DISTINCT FROM 'team')::int AS solo_plays
         FROM learning_game_scores WHERE game_key = ?`,
        [GAME_KEY],
      ),
      getRedBullTopScores(myEmail),
    ]);
    const r = agg[0] ?? {};
    return {
      totalPlays: Number(r.total_plays ?? 0),
      uniquePlayers: Number(r.unique_players ?? 0),
      avgScore: r.avg_score == null ? null : Number(r.avg_score),
      bestScore: r.best_score == null ? null : Number(r.best_score),
      soloPlays: Number(r.solo_plays ?? 0),
      teamPlays: Number(r.team_plays ?? 0),
      top,
    };
  } catch (err) {
    console.error('[getRedBullGameStats]', err);
    return {
      totalPlays: 0,
      uniquePlayers: 0,
      avgScore: null,
      bestScore: null,
      soloPlays: 0,
      teamPlays: 0,
      top: [],
    };
  }
}
