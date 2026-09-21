# S&S Registry — building the reminder workflow in n8n

The expiry reminder ladder is owned end to end by n8n. It runs on its own
schedule, queries `sns_registry_db` directly, sends, and writes back to
`sns_notification_log` — which the app reads to render the Expiry Reminders
panel on a record. Nothing goes through an app endpoint, deliberately: a
scheduler carries no session cookie and `src/proxy.ts` refuses unauthenticated
requests under the api path.

Same shape as the TI-TE reminder workflow:

```
Schedule Trigger → Fetch due → If any → Loop Over Items
                 → Build the email → Send → Log the send ─┐
                        ▲                                  │
                        └──────────────────────────────────┘
```

Both SQL queries live in [`sns_reminder_queries.sql`](./sns_reminder_queries.sql).
Copy them from there rather than retyping — they are commented and covered by
`npm run sns:test:reminders`.

---

## Credentials

One Postgres credential, pointing at **`sns_registry_db`** — the same host and
user the app uses (`DB_HOST` / `DB_USER` / `DB_PASSWORD`, SSL on). It needs
`SELECT` on the registry tables and `INSERT` on `sns_notification_log`. Nothing
else.

> The workflow reads `sns_country_manager` and `sns_category_manager` to find
> the approvers, so an account restricted to `sns_record` alone will return
> empty recipient lists rather than failing loudly.

---

## Node 1 — Schedule Trigger

| Field | Value |
|---|---|
| Trigger Interval | Days |
| Days Between Triggers | 1 |
| Trigger at Hour | 6 (or whatever suits the region) |
| Trigger at Minute | 30 |

Once a day is enough. The query is idempotent, so running it more often is
harmless — it simply finds nothing new — but it will not send anything twice
either, so there is no benefit.

---

## Node 2 — Postgres: "Fetch due reminders"

| Field | Value |
|---|---|
| Resource | Database |
| Operation | **Execute Query** |
| Query | query **[1]** from `sns_reminder_queries.sql` |

Returns **one item per record owed a reminder today**, at most one rung each.
An empty result means nothing is due; that is the normal case most days.

Each item carries:

| Field | What it is |
|---|---|
| `rid` | Internal record id — needed by the write-back |
| `registry_id` | e.g. `SGL-KWT-0001102331-26-09-27-09-01` |
| `classification` | `SGL` or `SOL` |
| `classification_label` | `Single-Source` / `Sole-Source`, ready to print |
| `country`, `country_code` | Display name and the stable code |
| `supplier_id`, `supplier_name` | SAP ID and name as the record holds them |
| `expiry_date` | **Use this as `cycle_expiry` on the write-back** |
| `days_left` | Days until expiry; negative once overdue |
| `days_before_expiry` | The rung: 60…1, 0 on the day, −7/−14/… weekly after |
| `requestor_email` | Who raised it — address the mail to them |
| `scope` | Families/commodities, comma separated |
| `stakeholder_emails` | Everyone who has touched the record |
| `level1_email`, `level1_name` | Country Supply Chain Manager |
| `level2_emails` | Category managers + Supply Chain Directors |
| `review_documents` | Review files already attached, by name |

---

## Node 3 — If: "Any due?"

| Field | Value |
|---|---|
| Condition | Number · `{{ $json.rid }}` · **is not empty** |

Strictly optional — with no rows nothing flows downstream anyway. It is worth
having so the run history shows a deliberate "nothing due" rather than an empty
execution you have to interpret.

Wire the **true** output onward. Leave **false** unconnected, or add a NoOp if
you prefer it visible.

---

## Node 4 — Loop Over Items (Split In Batches)

| Field | Value |
|---|---|
| Batch Size | **1** |

One record per pass, so a failure on one does not lose the rest, and each send
is logged immediately after it succeeds. Connect the **loop** output to node 5;
the last node wires back into this one. The **done** output can stay empty.

---

## Node 5 — Code: "Build the email"

Mode: **Run Once for All Items** (the batch is a single item anyway).

```js
const r = $input.first().json;

// The rung, in words. days_before_expiry is positive before expiry, 0 on the
// day, negative afterwards (in whole weeks).
const dbe = Number(r.days_before_expiry);
const label =
  dbe > 0
    ? `${dbe} day${dbe === 1 ? '' : 's'} to expiry`
    : dbe === 0
      ? 'expires today'
      : `${Math.round(-dbe / 7)} week${-dbe === 7 ? '' : 's'} past expiry`;

const overdue = dbe < 0;
const onDay = dbe === 0;
const headline = overdue
  ? `EXPIRED — ${label}`
  : onDay
    ? 'EXPIRES TODAY'
    : `Expires in ${dbe} day${dbe === 1 ? '' : 's'}`;
const tone = overdue || onDay ? '#B34141' : dbe <= 7 ? '#E09A4E' : '#2A7E4F';

// Set this to wherever the app is served.
const BASE = 'https://expediting-tool.vercel.app';
const url = `${BASE}/sns-registry?record=${r.rid}`;

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// The requestor is the ask; everyone else is there to see it has been asked.
const cc = [
  ...(r.stakeholder_emails || []),
  r.level1_email,
  ...(r.level2_emails || []),
]
  .filter(Boolean)
  .map((e) => String(e).trim().toLowerCase())
  .filter((e) => e && e !== String(r.requestor_email || '').toLowerCase());

const docs = (r.review_documents || []).length
  ? `<ul style="margin:6px 0 0;padding-left:18px;font-size:13px;">${r.review_documents
      .map((d) => `<li>${esc(d)}</li>`)
      .join('')}</ul>`
  : '<div style="margin-top:6px;font-size:13px;color:#9B1C1C;">No review documents have been attached yet.</div>';

const rows = [
  ['Registry ID', r.registry_id],
  ['Classification', r.classification_label],
  ['Country', r.country],
  ['Supplier', `${r.supplier_id} — ${r.supplier_name}`],
  ['Scope', r.scope],
  ['Expiry date', String(r.expiry_date).slice(0, 10)],
];

const html = `
<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;color:#1F1F1D;">
  <div style="border-left:4px solid ${tone};padding-left:12px;margin-bottom:18px;">
    <div style="font-size:18px;font-weight:bold;">${esc(headline)}</div>
    <div style="font-size:13px;color:#58595B;margin-top:3px;">
      Single &amp; Sole Source Registry — periodic review
    </div>
  </div>

  <table style="border-collapse:collapse;font-size:13px;margin-bottom:18px;">
    ${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 18px 4px 0;color:#58595B;white-space:nowrap;">${esc(k)}</td>` +
          `<td style="padding:4px 0;font-weight:bold;">${esc(v)}</td></tr>`,
      )
      .join('')}
  </table>

  <div style="background:#F7F9F8;border-left:4px solid ${tone};padding:14px 16px;font-size:13px;line-height:1.6;">
    <strong>This record needs one of two things before it can stay in SAP.</strong>
    <ol style="margin:8px 0 0;padding-left:18px;">
      <li><strong>Renew it</strong> — attach the current review documents on the record and submit
          it for re-validation. A successful review keeps the same Registry ID and extends it by
          twelve months.</li>
      <li><strong>Close the supplier account</strong> — if the arrangement has ended, close it on
          the record. That retires the entry and stops these reminders.</li>
    </ol>
  </div>

  <div style="margin-top:16px;font-size:13px;">
    <strong style="font-size:12px;color:#58595B;letter-spacing:0.5px;">REVIEW DOCUMENTS ON FILE</strong>
    ${docs}
  </div>

  <div style="margin-top:22px;">
    <a href="${esc(url)}" style="background:#2A7E4F;color:#ffffff;text-decoration:none;font-weight:bold;font-size:13px;padding:11px 20px;display:inline-block;">
      Open the record
    </a>
  </div>

  <div style="border-top:1px solid #E4E6E6;margin-top:24px;padding-top:14px;font-size:12px;color:#58595B;">
    Automated reminder from the NESR S&amp;S Registry. You are receiving it because you raised or
    validated this record. Reminders stop once it is renewed or the supplier account is closed.
  </div>
</div>`;

return [
  {
    json: {
      // Carried through for the write-back.
      rid: r.rid,
      days_before_expiry: dbe,
      cycle_expiry: String(r.expiry_date).slice(0, 10),

      to: r.requestor_email,
      cc_csv: cc.join(','),
      // Everyone actually addressed, for the log.
      recipients_csv: [r.requestor_email, ...cc].filter(Boolean).join(','),

      subject: `[S&S Registry] ${r.registry_id} — ${headline} — ${r.supplier_name}`,
      html,
    },
  },
];
```

**`cycle_expiry` must be the `expiry_date` that came out of query [1]** — not
`CURRENT_DATE`, not a fresh read. It is what ties the log row to this
twelve-month cycle, and it is what makes renewal restart the ladder instead of
suppressing every rung forever.

---

## Node 6 — Microsoft Outlook: "Send a message"

| Field | Value |
|---|---|
| Resource | Message |
| Operation | Send |
| To | `={{ $json.to }}` |
| Subject | `={{ $json.subject }}` |
| Message | `={{ $json.html }}` |
| Options → Content Type | **HTML** |
| Options → CC | `={{ $json.cc_csv }}` |

If `requestor_email` is ever empty — a record created before `created_by`
existed — Outlook will reject the send and the loop will surface it. That is
the right outcome: nothing gets logged as sent, and the rung stays due.

---

## Node 7 — Postgres: "Log the send"

| Field | Value |
|---|---|
| Operation | **Execute Query** |
| Query | query **[2]** from `sns_reminder_queries.sql` |
| Options → Query Parameters | see below |

```
{{ $('Build the email').item.json.rid }}, {{ $('Build the email').item.json.days_before_expiry }}, {{ $('Build the email').item.json.cycle_expiry }}, {{ $('Build the email').item.json.recipients_csv }}
```

Referencing the Code node by name rather than `$json`, because the Outlook node
replaces the item with its own response and the original fields are no longer on
it.

Wire this node's output **back into Loop Over Items** to close the loop.

`ON CONFLICT DO NOTHING` plus the unique index on
`(record_rid, cycle_expiry, days_before_expiry)` is what makes the whole thing
idempotent — re-run the workflow as often as you like.

---

## Checking it works

**Before connecting the send.** Run node 2 on its own. It is a plain `SELECT`,
so it shows exactly what would go out without sending anything. On a registry
with nothing near expiry it returns zero rows — that is correct, not a fault.

**To force a row**, temporarily set a record's expiry to 30 days out:

```sql
UPDATE sns_record SET expiry_date = CURRENT_DATE + 30 WHERE registry_id = '...';
```

Query [1] should then return that record with `days_before_expiry = 30`. Delete
the resulting log row afterwards if you want to re-test:

```sql
DELETE FROM sns_notification_log WHERE record_rid = <rid>;
```

**After a real run**, the record's Expiry Reminders panel in the app should show
that rung as `sent`.

**If you change the SQL**, run `npm run sns:test:reminders`. It drives query [1]
against the live schema inside a transaction it always rolls back, walking a
record from 70 days out to 60 days overdue, and asserts the rung sequence plus
renewal-restart and close-silences behaviour.

---

# The second workflow: "waiting for your approval"

Everything above is the *scheduled* reminder workflow. There is a second,
much simpler one for the approval chain — and the important thing about it is
that **n8n decides nothing**. The app has already resolved who the approver is
(from `sns_country_manager` / `sns_category_manager`, the same tables the
reminder query joins) and has already rendered the subject and the HTML body.
n8n only delivers.

That split is deliberate. Routing depends on registry state — who is assigned,
which categories the record touches, whether anyone is assigned at all — and
that decision belongs next to the data, in code that is reviewed and tested.
Duplicating it in a workflow would give two answers to the same question.

## Events

The app POSTs to `N8N_SNS_REGISTRY_WEBHOOK_URL` on each of these:

| `event` | Fires when | Addressed to |
|---|---|---|
| `record.submitted` | A record is raised, or resubmitted, or reopened | The country's Level 1 approver |
| `record.level1_approved` | Level 1 validates | Every Level 2 approver — category managers for the record's categories, plus any Supply Chain Director |
| `record.published` | Level 2 signs off and the Registry ID is issued | Everyone involved |
| `record.rejected` | Rejected at either level | The requestor only — copying the validators on their own decision is noise |
| `record.renewed` | A periodic review extends it 12 months | Everyone involved |
| `record.closed` | The record is retired | Everyone involved |

## Payload

```jsonc
{
  "event": "record.level1_approved",
  "source": "sns-registry",
  "occurred_at": "2026-09-18T08:30:00.000Z",
  "record": {
    "rid": 41,
    "registry_id": "SGL-KWT-0001102331-26-09-27-09-01",
    "classification": "SGL",
    "country": "Kuwait",
    "country_code": "KWT",
    "supplier_id": "0001102331",
    "supplier_name": "HALLIBURTON ENERGY SERVICES",
    "scope": "Completion fluids",
    "categories": ["Chemicals"],
    "url": "https://…/sns-registry?record=41"
  },
  "recipients": [
    { "display_name": "…", "email": "…@nesr.com", "notification_role": "Category Manager — Chemicals" }
  ],
  "cc": ["…@nesr.com"],
  "actor": "… — Country Supply Chain Manager, Kuwait",
  "note": "",
  "subject": "[S&S Registry] … — Awaiting your Level 2 sign-off — …",
  "body_html": "<div …>"
}
```

`subject` and `body_html` are ready to send as-is. `note` carries a rejection
reason, a closure reason, or a warning that no approver is configured.

> If nobody is assigned, `recipients` is **empty** and `note` says so. The app
> logs it and sends the webhook anyway, so a missing assignment shows up rather
> than vanishing. The workflow should skip sending on an empty list — see the If
> node below.

## Nodes

### 1 — Webhook

| Field | Value |
|---|---|
| HTTP Method | POST |
| Path | e.g. `sns-registry` |
| Respond | Immediately |

Take the **production** URL and set it as `N8N_SNS_REGISTRY_WEBHOOK_URL` in
Vercel. Until that variable is set the app logs a warning and skips — nothing
breaks, nothing sends.

If you also set `N8N_SNS_REGISTRY_WEBHOOK_SECRET`, the app sends it as the
header **`x-sns-registry-secret`**. Check it in an If node and drop anything
that does not match; the endpoint is otherwise open to anyone who finds the URL.

### 2 — If: "Anyone to send to?"

| Field | Value |
|---|---|
| Condition | Number · `{{ $json.body.recipients.length }}` · **larger than** · 0 |

False means no approver is assigned for that country or category. Don't send —
the `note` field explains it, and the right fix is the Approvers screen, not a
mail to nobody.

### 3 — Code: "One item per recipient"

Mode: **Run Once for All Items** — not optional here.

The webhook delivers a single item, and this node has to emit one item per
recipient. Only "Run Once for All Items" can return an array; "Run Once for Each
Item" returns exactly one item per input item, so the fan-out silently collapses
to a single email and everyone after the first approver is never written to.

```js
const b = $input.first().json.body;
return b.recipients.map((r) => ({
  json: {
    to: r.email,
    cc_csv: (b.cc || []).filter((e) => e.toLowerCase() !== r.email.toLowerCase()).join(','),
    subject: b.subject,
    html: b.body_html,
    // Handy in the run history when something looks wrong.
    event: b.event,
    registry_id: b.record.registry_id,
    notification_role: r.notification_role,
  },
}));
```

One email each rather than a single mail with everyone in `To`, so a Level 2
request reads as addressed to the person rather than to a committee — and a bad
address fails one send instead of all of them.

### 4 — Microsoft Outlook: "Send a message"

| Field | Value |
|---|---|
| To | `={{ $json.to }}` |
| Subject | `={{ $json.subject }}` |
| Message | `={{ $json.html }}` |
| Options → Content Type | **HTML** |
| Options → CC | `={{ $json.cc_csv }}` |

That is the whole workflow — four nodes, no database, no schedule.

## Testing it

Set `N8N_SNS_REGISTRY_WEBHOOK_URL` to the n8n **test** URL, open the workflow's
Listen step, and submit a record in the registry. The `record.submitted` payload
should arrive with the country's Supply Chain Manager already in `recipients`.

To check the resolution without sending anything, run this against
`sns_registry_db` — it is what the app does internally:

```sql
SELECT c.name AS country, m.manager_name, m.manager_email
  FROM sns_country_manager m
  JOIN sns_country c ON c.code = m.country_code
 WHERE m.active
 ORDER BY c.name;
```

Thirteen rows, one per country. If a country is missing there, records for it
fall back to the role grant and nobody is emailed by name.
