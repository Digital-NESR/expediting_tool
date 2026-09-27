/**
 * The address a supplier is sent to upload their statement.
 *
 * A plain module, not `'use server'` — see the note in `./db`.
 *
 * Kept in one place because the letter and the upload route have to agree on it exactly: a link
 * that renders one way in the email and is parsed another way on arrival is a supplier who cannot
 * return their statement and a champion who cannot see why.
 */

export class AppUrlNotConfiguredError extends Error {
  constructor() {
    super(
      'NEXT_PUBLIC_APP_URL is unset or is not an absolute http(s) URL, so the upload link in the ' +
        'letter would not resolve. Nothing has been sent.',
    );
    this.name = 'AppUrlNotConfiguredError';
  }
}

/**
 * The base the links are built on.
 *
 * A relative or missing value is fatal rather than cosmetic here, exactly as it is for PO
 * Expediting: the link leaves the building. A supplier who receives `/soa-upload/…` has received
 * nothing, and they have no way to tell us so.
 */
function appBase(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '');
  if (!raw) throw new AppUrlNotConfiguredError();
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new AppUrlNotConfiguredError();
    }
  } catch {
    throw new AppUrlNotConfiguredError();
  }
  return raw;
}

/** Where a vendor uploads the statement for one cycle. */
export function uploadLinkFor(uploadToken: string): string {
  return `${appBase()}/soa-upload/${uploadToken}`;
}
