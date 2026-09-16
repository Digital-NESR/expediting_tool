-- migrate:no-transaction
/*
 * Add `scoped` to vendor_cycle_status.
 *
 * The enum went straight to `requested`, which left no way to say "this vendor is in scope and
 * nobody has written to them yet" — the state every vendor is in for the stretch between a
 * champion scoping their country and actually sending the first request. That state was being
 * carried by a `requested` row with a NULL `requested_at`, which works but has to be explained to
 * every reader, and reads as a request already sent to anyone who does not know the convention.
 *
 * It sorts before `requested` in the enum's own order, so ORDER BY status walks the pipeline.
 *
 * Runs outside a transaction: Postgres refuses ALTER TYPE ... ADD VALUE inside one when the value
 * might be used later in the same transaction. Nothing here uses it — 005 backfills.
 */
ALTER TYPE vendor_cycle_status ADD VALUE IF NOT EXISTS 'scoped' BEFORE 'requested';
