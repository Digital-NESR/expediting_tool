/*
 * catalog-manager 002 — proof-of-agreement files move from a base64 data URL to BYTEA.
 *
 * `entry_document.data_url` holds a whole `data:<mime>;base64,<payload>` string in a TEXT column,
 * and the only way to read a file back was a server action that returned the entire string to the
 * browser. Every other tool in this app stores the bytes in a BYTEA column and streams them from an
 * authenticated route handler; this brings the catalog into line.
 *
 * Base64 costs four characters per three bytes, so the encoded form is ~33% larger than the file it
 * carries. Moving to BYTEA is therefore a real storage saving as well as what makes the bytes
 * streamable: a 5 MB attachment stops being a ~6.7 MB TEXT value.
 *
 * `content_type` is split out of the data URL's own `data:<mime>;` prefix so the download route can
 * set a Content-Type header without re-parsing anything. Where the prefix is missing or empty the
 * column stays NULL and the download falls back to the extension (see `mimeTypeFor` in
 * src/lib/documents.ts), which is the same answer the old client-side `<a href="data:...">`
 * effectively produced.
 *
 * Idempotency: the two ALTERs are `IF NOT EXISTS`, and the backfill only touches rows where
 * `content IS NULL AND data_url IS NOT NULL`, so re-running this file is a no-op on rows it has
 * already converted and cannot overwrite bytes written since by the application.
 *
 * This file runs inside a transaction — nothing in it is one of the forms Postgres refuses there.
 */

ALTER TABLE entry_document ADD COLUMN IF NOT EXISTS content BYTEA;
ALTER TABLE entry_document ADD COLUMN IF NOT EXISTS content_type TEXT;

/*
 * Backfill.
 *
 * `decode(..., 'base64')` RAISES on a malformed payload, and a raised error aborts the whole
 * migration transaction — one junk row from a half-finished upload would leave every other row
 * unconverted. There is no `try` inside an UPDATE, so the approach is to make it impossible for
 * decode() to be handed anything it could choke on:
 *
 *   - `split` peels the payload off after the first comma, and yields NULL when there is no comma
 *     at all (nothing that could be a payload);
 *   - `decodable` passes that payload through only if it is non-empty, contains nothing but base64
 *     characters plus up to two '=' pads, and has a length that is a multiple of four — the two
 *     things decode() rejects ("invalid symbol" and "invalid base64 end sequence"). Anything else
 *     becomes NULL.
 *
 * So the only values decode() can ever see are a payload already proved well-formed, or NULL — and
 * decode() is strict, so NULL in means NULL out rather than an error. That holds however the
 * planner chooses to order the filter and the projection, which a guard written as a WHERE clause
 * on the UPDATE would only have held by convention.
 *
 * A row that fails the guard keeps `content IS NULL` and its `data_url` untouched, so nothing is
 * lost and a later run (or a hand-written fix) can still convert it.
 */
WITH split AS (
  SELECT
    id,
    NULLIF(SUBSTRING(data_url FROM '^data:([^;,]*)'), '') AS mime,
    CASE
      WHEN POSITION(',' IN data_url) > 0
        THEN SUBSTRING(data_url FROM POSITION(',' IN data_url) + 1)
    END AS payload
  FROM entry_document
  WHERE content IS NULL
    AND data_url IS NOT NULL
),
decodable AS (
  SELECT
    id,
    mime,
    CASE
      WHEN payload ~ '^[A-Za-z0-9+/]+={0,2}$' AND LENGTH(payload) % 4 = 0
        THEN payload
    END AS payload
  FROM split
)
UPDATE entry_document d
SET content = DECODE(p.payload, 'base64'),
    content_type = p.mime
FROM decodable p
WHERE d.id = p.id
  AND p.payload IS NOT NULL;

/* Say out loud how many rows the guard above refused, so a stranded upload is noticed rather than
   quietly turning into a "sample" placeholder in the UI (the detail page shows a download button
   only when the file bytes are present). */
DO $$
DECLARE
  stranded INTEGER;
BEGIN
  SELECT COUNT(*) INTO stranded FROM entry_document WHERE content IS NULL AND data_url IS NOT NULL;
  IF stranded > 0 THEN
    RAISE NOTICE '% entry_document row(s) have a data_url that could not be base64-decoded and were left unconverted', stranded;
  END IF;
END
$$;

/*
 * `data_url` is deliberately NOT dropped here.
 *
 * Dropping a column is irreversible, and nobody has yet compared this backfill against production
 * data. Until that check has been done the old column is the only copy of anything the guard above
 * refused, so it stays. From the moment this migration runs the application neither reads nor
 * writes `data_url` — it is dead weight, kept on purpose.
 *
 * Follow-up: once the backfill has been verified against production (every row with a data_url has
 * a matching non-NULL content of the expected length, and nothing was reported stranded by the
 * notice above), add a `003_entry_document_drop_data_url.sql` that does
 * `ALTER TABLE entry_document DROP COLUMN IF EXISTS data_url;` and reclaims the space.
 */
