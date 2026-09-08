'use server';

/*
 * Leaderboard backend for the Learning Hub "Red Bull Distribution Game" (a Beer-Game supply
 * chain simulator). Scores are posted from the game (running in an iframe) up to the wrapper,
 * which calls submitRedBullScore. Identity comes from the NextAuth session server-side — the
 * game never supplies the email. Schema is created in code, idempotently (house pattern).
 */

import type { QueryResultRow } from 'pg';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import learningHubPool from '@/lib/db-learning-hub';

const GAME_KEY = 'red_bull_distribution';

type QueryParams = (string | number | boolean | null | undefined)[];

function toPostgresQuery(statement: string): string {
  let index = 0;
  return statement.replace(/\?/g, () => `$${++index}`);
}
async function sql<T extends QueryResultRow[]>(statement: string, params: QueryParams = []): Promise<T> {
  const result = await learningHubPool.query(
    toPostgresQuery(statement),
    params.map((v) => (v === undefined ? null : v)),
  );
  return JSON.parse(JSON.stringify(result.rows)) as T;
}

let schemaReady: Promise<void> | null = null;
async function ensureGameSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await learningHubPool.query(`
        CREATE TABLE IF NOT EXISTS learning_game_scores (
          id SERIAL PRIMARY KEY,
          game_key TEXT NOT NULL DEFAULT 'red_bull_distribution',
          user_email TEXT NOT NULL,
          player_name TEXT,
          score INTEGER NOT NULL,
          chain_cost INTEGER,
          grade TEXT,
          role TEXT,
          pattern TEXT,
          weeks INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
      await learningHubPool.query(
        `CREATE INDEX IF NOT EXISTS idx_lgs_game_score ON learning_game_scores (game_key, score DESC)`,
      );
      // Solo vs team runs (added later; existing rows default to 'solo').
      await learningHubPool.query(
        `ALTER TABLE learning_game_scores ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'solo'`,
      );
      await learningHubPool.query(
        `CREATE INDEX IF NOT EXISTS idx_lgs_user ON learning_game_scores (game_key, user_email, created_at DESC)`,
      );
    })().catch((err) => {
      // Don't let one failed attempt permanently wedge a warm serverless instance.
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

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

function toIntOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export async function submitRedBullScore(input: RedBullScoreInput): Promise<{ success: boolean }> {
  try {
    await ensureGameSchema();
    const user = await currentUser();
    if (!user) return { success: false };

    const score = Number(input.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) return { success: false };

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
        toIntOrNull(input.chainCost),
        input.grade ?? null,
        input.role ?? null,
        input.pattern ?? null,
        toIntOrNull(input.weeks),
        mode,
      ],
    );
    return { success: true };
  } catch (err) {
    console.error('[submitRedBullScore]', err);
    return { success: false };
  }
}

export async function getRedBullLeaderboard(): Promise<RedBullLeaderboard> {
  try {
    await ensureGameSchema();
    const user = await currentUser();
    const myEmail = user?.email ?? '';

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

    const top: RedBullLeaderboardEntry[] = rows.map((r, i) => ({
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

    let me: RedBullMeStats = { best: null, plays: 0, rank: null, avgScore: null, soloPlays: 0, teamPlays: 0, bestGrade: null };
    let history: RedBullHistoryEntry[] = [];
    if (myEmail) {
      const mine = await sql<QueryResultRow[]>(
        `SELECT COUNT(*)::int AS plays,
                MAX(score) AS best,
                ROUND(AVG(score))::int AS avg_score,
                COUNT(*) FILTER (WHERE mode = 'team')::int AS team_plays,
                COUNT(*) FILTER (WHERE mode IS DISTINCT FROM 'team')::int AS solo_plays,
                (ARRAY_AGG(grade ORDER BY score DESC, created_at DESC))[1] AS best_grade
         FROM learning_game_scores WHERE game_key = ? AND user_email = ?`,
        [GAME_KEY, myEmail],
      );
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
        best, plays, rank,
        avgScore: mine[0]?.avg_score == null ? null : Number(mine[0].avg_score),
        soloPlays: Number(mine[0]?.solo_plays ?? 0),
        teamPlays: Number(mine[0]?.team_plays ?? 0),
        bestGrade: (mine[0]?.best_grade as string) ?? null,
      };

      const hist = await sql<QueryResultRow[]>(
        `SELECT score, grade, role, pattern, weeks, mode, created_at
         FROM learning_game_scores WHERE game_key = ? AND user_email = ?
         ORDER BY created_at DESC LIMIT 20`,
        [GAME_KEY, myEmail],
      );
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
    return { top: [], me: { best: null, plays: 0, rank: null, avgScore: null, soloPlays: 0, teamPlays: 0, bestGrade: null }, history: [] };
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
    await ensureGameSchema();
    const agg = await sql<QueryResultRow[]>(
      `SELECT COUNT(*)::int AS total_plays,
              COUNT(DISTINCT user_email)::int AS unique_players,
              ROUND(AVG(score))::int AS avg_score,
              MAX(score) AS best_score,
              COUNT(*) FILTER (WHERE mode = 'team')::int AS team_plays,
              COUNT(*) FILTER (WHERE mode IS DISTINCT FROM 'team')::int AS solo_plays
       FROM learning_game_scores WHERE game_key = ?`,
      [GAME_KEY],
    );
    const board = await getRedBullLeaderboard();
    const r = agg[0] ?? {};
    return {
      totalPlays: Number(r.total_plays ?? 0),
      uniquePlayers: Number(r.unique_players ?? 0),
      avgScore: r.avg_score == null ? null : Number(r.avg_score),
      bestScore: r.best_score == null ? null : Number(r.best_score),
      soloPlays: Number(r.solo_plays ?? 0),
      teamPlays: Number(r.team_plays ?? 0),
      top: board.top,
    };
  } catch (err) {
    console.error('[getRedBullGameStats]', err);
    return { totalPlays: 0, uniquePlayers: 0, avgScore: null, bestScore: null, soloPlays: 0, teamPlays: 0, top: [] };
  }
}
