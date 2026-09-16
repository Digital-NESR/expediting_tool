-- migrate:no-transaction
/*
 * Add `viewer` to soa_user_role.
 *
 * The schema was designed with two roles, champion and manager. The access-request flow offers a
 * third: someone who needs to see a country's progress and its evidence trail but takes no action
 * on it — finance staff and auditors, mostly. Making them champions to let them look would give
 * them the ability to mark vendors as non-responders, which is a decision with consequences.
 *
 * `manager` stays in the enum but is deliberately NOT requestable: managers are set in a matrix on
 * the /admin page, the way ProcureGuard's approvers are. `admin` is not in the enum at all — it
 * comes from ADMIN_EMAILS, so it is a property of the platform rather than of this tool.
 *
 * This file runs outside a transaction because Postgres refuses ALTER TYPE ... ADD VALUE inside
 * one when the new value might be used later in the same transaction. Nothing here reads the value
 * back, and the runner sends a no-transaction file one statement at a time, so no implicit
 * transaction wraps it either.
 */
ALTER TYPE soa_user_role ADD VALUE IF NOT EXISTS 'viewer';
