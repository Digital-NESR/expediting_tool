import { Pool } from 'pg';

/**
 * One factory for every `pg` pool in the app.
 *
 * Before this, twelve `src/lib/db-*.ts` modules each hand-rolled the same
 * `new Pool({ host, port, user, password, ssl, ... })` block with its own `max`,
 * which declared 105 connections per serverless instance — roughly eight warm
 * Vercel instances away from exhausting the server's 859-connection budget.
 *
 * Two things must not drift here:
 *
 *  1. **Env resolution.** The modules do NOT all read the same variables. Nine
 *     read the platform-standard `DB_*` names; `db-sns.ts` accepts `DB_*` first
 *     and falls back to `POSTGRES_*`/`PGSSL`/`SnS_DB`; `db-sourceguide.ts` does
 *     the opposite, preferring `POSTGRES_*`/`PGSSL`. Getting this wrong costs a
 *     deployment its database, so each shape is preserved verbatim below as an
 *     `envStyle`, down to `??` vs `||` (they differ on an empty-string value).
 *     The *database name* stays with the calling module, because every tool has
 *     its own fallback chain.
 *
 *  2. **TLS.** `rejectUnauthorized: false` is carried over unchanged; tightening
 *     it is deferred pending an infrastructure decision.
 */

/** Which set of environment variables a pool resolves its credentials from. */
export type PoolEnvStyle = 'standard' | 'sns' | 'sourceguide';

/**
 * Default per-pool ceiling. Deliberately small: a serverless instance handles a
 * handful of concurrent requests, and the old double-digit `max` values only ever
 * mattered as a way to exhaust the shared server.
 */
export const DEFAULT_POOL_MAX = 3;

const IDLE_TIMEOUT_MS = 30000;
const CONNECTION_TIMEOUT_MS = 10000;

type SslConfig = false | { rejectUnauthorized: false };

interface Credentials {
  host: string | undefined;
  port: number;
  user: string | undefined;
  password: string | undefined;
  ssl: SslConfig;
}

function credentials(style: PoolEnvStyle): Credentials {
  switch (style) {
    // db-sns.ts: platform `DB_*` wins where present, local `POSTGRES_*`/`PGSSL`
    // names fill in. `??` (not `||`) — an explicitly empty DB_HOST still wins.
    case 'sns': {
      const sslFlag = process.env.DB_SSL ?? process.env.PGSSL ?? '';
      return {
        host: process.env.DB_HOST ?? process.env.POSTGRES_HOST,
        port: Number(process.env.DB_PORT ?? process.env.POSTGRES_PORT) || 5432,
        user: process.env.DB_USER ?? process.env.POSTGRES_USER,
        password: process.env.DB_PASSWORD ?? process.env.POSTGRES_PASSWORD,
        ssl: sslFlag === 'true' || sslFlag === 'require' ? { rejectUnauthorized: false } : false,
      };
    }
    // db-sourceguide.ts: `POSTGRES_*` first, `DB_*` as the fallback, and SSL on
    // if EITHER flag is 'true'.
    case 'sourceguide':
      return {
        host: process.env.POSTGRES_HOST || process.env.DB_HOST,
        port: Number(process.env.POSTGRES_PORT || process.env.DB_PORT) || 5432,
        user: process.env.POSTGRES_USER || process.env.DB_USER,
        password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
        ssl:
          process.env.PGSSL === 'true' || process.env.DB_SSL === 'true'
            ? { rejectUnauthorized: false }
            : false,
      };
    // Everything else: the platform-standard names only.
    default:
      return {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      };
  }
}

export interface CreatePoolOptions {
  /**
   * Cache key identifying this *logical* pool. Keyed on the tool, not on the
   * database name, so two tools pointed at the same database on purpose keep
   * separate pools (`pool` and `expeditingPool` may or may not coincide in
   * production; they stay distinct here).
   */
  key: string;
  /** Label used in the pool's `error` log line. Pass `null` for no handler. */
  label?: string | null;
  /** Per-pool connection ceiling. */
  max?: number;
  envStyle?: PoolEnvStyle;
  /** Called on each new physical connection — only TI-TE uses this. */
  onConnect?: () => void;
}

/**
 * Pools survive hot-module reload. Without this cache a dev server leaks a whole
 * pool on every edit to a module in the import graph, which is how a local
 * session ends up holding dozens of idle server connections.
 */
const POOL_CACHE_KEY = Symbol.for('nesr.sc-agents.pg-pools');

type PoolCarrier = typeof globalThis & { [POOL_CACHE_KEY]?: Map<string, Pool> };

function poolCache(): Map<string, Pool> {
  const carrier = globalThis as PoolCarrier;
  if (!carrier[POOL_CACHE_KEY]) carrier[POOL_CACHE_KEY] = new Map<string, Pool>();
  return carrier[POOL_CACHE_KEY];
}

/**
 * @param databaseName already-resolved database name (each module keeps its own
 *   env fallback chain, so this may legitimately be `undefined`).
 */
export function createPool(databaseName: string | undefined, options: CreatePoolOptions): Pool {
  const cache = poolCache();
  const cached = cache.get(options.key);
  if (cached) return cached;

  const { host, port, user, password, ssl } = credentials(options.envStyle ?? 'standard');

  const pool = new Pool({
    host,
    port,
    database: databaseName,
    user,
    password,
    ssl,
    max: options.max ?? DEFAULT_POOL_MAX,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });

  const label = options.label;
  if (label) {
    // An unhandled 'error' on an idle client crashes the process, so every pool
    // that had a handler keeps one. `db.ts` never had one; passing null preserves
    // that (see the follow-up note in src/lib/db.ts).
    pool.on('error', (err) => console.error(`[${label}] unexpected error:`, err));
  }
  if (options.onConnect) pool.on('connect', options.onConnect);

  cache.set(options.key, pool);
  return pool;
}
