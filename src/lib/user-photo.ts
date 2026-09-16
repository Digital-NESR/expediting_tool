import pool from '@/lib/db';
import { requireSchema } from '@/lib/db/schema-version';

/* ── Profile photo store ──────────────────────────────────────────
   The Microsoft Graph avatar used to be inlined into the session JWT
   as a base64 data: URI. NextAuth encrypts the JWT into a cookie, so
   that one field added several kilobytes to EVERY request (and to
   every proxy decrypt). The bytes now live here and are served
   by /api/me/photo, which the session points at instead; the token
   carries a single boolean.

   The `user_photos` table itself is in
   database/migrations/default/001_baseline.sql. It used to be created
   lazily on first use, from a `DDL` constant behind a `let ensured`
   memo; the calls below now assert the migration has run instead. */

/** Store (or replace) one user's avatar. `email` must already be normalized. */
export async function saveUserPhoto(
  email: string,
  photo: Buffer,
  contentType = 'image/jpeg',
): Promise<boolean> {
  if (!email || photo.length === 0) return false;
  try {
    await requireSchema(pool, 'default', '001_baseline');
    await pool.query(
      `INSERT INTO user_photos (email, photo, content_type, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (email) DO UPDATE
         SET photo = EXCLUDED.photo,
             content_type = EXCLUDED.content_type,
             updated_at = now()`,
      [email, photo, contentType],
    );
    return true;
  } catch (err) {
    console.error('[user-photo] save failed:', err);
    return false;
  }
}

/** Read one user's avatar. `email` must already be normalized. */
export async function getUserPhoto(
  email: string,
): Promise<{ photo: Buffer; contentType: string } | null> {
  if (!email) return null;
  try {
    await requireSchema(pool, 'default', '001_baseline');
    const { rows } = await pool.query<{ photo: Buffer; content_type: string }>(
      `SELECT photo, content_type FROM user_photos WHERE email = $1`,
      [email],
    );
    if (!rows[0]) return null;
    return { photo: rows[0].photo, contentType: rows[0].content_type || 'image/jpeg' };
  } catch (err) {
    console.error('[user-photo] read failed:', err);
    return null;
  }
}

/** Parse a legacy `data:image/...;base64,...` token value into bytes. */
export function parseDataUri(value: string): { photo: Buffer; contentType: string } | null {
  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(value);
  if (!m) return null;
  try {
    return { photo: Buffer.from(m[2], 'base64'), contentType: m[1] };
  } catch {
    return null;
  }
}
