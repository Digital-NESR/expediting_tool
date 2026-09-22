# S&S Registry — backend reference

Single & Sole Source Registry. This file covers what the backend stores, what it
sends to n8n, and what has to be configured before any of it works.

Schema lives in `database/migrations/sns/`, applied by `npm run migrate` (and
by `npm run build`, which runs it first). This feature adds `002` (approvers,
supplier master, attachments, reminder log) and `003` (the classification
swap).

---

## Where the data comes from

| Concern | Source | Maintained in |
|---|---|---|
| Taxonomy (Category › Sub-Category › Family › Commodity) | `sg_commodities` in **sourceguide_db** | /admin → SourceGuide → Spend Taxonomy |
| Countries, segments, reason codes | `sns_country` / `sns_segment` / `sns_reason` | /admin → S&S Registry → Reference Data |
| Level 1 approvers | `sns_country_manager` (keyed on `sns_country.code`) | /admin → S&S Registry → Approvers |
| Level 2 approvers | `sns_category_manager` | /admin → S&S Registry → Approvers |
| Suppliers | `sns_supplier` | Written by the registry when a record is raised |
| Records, scope, audit trail | `sns_record` + `sns_record_node` / `_segment` / `_history` | The tool itself |
| Attachments | `sns_record_document` (BYTEA) | The tool itself |
| Reminder log | `sns_notification_log` | Written by the n8n reminder workflow |

The taxonomy is the one cross-database read. `sns_category`, `sns_sub_category`,
`sns_family` and `sns_commodity` still exist but **are no longer read** — they
are kept only as a record of the tree as it stood for records raised before the
switch. Scope is denormalised onto `sns_record_node` as text either way, so no
existing record depends on them.

---

## Approvals

Two levels, both resolved by **email address**, not by role alone.

**Level 1** — the Country Supply Chain Manager for the record's country, keyed
on `sns_country.code` rather than the display name: names are editable
reference data and a rename must not orphan an approver. One per country.

**Level 2** — the Category Manager for any category the record touches, *or* any
Supply Chain Director. A record may span several categories; **any one** of the
resolved approvers may sign it off. Directors are rows in
`sns_category_manager` with `category IS NULL`.

### The unassigned fallback

If a country or category has nobody assigned, the gate falls back to the role
grant alone and logs a warning — anyone holding the validator role can sign off,
and nobody is emailed by name. This stops records deadlocking before the
approver lists are loaded. It stops applying on its own once they are.

The Approvers screen shows the gap list at the top of each tab.

---

## The expiry ladder

Every published record is valid for 12 months. As it runs down, one email goes
out per rung:

```
60  30  14  7  5  3  2  1  0   then weekly: -7, -14, -21, … indefinitely
```

**This is owned end to end by an n8n workflow, not by the app.** n8n runs on its
own schedule, queries this database directly for what is due, sends, and writes
back to `sns_notification_log`. The app only reads that table to render the
Expiry Reminders panel on a record.

The two SQL queries are in
[`sns_reminder_queries.sql`](./sns_reminder_queries.sql), written to drop into
the two Postgres nodes of a workflow shaped like TI-TE's:

```
Schedule Trigger → [1] fetch due → If → Split Out → Loop Over Items
                 → Code (build message) → Send → Code → [2] mark sent
```

There is deliberately **no Vercel Cron and no app endpoint** in this path. An
earlier version of this feature used one; it could not work, because
`src/middleware.ts` 401s every `/api/*` request without a NextAuth session
cookie and a scheduler has no cookie. (The same latent problem still affects
ProcureGuard's reminder cron, which has never fired. Untouched here — not this
feature's to fix.) Going straight to Postgres sidesteps the question entirely.

### Properties worth knowing

- **One email per record per run.** Query [1] returns at most one row per
  record: the single rung it stands on today. A record ignored for a month gets
  the warning that describes where it actually is, not a burst of eight.
- **Walked-past rungs are never sent late.** They are simply never written, and
  the app reads their absence plus the calendar as `missed`. A "30 days to
  expiry" mail can't arrive a week after expiry.
- **Idempotent.** The unique index on
  `(record_rid, cycle_expiry, days_before_expiry)` is the whole mechanism. Run
  the workflow twice an hour if you like; nothing sends twice.
- **Renewal restarts it.** `cycle_expiry` is the expiry date at the moment of
  sending. Renewing moves expiry 12 months out — a new cycle — so every rung
  becomes eligible again rather than staying permanently suppressed.

All four are covered by `npm run sns:test:reminders`, which drives the real
query against the live schema inside a transaction it always rolls back. It
walks a record from 70 days out to 60 days overdue and asserts the rung
sequence, then checks renewal restarts the ladder and closing silences it.

### The way out

Every reminder asks for exactly one thing: **renew**. Attach the review
documents (`kind = 'review'`) and resubmit for re-validation. Final sign-off
issues a Registry ID for the new window and supersedes the old record, which
stops the emails because query [1] only looks at live records.

> `closeSnsRecord` / `reopenSnsRecord` still exist in `src/app/actions/sns.ts`
> and set `base_status = 'Closed'`, which query [1] also excludes. Neither is
> reachable from any screen — closing an account is not a concept the registry
> offers, and the reminder mail no longer mentions it. They are dead code kept
> only because `Closed` is already in the status CHECK constraint.

### What the app still sends itself

Workflow mail — submitted, Level 1 validated, published, rejected, renewed,
closed — is still sent by the app over the n8n webhook, because it fires inside
a signed-in user action where there is a session and no scheduling involved.
Only the *reminders* moved. See the payload contracts below.

---

## Environment variables

```bash
# n8n — required for any notification to leave the app
N8N_SNS_REGISTRY_WEBHOOK_URL=https://n8n.nesr.com/webhook/sns-registry
N8N_SNS_REGISTRY_WEBHOOK_SECRET=            # optional; sent as x-sns-registry-secret

# Used to build the "Open the record" link in every email.
NEXT_PUBLIC_APP_URL=https://…              # falls back to NEXTAUTH_URL
```

Database credentials reuse the platform-standard `DB_*` names, falling back to
`POSTGRES_*` / `SnS_DB` / `PGSSL`. The registry's own database name comes from
`SNS_REGISTRY_DB_NAME` (default `sns_registry_db`); the taxonomy read uses the
existing SourceGuide pool.

With the webhook URL unset, everything still works — the app logs a warning and
skips the send. Nothing breaks, nothing is emailed.

---

## n8n payload contracts

All events POST JSON to the same URL. Switch on `event`.

Every payload carries a rendered `subject` and `body_html`, so an n8n workflow
can send without knowing any registry rules. `recipients` is the to-list;
`cc` (workflow events) and `primary_recipient` (reminders) refine addressing.

### `record.submitted` · `record.level1_approved` · `record.published` · `record.rejected` · `record.renewed` · `record.closed`

```jsonc
{
  "event": "record.level1_approved",
  "source": "sns-registry",
  "occurred_at": "2026-09-15T08:30:00.000Z",
  "record": {
    "rid": 41,
    "registry_id": "SGL-KWT-2026-0007",   // "Draft #41" before Level 2 issues one
    "classification": "SGL",              // SGL = single-source, SOL = sole-source
    "country": "Kuwait",
    "supplier_id": "1004521",
    "supplier_name": "…",
    "scope": "Chiller units, AHU maintenance",
    "categories": ["Facility"],
    "url": "https://…/sns-registry?record=41"
  },
  "recipients": [
    { "display_name": "…", "email": "…@nesr.com", "notification_role": "Category Manager — Facility" }
  ],
  "cc": ["…@nesr.com"],                   // stakeholders not already in recipients
  "actor": "… — Country Supply Chain Manager, Kuwait",
  "note": "",                             // rejection reason, closure reason, or a missing-approver warning
  "subject": "[S&S Registry] … — Awaiting your Level 2 sign-off — …",
  "body_html": "<div …>"
}
```

Who is addressed, by event:

| Event | Recipients |
|---|---|
| `record.submitted` | the country's Level 1 approver |
| `record.level1_approved` | every resolved Level 2 approver (category managers + directors) |
| `record.rejected` | the requestor only |
| `record.published` / `renewed` / `closed` | all stakeholders + both approvers |

When no approver is configured, `recipients` is empty and `note` says so — the
app logs it and n8n receives nothing to send.

### Expiry reminders

Not a webhook payload — they never pass through the app. The n8n workflow reads
everything it needs straight from query [1] in
[`sns_reminder_queries.sql`](./sns_reminder_queries.sql), which returns per due
record:

```
rid, registry_id, classification, classification_label, country,
supplier_id, supplier_name, expiry_date, days_left, days_before_expiry,
requestor_email, scope, stakeholder_emails[], level1_email, level1_name,
level2_emails[], review_documents[]
```

Address the mail to `requestor_email` — the ask ("renew this or close it") is
theirs — and copy `stakeholder_emails`, `level1_email` and `level2_emails`,
which are the people who would have to act on a renewal. `review_documents` is
there so the message can say what is already on file.

### Transport

POSTed over Node's `https.request` with `rejectUnauthorized: false`, matching
ProcureGuard — the internal n8n certificate does not chain to a public root.
15-second timeout. A failure never fails the action that triggered it.

---

## Attachments

`sns_record_document`, bytes in the row, max 15 MB, extension-allowlisted
(pdf/doc/docx/xls/xlsx/ppt/pptx/msg/eml/png/jpg/txt/csv/zip).

Two kinds:

- `evidence` — attached in the wizard, supporting the original justification.
- `review` — attached at renewal. These are what the reminder emails list.

Served by `GET /api/sns-registry/documents/[id]`, which checks the viewer can
see the record's country. Never returned through a server action — bytes would
have to be base64'd through the RSC payload.

---

## Registry ID format

```
{SGL|SOL}-{COUNTRY}-{SAP ID}-{IYIMEYEM}{NN}
SGL-IRQ-0001103296-2609270901
```

Spelled by [`registry-id.ts`](../src/app/sns-registry/lib/registry-id.ts), which
is pure and unit-tested — the database half (advisory lock, last-issued read)
was never the part at risk, the format is. Expiry is entered by the requestor,
not derived from the issue date, because the ID embeds its year and month.

The trailing sequence is load-bearing: the same supplier can hold more than one
record in a country for different taxonomy scopes, and two raised in the same
month with the same validity would otherwise mint identical IDs against a UNIQUE
column. An ID never changes once issued, so after a renewal it still reads with
the window it was issued under — the record's expiry date is the live figure.

---

## Seeding the Level 1 approvers

```bash
npm run sns:seed:approvers -- --dry   # show the mapping, write nothing
npm run sns:seed:approvers            # apply
```

Reads ProcureGuard's approved **SCM Managers** and writes them to
`sns_country_manager`. Idempotent — re-run it whenever that roster changes.

The two registries do not name countries identically (ProcureGuard tracks
commercial entities like `"Jordan, Kuwait"`; S&S tracks operating countries), so
[`scripts/sns-seed-approvers.mjs`](../scripts/sns-seed-approvers.mjs) holds an
explicit `MAPPING`. It is deliberately not fuzzy-matched: assigning the wrong
approver to a country is a silent, compliance-relevant failure, so every pairing
is stated and anything unstated is skipped and reported.

`Global` has no SCM Manager of its own and is named directly in that file.

---

## A note on middleware

`src/middleware.ts` 401s every `/api/*` request that arrives without a NextAuth
session cookie. That is why the reminders go straight to Postgres from n8n
rather than through an app endpoint — a scheduler, whether Vercel Cron or an
n8n HTTP node, has no cookie and would never get through.

Worth knowing if you ever add another scheduled job here: it cannot call this
app over HTTP without either an allowance in that file or a session.

---

## Operational notes

- **Run the reminder workflow by hand:** execute it from the n8n canvas. Query
  [1] is a plain SELECT, so running it alone is safe and shows exactly what
  would go out.
- **Test the ladder after changing the SQL:** `npm run sns:test:reminders`.
- **Nothing flips a record to `Expired` automatically.** `displayStatus` in the
  app derives Expired/Expiring soon from the expiry date at render time, so the
  registry reads correctly without a job having to run. If you want the stored
  `base_status` to change too, add it as a third query in the workflow.
- **If SourceGuide is unreachable,** the wizard still opens — countries,
  segments and reason codes come from the registry's own database. Only the
  taxonomy columns are empty, and the failure is logged.
