/**
 * Structured server-side logging.
 *
 * The codebase had ~285 `console.error` and ~51 `console.log` calls with ad-hoc
 * bracket prefixes, several of them dumping PII (every pending requester's
 * email, name and job title on each admin panel load) or remote response bodies
 * onto hot paths. This gives them one shape, one level gate, and redaction.
 *
 * Output is a single JSON line per event, which Vercel's log viewer parses into
 * structured fields and every log drain (Azure Monitor, Datadog, Better Stack)
 * ingests without a parser. No dependency, so nothing to install or upgrade.
 *
 *   const log = logger('procure-guard');
 *   log.info('status.updated', { requestId, actor: actor.email, from, to });
 *   log.error('webhook.failed', err, { requestId });
 *
 * Choose the destination later by pointing a drain at stdout; the shape does not
 * need to change. `LOG_LEVEL` (error|warn|info|debug) overrides the default,
 * which is `info` — audit-worthy events such as approvals and deletes are
 * deliberately above the default threshold so they survive in production.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

function activeLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? '').trim().toLowerCase();
  if (raw === 'error' || raw === 'warn' || raw === 'info' || raw === 'debug') return raw;
  return 'info';
}

/** Field names whose values are never safe to log, matched case-insensitively. */
const SECRET_KEY = /pass|secret|token|authorization|cookie|credential|apikey|api_key/i;

/** Long strings are truncated: a logged webhook body should not become the log. */
const MAX_STRING = 300;
const MAX_ARRAY = 20;

function redact(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[${value.length}]` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= 4) return '[depth]';
  if (Array.isArray(value)) {
    const head = value.slice(0, MAX_ARRAY).map(v => redact(v, depth + 1));
    return value.length > MAX_ARRAY ? [...head, `…+${value.length - MAX_ARRAY} more`] : head;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/** Errors do not survive JSON.stringify, so pull the useful parts out by hand. */
function describeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const out: Record<string, unknown> = { message: err.message, name: err.name };
    const code = (err as { code?: unknown }).code;
    if (code != null) out.code = String(code);
    if (process.env.NODE_ENV !== 'production' && err.stack) out.stack = err.stack;
    return out;
  }
  return { message: String(err) };
}

export interface Logger {
  error(event: string, err?: unknown, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  debug(event: string, fields?: Record<string, unknown>): void;
  /** A child logger carrying fields every later call should repeat. */
  with(fields: Record<string, unknown>): Logger;
}

function emit(level: LogLevel, tool: string, bound: Record<string, unknown>, event: string, fields?: Record<string, unknown>, err?: unknown): void {
  if (ORDER[level] > ORDER[activeLevel()]) return;
  const line: Record<string, unknown> = {
    level,
    tool,
    event,
    ...(redact({ ...bound, ...(fields ?? {}) }) as Record<string, unknown>),
  };
  if (err !== undefined) line.error = describeError(err);
  const text = JSON.stringify(line);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

/** A logger for one tool or subsystem, e.g. `logger('procure-guard')`. */
export function logger(tool: string, bound: Record<string, unknown> = {}): Logger {
  return {
    error: (event, err, fields) => emit('error', tool, bound, event, fields, err ?? null),
    warn: (event, fields) => emit('warn', tool, bound, event, fields),
    info: (event, fields) => emit('info', tool, bound, event, fields),
    debug: (event, fields) => emit('debug', tool, bound, event, fields),
    with: (fields) => logger(tool, { ...bound, ...fields }),
  };
}
