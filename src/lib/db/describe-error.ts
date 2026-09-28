/**
 * Say what a database failure actually was.
 *
 * `err.message` is the obvious thing to log, and it is empty for the commonest failure of all.
 * When a host resolves to several addresses and every one of them fails, Node reports a single
 * `AggregateError` whose own message is the empty string and whose real causes sit in `.errors`.
 * A catch that logged `err.message` therefore wrote `error: ""` into the log and told whoever
 * read it nothing: not which host, not refused against unreachable, not even that it was the
 * network rather than the query.
 *
 * Pure, and deliberately not throwing on anything it is handed: it exists to be called from a
 * `catch`, and a describer that can itself fail turns a logged failure into a lost one.
 */

/** Sentences for the codes that mean something an operator can act on. */
const MEANING: Record<string, string> = {
  ECONNREFUSED: 'nothing is listening on that host and port',
  ENOTFOUND: 'the host name does not resolve',
  ETIMEDOUT: 'the host accepted no connection before the timeout',
  EHOSTUNREACH: 'the host cannot be routed to',
  ECONNRESET: 'the connection was closed by the other end',
  EPIPE: 'the connection was closed while the query was in flight',
  '28P01': 'the password was rejected',
  '28000': 'the server refused this user or client address, check pg_hba.conf',
  '3D000': 'the database does not exist',
  '53300': 'the server is out of connection slots',
};

function codeOf(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code ? code : null;
}

function one(err: unknown): string {
  const code = codeOf(err);
  const message = err instanceof Error ? err.message.trim() : String(err ?? '').trim();
  const meaning = code ? MEANING[code] : undefined;
  if (code && meaning) return `${code}, ${meaning}`;
  if (code && message) return `${message} (${code})`;
  return code ?? message ?? 'unknown error';
}

export function describeDbError(err: unknown): string {
  // AggregateError first: it is the case that produced an empty string, and its own message is
  // almost never the interesting part even when it has one.
  const nested = (err as { errors?: unknown } | null)?.errors;
  if (Array.isArray(nested) && nested.length) {
    // One address refused and another timing out are two different problems; repeated identical
    // causes are one problem reported twice, so they collapse.
    const parts = [...new Set(nested.map(one))];
    const own = err instanceof Error && err.message.trim() ? `${err.message.trim()}: ` : '';
    return `${own}${parts.join('; ')}`;
  }
  return one(err);
}
