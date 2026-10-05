/*
 * Favourites: the tools a person pins to the top of their home page.
 *
 * The launcher now carries fifteen cards across two grids and a search box, and the handful
 * somebody opens every morning are scattered through an alphabetical list with everything they
 * have never used. Pinning is the cheap fix, and it has to follow the person rather than the
 * browser: the same employee opens this on a laptop, a shared machine in a workshop and a phone,
 * and a favourites list that lived in localStorage would be three different lists.
 *
 * One row per person per tool, with the composite key doing the de-duplication, so pinning twice
 * is not an error and does not need checking for. `pinned_at` is what the section orders by, so
 * the newest pin lands first and the list reads as a history of what somebody reached for.
 *
 * `tool_id` is the launcher's own card id, which lives in src/app/home/tools.tsx. There is no
 * foreign key to point it at, so the writing action validates against that list instead; a card
 * that is later renamed or removed leaves rows here that match nothing, and the read side drops
 * them rather than rendering a gap. That is deliberate: a tool coming back under its old id
 * should find its pins intact.
 */
CREATE TABLE IF NOT EXISTS home_favourites (
  user_email VARCHAR(200) NOT NULL,
  tool_id    VARCHAR(64)  NOT NULL,
  pinned_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_email, tool_id)
);

/* The only query this table serves: one person's pins, newest first. */
CREATE INDEX IF NOT EXISTS idx_home_favourites_user
  ON home_favourites (user_email, pinned_at DESC);
