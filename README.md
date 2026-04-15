# PO Expediting Tool — NESR Digital Supply Chain

## Overview

The PO Expediting Tool is an internal web application built for NESR's procurement team that acts as a **read-only control tower** over open SAP Purchase Orders. Every morning, an n8n automation pulls the current snapshot of open POs from NESR's Power BI SUPPLYCHAIN dataset and loads it into a local PostgreSQL database. Buyers log in and immediately see a live, filterable dashboard of every open line — sorted by delivery urgency, grouped by PO, and annotated with delivery status codes. No SAP access, no spreadsheets.

When a buyer identifies delayed lines that need supplier follow-up, they select them using hierarchical checkboxes, navigate through an expediting workflow, configure per-supplier email recipients, and dispatch a consolidated follow-up email batch with a single click. Each supplier receives a professionally formatted HTML email from `digital.supplychain@nesr.com` containing a table of their specific PO lines and a unique, secure link to a supplier response portal. On the portal the supplier fills in delivery status codes, updated delivery dates, and optional comments — either line by line or in bulk per PO — and submits. The submission expires the link and records the response in the database, ready for the buyer to review.

The tool never writes back to SAP directly. Instead, it maintains its own workflow state in PostgreSQL and is designed to produce a CSV export (planned feature) that buyers upload to SAP manually. The architecture keeps the procurement team in control of data quality while eliminating the back-and-forth of unstructured email chasing.

---

## Tech Stack

| Technology | Version | Role |
|---|---|---|
| **Next.js** | 16.2.2 | Full-stack framework — App Router, Server Actions, API routes, SSR |
| **React** | 19.2.4 | UI rendering |
| **TypeScript** | 5.x | Type safety across all frontend and backend logic |
| **Tailwind CSS** | 4.x | Utility-first styling via `@tailwindcss/postcss` |
| **PostgreSQL** | — | Primary database; hosted locally on Windows 10 machine (E: drive partition) |
| **pg** | 8.20.0 | Node.js PostgreSQL client — singleton pool used in all DB queries |
| **NextAuth.js** | 4.24.13 | Authentication — JWT sessions, Azure AD + credentials providers |
| **Zustand** | 5.0.12 | Global client-side state for expedite cart and supplier email configuration |
| **sharp** | 0.34.5 | Next.js image optimisation dependency |
| **Ngrok TCP tunnel** | — | Bridges the local PostgreSQL instance to Vercel (cloud host) and n8n (cloud automation) |
| **n8n** | Self-hosted on Azure VM | Workflow automation: daily data sync and email dispatch |
| **Vercel** | — | Frontend hosting with CI/CD via GitHub push-to-deploy |
| **Microsoft Entra ID (Azure AD)** | — | SSO identity provider — configured, pending IT DNS provisioning |
| **Microsoft Graph API (OAuth2)** | — | Used by n8n to send emails via `digital.supplychain@nesr.com` |
| **Geist / Geist Mono** | — | Google Fonts — primary sans and monospace typefaces |

---

## Repository Structure

```
expediting_tool/
│
├── src/
│   │
│   ├── app/                              # Next.js App Router root
│   │   │
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/
│   │   │   │   └── route.ts             # NextAuth handler (GET + POST) — configures
│   │   │   │                            #   Azure AD and Credentials providers
│   │   │   └── pos/
│   │   │       └── route.ts             # GET /api/pos — queries sap_open_po_master,
│   │   │                                #   returns all rows as JSON; force-dynamic
│   │   │
│   │   ├── actions/                     # Next.js Server Actions ('use server')
│   │   │   ├── expediteDispatch.ts      # prepareAllExpediteDispatches() — bulk DB
│   │   │   │                            #   UPSERT into active_expediting + fire-and-
│   │   │   │                            #   forget POST to n8n webhook
│   │   │   ├── supplier-actions.ts      # getSupplierContacts(), addAdditionalSupplierEmail()
│   │   │   │                            #   — reads/writes supplier_contacts table
│   │   │   └── supplierPortal.ts        # getExpediteByToken(), submitSupplierUpdates()
│   │   │                                #   — token validation and transactional submission
│   │   │
│   │   ├── expedite/
│   │   │   ├── page.tsx                 # /expedite — Expedite Queue: selected POs grouped
│   │   │   │                            #   by supplier, per-supplier email configuration
│   │   │   └── confirm/
│   │   │       └── page.tsx             # /expedite/confirm — Confirm & Dispatch: email
│   │   │                                #   template editor, dispatch summary, send button
│   │   │
│   │   ├── home/
│   │   │   └── page.tsx                 # /home — Tool selector hub: PO Expediting (live),
│   │   │                                #   GRN Reconciliation and Supply Chain Analytics
│   │   │                                #   (coming soon placeholders)
│   │   │
│   │   ├── login/
│   │   │   └── page.tsx                 # /login — Login page: SSO button + password fallback
│   │   │
│   │   ├── supplier-update/
│   │   │   ├── layout.tsx               # Isolated layout for the supplier portal —
│   │   │   │                            #   no app navbar, NESR-branded header only
│   │   │   ├── page.tsx                 # /supplier-update?token=UUID — Server Component;
│   │   │   │                            #   validates token, renders form or error views
│   │   │   └── SupplierPortalForm.tsx   # Client Component — full supplier update form
│   │   │                                #   with per-line and bulk-apply interactions
│   │   │
│   │   ├── layout.tsx                   # Root layout — Geist fonts, metadata, Providers wrapper
│   │   ├── page.tsx                     # / — Main PO dashboard (buyers' primary view)
│   │   └── globals.css                  # Tailwind base import, @theme tokens, shimmer
│   │                                    #   and expand-grid keyframe animations
│   │
│   ├── components/
│   │   ├── LineItemDrawer.tsx           # Slide-out drawer panel showing full detail for
│   │   │                                #   a selected PO line (material, supplier, expediting)
│   │   ├── MultiSelectDropdown.tsx      # Reusable searchable multi-select dropdown used
│   │   │                                #   in the dashboard filter bar
│   │   ├── Providers.tsx                # NextAuth SessionProvider wrapper (enables
│   │   │                                #   useSession() in client components)
│   │   ├── Sidebar.tsx                  # Slide-in navigation drawer — links, expedite
│   │   │                                #   queue badge, user profile, sign-out
│   │   └── SquareCheckbox.tsx           # Controlled checkbox with indeterminate state
│   │                                    #   support; used throughout for row selection
│   │
│   ├── config/
│   │   └── site.ts                      # Branding constants: brand colour (#307c4c),
│   │                                    #   logo paths, app name, login page text
│   │
│   ├── lib/
│   │   └── db.ts                        # PostgreSQL singleton Pool — reuses globalThis._pgPool
│   │                                    #   across hot-reloads in development
│   │
│   ├── middleware.ts                    # NextAuth withAuth middleware — protects all routes
│   │                                    #   except /login, /supplier-update, /api/auth,
│   │                                    #   and static assets
│   │
│   ├── store/
│   │   └── useExpediteStore.ts          # Zustand store — selectedItems (PO lines in cart),
│   │                                    #   supplierEmails (per-supplier TO/CC config)
│   │
│   └── types/
│       └── po.ts                        # PurchaseOrder interface — canonical shape of
│                                        #   a row from /api/pos
│
├── public/
│   ├── nesr-logo.jpg                    # Square logo — used on login page
│   └── nesr-logo-circle.png             # Circular logo — used in app header and favicon
│
├── .env.local                           # Local environment variables (not committed)
├── .gitignore                           # Standard Node/Next.js exclusions + .env* files
├── eslint.config.mjs                    # ESLint config (Next.js core web vitals + TypeScript)
├── next.config.ts                       # Next.js config (minimal — no custom options set)
├── package.json                         # Dependencies and npm scripts
├── postcss.config.mjs                   # PostCSS config — loads @tailwindcss/postcss plugin
└── tsconfig.json                        # TypeScript config — strict mode, @/* path alias
```

---

## Database Architecture

The app uses four PostgreSQL tables. The database is hosted locally on the Windows 10 machine running the Ngrok TCP tunnel, which exposes it to both Vercel and the n8n Azure VM.

---

### `sap_open_po_master` — The Daily Mirror (Table A)

The read-only source of truth for all open POs. Wiped and reloaded every morning by n8n. The frontend **never writes to this table** — it is treated as a live SAP mirror.

| Column | Type | Description |
|---|---|---|
| `po_number` | `text` | SAP Purchase Order number |
| `po_line` | `text` | PO line item number |
| `sap_mat_id` | `text` | SAP Material ID; `NULL` or empty for service lines |
| `item_description` | `text` | Material or service description |
| `supplier_id` | `text` | SAP Supplier (vendor) number |
| `supplier_name` | `text` | Supplier display name |
| `open_qty` | `numeric` | Outstanding quantity |
| `open_po_value_usd` | `numeric` | Outstanding value in USD |
| `delivery_date` | `date` | Expected delivery date |
| `buyer_name` | `text` | NESR buyer assigned to this line |
| `buyer_email` | `text` | Buyer's email (resolved via LOOKUPVALUE in Power BI DAX) |
| `plant` | `text` | SAP plant code |
| `purchasing_org` | `text` | SAP purchasing organisation |
| `delivery_code` | `text` | Current DS delivery status code (DS01–DS18) |
| `delivery_comments` | `text` | Free-text comments from SAP |
| `country` | `text` | Supplier country (resolved via LOOKUPVALUE from All Plants table) |
| `po_release_date` | `date` | Date the PO was released in SAP |

**DAX filter criteria applied in n8n before loading:**
- `STILL_DELV_VAL_USD > 0` (only lines with open value)
- `FRGKE_KEY = "G"` (released POs only)
- Excludes plant `PM30`
- Excludes document type `INTC`
- Excludes lines with deletion indicators
- Excludes EOS JAFZA supplier

---

### `active_expediting` — The Workflow Hub (Table B)

Populated when a buyer dispatches an expediting batch. Tracks the full lifecycle of each expedited PO line from email dispatch through supplier response. Has a **UNIQUE constraint on `(po_number, po_line)`** — re-expediting the same line UPSERTs and resets the row with a fresh token, preserving history in the audit log.

| Column | Type | Description |
|---|---|---|
| `id` | `serial` | Auto-incrementing primary key |
| `po_number` | `text` | PO number (references `sap_open_po_master`) |
| `po_line` | `text` | PO line (references `sap_open_po_master`) |
| `expedite_token` | `uuid` | Unique token per supplier dispatch batch; shared by all lines expedited to the same supplier in one batch. Builds the supplier portal URL. |
| `workflow_state` | `text` | `'Email Sent'` on dispatch; `'Submitted'` after supplier response (expires the link) |
| `current_status` | `text` | Supplier-provided DS delivery status code (populated on submission) |
| `new_delivery_date` | `date` | Revised delivery date provided by supplier |
| `supplier_comments` | `text` | Free-text comments from supplier |
| `buyer_comments` | `text` | Internal buyer comments (reserved for future use) |
| `dispatched_by` | `text` | Buyer who sent the email (not yet populated — pending SSO) |
| `dispatched_at` | `timestamptz` | When the email was dispatched (not yet populated) |
| `created_at` | `timestamptz` | Row creation timestamp |
| `updated_at` | `timestamptz` | Last update timestamp |

**UPSERT behaviour on re-expedite:** `ON CONFLICT (po_number, po_line)` resets `expedite_token`, `workflow_state`, `current_status`, `new_delivery_date`, `supplier_comments`, and `buyer_comments` with fresh values. Previous responses are preserved in `expediting_audit_log`.

---

### `expediting_audit_log` — Append-Only History (Table C)

Every supplier submission appends a new row. Never updated or deleted. Preserves the full history of all previous responses even when `active_expediting` is reset by a re-expedite.

| Column | Type | Description |
|---|---|---|
| `log_id` | `serial` | Auto-incrementing primary key |
| `active_expediting_id` | `integer` | FK to `active_expediting.id` |
| `status_submitted` | `text` | DS status code submitted by supplier |
| `new_delivery_date` | `date` | Delivery date submitted by supplier |
| `comments` | `text` | Comments submitted by supplier |
| `submitted_by` | `text` | Hardcoded `'Supplier'` (will use real identity post-SSO) |
| `submitted_at` | `timestamptz` | Submission timestamp |

---

### `supplier_contacts` — Email Address Book (Table D)

Populated and maintained by n8n's daily Supplier Contacts Sync workflow via upsert (never truncated). Stores default supplier email addresses from Power BI alongside buyer-added additional emails. The upsert strategy protects the `additional_supplier_email` column from being overwritten by the daily sync.

| Column | Type | Description |
|---|---|---|
| `supplier_id` | `text` | SAP Supplier ID — unique constraint / conflict target |
| `supplier_name` | `text` | Supplier display name |
| `supplier_emails` | `text` | Comma-separated default contact emails sourced from Power BI |
| `additional_supplier_email` | `text` | Comma-separated emails added manually by buyers via the Expedite Queue; persisted to DB and never overwritten by the daily sync |

---

## Environment Variables

Create a `.env.local` file at the project root. All variables below are required for full functionality.

```bash
# ── Database ──────────────────────────────────────────────────────────────────
# PostgreSQL connection string via Ngrok TCP tunnel.
# Format: postgresql://USER:PASSWORD@HOST:PORT/DBNAME
# HOST and PORT will change if Ngrok restarts — update here AND in Vercel env vars.
DATABASE_URL=postgresql://postgres:password@0.tcp.ngrok.io:12345/expediting_db

# ── NextAuth ──────────────────────────────────────────────────────────────────
# Must match the current deployment URL exactly (including protocol).
# Update to https://expediting.nesr.com when the subdomain DNS is live.
NEXTAUTH_URL=https://expediting-tool.vercel.app

# Random secret used to sign and encrypt JWT session tokens.
# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET=your-random-secret-here

# ── Authentication: Password Fallback ─────────────────────────────────────────
# Temporary static password for the credentials provider while SSO is pending.
# Maps to the "Login with Password" button on the login page.
# Remove or leave empty to disable password login once SSO is live.
FALLBACK_PASSWORD=your-internal-password

# ── Authentication: Microsoft Entra ID (Azure AD) ────────────────────────────
# App Registration is already created and shared with other NESR internal tools.
# SSO login is configured but inactive until IT provisions the subdomain and
# adds the redirect URI to the App Registration.
AZURE_AD_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_AD_CLIENT_SECRET=your-client-secret
AZURE_AD_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# ── App URL ───────────────────────────────────────────────────────────────────
# Base URL used to build the supplier portal links embedded in expediting emails.
# Must be publicly reachable — suppliers click this link from their email client.
# Current value: Vercel deployment URL.
# Future value: https://expediting.nesr.com (update once DNS is provisioned).
NEXT_PUBLIC_APP_URL=https://expediting-tool.vercel.app

# ── n8n Webhook ───────────────────────────────────────────────────────────────
# Webhook URL of the Email Dispatch workflow in the self-hosted n8n instance.
# The Server Action fires a POST to this URL after all DB inserts complete.
N8N_EXPEDITE_WEBHOOK_URL=https://n8n.nesr.com/webhook/expedite-email-dispatch
```

### Variable reference by file

| Variable | Used in |
|---|---|
| `DATABASE_URL` | `src/lib/db.ts` |
| `NEXTAUTH_URL` | NextAuth internals (redirect URIs) |
| `NEXTAUTH_SECRET` | NextAuth internals (JWT signing) |
| `FALLBACK_PASSWORD` | `src/app/api/auth/[...nextauth]/route.ts` |
| `AZURE_AD_CLIENT_ID` | `src/app/api/auth/[...nextauth]/route.ts` |
| `AZURE_AD_CLIENT_SECRET` | `src/app/api/auth/[...nextauth]/route.ts` |
| `AZURE_AD_TENANT_ID` | `src/app/api/auth/[...nextauth]/route.ts` |
| `NEXT_PUBLIC_APP_URL` | `src/app/actions/expediteDispatch.ts` |
| `N8N_EXPEDITE_WEBHOOK_URL` | `src/app/actions/expediteDispatch.ts` |

---

## Application Pages

### `GET /` — Main Dashboard

**Access:** Buyers (authenticated)  
**File:** `src/app/page.tsx`

The primary day-to-day view for buyers. Fetches all rows from `sap_open_po_master` via `GET /api/pos` on mount and groups them by PO Number. Each parent row shows the PO number, total open value, earliest delivery date, supplier name, country, delivery status code, and line count. Parent rows expand to reveal individual line items in a nested sub-table.

**Features:**
- **KPI cards** — total open value, count of past-due POs, count of due-soon POs, total distinct POs
- **Status tile slicer** — toggle-filter pills for Past Due / Due Soon / On Track (based on days until delivery date)
- **Cascading filter bar** — Supplier, Buyer Name, Delivery Status, and Country multi-select dropdowns; each dropdown's options recalculate based on all other active filters to prevent dead-end filter combinations
- **Global search** — full-text match across PO Number, Supplier Name, Supplier ID, SAP MAT ID
- **Active filter chips** — visible strip of applied filters with individual remove buttons
- **Sort** — parent PO rows sortable by Total Open Value or Earliest Delivery Date (ascending/descending toggle)
- **Pagination** — 50 PO groups per page with page number controls
- **Hierarchical checkbox selection** — check a parent row to select/deselect all its lines; partial selection shows indeterminate state; selections sync into Zustand store
- **Line item drawer** — clicking any sub-row opens a slide-out panel with full line detail (material info, supplier details, delivery code with full DS label, comments)
- **Collapsible sidebar** — navigation and user profile panel
- **Skeleton loading state** — shimmer placeholder rows while data loads

**Delivery status badges** (sub-row "Status" column, based on days until `delivery_date`):
- `< 0 days` → **Past Due** (red pill)
- `0–7 days` → **Due Soon** (amber pill)
- `> 7 days` → **On Track** (green pill)

**Components used:** `Sidebar`, `LineItemDrawer`, `MultiSelectDropdown`, `SquareCheckbox`  
**Data source:** `GET /api/pos` → `sap_open_po_master`

---

### `GET /home` — Tool Selector Hub

**Access:** Buyers (authenticated)  
**File:** `src/app/home/page.tsx`

Landing page shown after login. Displays all available NESR Digital Supply Chain tools as cards in a three-column responsive grid.

**Tools listed:**
- **PO Expediting** (active — links to `/`)
- **GRN & Invoice Reconciliation** (coming soon placeholder)
- **Supply Chain Analytics** (coming soon placeholder)

Header shows NESR logo, app title, user display name, and sign-out button. Greets the buyer by first name extracted from the session name.

---

### `GET /login` — Login Page

**Access:** Public (unauthenticated)  
**File:** `src/app/login/page.tsx`

Dark-themed login screen with two authentication paths:

1. **"Continue with SSO"** — triggers `signIn('azure-ad', { callbackUrl: '/home' })`. Configured but not yet live (pending IT subdomain and App Registration redirect URI).
2. **"Login with Password"** — credentials form that calls `signIn('credentials', { password, redirect: false })` and redirects to `/home` on success. Controlled by `FALLBACK_PASSWORD` env var.

Branding (colours, logo, text) is driven by `src/config/site.ts`.

---

### `GET /expedite` — Expedite Queue

**Access:** Buyers (authenticated)  
**File:** `src/app/expedite/page.tsx`

Second step of the expediting workflow. Reads `selectedItems` and `supplierEmails` from the Zustand store — does not fetch from the database. Displays selected PO lines grouped by supplier in expandable cards.

**Per-supplier card features:**
- Collapsible line items table (fixed-layout columns: SAP MAT ID, Item Description, Open QTY, Open PO Value, Delivery Date, Status badge)
- Buyer name shown inline in card header (derived from selected line items)
- **TO email management** — default emails loaded from `supplier_contacts` via `getSupplierContacts()` Server Action. Shown as solid green pills. Buyer-added additional emails shown as outlined green pills. New emails typed into the input and confirmed are saved to the database via `addAdditionalSupplierEmail()` and reflected in Zustand.
- **CC email management** — pre-populated from buyer emails found in the selected lines; session-local only (not persisted to DB). Buyer can add or remove.
- **Pill visual language** — solid green = default DB contact, outlined green = additional DB contact, slate = CC recipient
- **Toast notifications** — 3-second auto-dismiss feedback on email save success/failure
- **Validation** — "Proceed to Review" validates that every supplier card has ≥1 TO email before navigating to `/expedite/confirm`

**Components used:** `Sidebar`, `SquareCheckbox`  
**Data sources:** Zustand store (selected items), `supplier_contacts` table via Server Action

---

### `GET /expedite/confirm` — Confirm & Dispatch

**Access:** Buyers (authenticated)  
**File:** `src/app/expedite/confirm/page.tsx`

Final step before emails are sent. Shows the full dispatch summary and allows the buyer to edit the email template.

**Email template panel:**
- Editable subject line (default: `Purchase Order Follow-Up – Action Required`)
- Editable body textarea with a default professional template
- Placeholder pill indicators: `{Supplier Name}` is substituted per supplier at send time inside the Server Action
- The supplier portal link is passed as a separate `supplierLink` field in the webhook payload — it is not embedded in the editable body text

**Dispatch summary table:**
- One row per supplier: supplier name, TO recipients (one per line), CC recipients (one per line), line count
- Inline cell editing — click a TO or CC cell to edit the comma-separated email list

**Send flow:**
1. Validation: every supplier must have ≥1 TO email
2. Calls `prepareAllExpediteDispatches()` Server Action with the full params array
3. Server Action UPSERTs all lines into `active_expediting` (one UUID token per supplier group)
4. Single fire-and-forget HTTPS POST to `N8N_EXPEDITE_WEBHOOK_URL` with the full suppliers array
5. Result shown: full success (green screen, "N suppliers notified") or partial/full failure (amber screen with per-supplier error detail and "Retry Failed" button)

**Retry:** Failed supplier groups can be retried — prior successes are preserved, only failed groups are re-dispatched.

**Components used:** `Sidebar`  
**Data sources:** Zustand store, `active_expediting` table via Server Action, n8n webhook

---

### `GET /supplier-update` — Supplier Portal

**Access:** Public — no authentication required, token-gated  
**Files:** `src/app/supplier-update/page.tsx`, `SupplierPortalForm.tsx`, `layout.tsx`

External-facing portal where suppliers submit delivery updates. Accessed via the unique link in the expediting email: `/supplier-update?token=<UUID>`.

**Token validation (`page.tsx` — Server Component):**
- Missing `?token=` param → "Link Not Found" static error page (red lock icon)
- Token not in `active_expediting` → "Link Not Found" static error page
- Any row with this token has `workflow_state = 'Submitted'` → "Updates Already Submitted" static page (amber icon)
- Valid token → renders `SupplierPortalForm` with full portal data

**Portal form (`SupplierPortalForm.tsx` — Client Component):**
- Supplier info bar: supplier name, buyer name, total line/PO counts
- Green instructions banner
- PO lines grouped by PO Number in expandable sections (all start expanded)
- **Per-line fields:** DS Status dropdown (DS01–DS18, required), New Delivery Date input, Comments textarea
- **Bulk-apply ("Set all lines →")** — button on each PO header opens an inline banner above the line items; supplier picks one status, date, and comments and clicks "Apply to all N lines" to populate all lines in that PO simultaneously. Purely client-side state; individual lines remain editable afterwards.
- **Validation:** Status code required on every line; scroll-to-first-error on failed submit attempt
- **Submit** calls `submitSupplierUpdates()` — transactional: updates all `active_expediting` rows, inserts `expediting_audit_log` rows, sets `workflow_state = 'Submitted'` (expires the link), rolls back on any error
- **Success screen:** thank-you message, NESR logo watermark, deactivation notice

**Layout (`layout.tsx`):** Completely isolated from the main app layout — no `SessionProvider`, no sidebar. Shows only the NESR-branded portal header (3px green top border, circular logo, "Supplier Delivery Update Portal" subtitle) and a `#f9fafb` content area. This isolation is intentional — the supplier portal must work without any authenticated session.

**Data source:** `active_expediting` JOIN `sap_open_po_master` via `getExpediteByToken()`

---

## API Routes

### `GET /api/pos`

Fetches all rows from `sap_open_po_master` ordered by `delivery_date ASC`. Used by the dashboard on mount. Marked `force-dynamic` — always reads fresh from the database, bypassing any Next.js response cache.

**Response:**
```json
{
  "data": [
    {
      "PO Number": "4500123456",
      "PO Line": "10",
      "Supplier Name": "ACME TRADING LLC",
      "Supplier ID": "1000123",
      "Buyer Name": "John Smith",
      "Item Description": "Valve, Gate, 4 inch",
      "SAP MAT ID": "000000000010012345",
      "Open QTY": 5,
      "Open PO Value USD": 12500.00,
      "Delivery Date": "2025-03-15T00:00:00.000Z",
      "Delivery Code": "DS05",
      "Country": "UAE",
      "Delivery Comments": "Shipment delayed due to customs",
      "Buyer Email": "j.smith@nesr.com"
    }
  ]
}
```

**Error (500):** `{ "error": "Failed to fetch purchase orders." }`

> **Note:** `po_release_date` exists in `sap_open_po_master` and is included in the `PurchaseOrder` TypeScript type, but the current SELECT in `src/app/api/pos/route.ts` does not yet return it. To expose it in the dashboard sub-rows, add `po_release_date AS "PO Release Date"` to the query.

---

## Server Actions

### `prepareAllExpediteDispatches(paramsList)` — `src/app/actions/expediteDispatch.ts`

The core dispatch orchestrator. Called from `/expedite/confirm` when the buyer clicks "Send Emails".

**Input type:**
```typescript
interface SupplierDispatchParams {
  supplierId: string;
  supplierName: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  emailBodyTemplate: string;  // May contain {Supplier Name} placeholder
  items: PurchaseOrder[];
}
```

**Phase 1 — DB inserts (sequential, one token per supplier group):**

For each supplier, a single UUID token is generated. Every PO line is written via:
```sql
INSERT INTO active_expediting
  (po_number, po_line, expedite_token, workflow_state, current_status, created_at, updated_at)
VALUES ($1, $2, $3, 'Email Sent', 'Pending Supplier Response', NOW(), NOW())
ON CONFLICT (po_number, po_line)
DO UPDATE SET
  expedite_token    = EXCLUDED.expedite_token,
  workflow_state    = 'Email Sent',
  current_status    = 'Pending Supplier Response',
  new_delivery_date = NULL,
  supplier_comments = NULL,
  buyer_comments    = NULL,
  updated_at        = NOW()
```

**Phase 2 — Webhook (single fire-and-forget call):**

After all inserts complete, a single HTTPS POST fires to `N8N_EXPEDITE_WEBHOOK_URL` using Node.js built-in `https.request` with `rejectUnauthorized: false`. The call is not awaited — the Server Action returns immediately and n8n processes the payload asynchronously.

**Webhook payload** (array of supplier objects):
```typescript
[{
  supplierName: string;
  supplierId:   string;
  toEmails:     string[];
  ccEmails:     string[];
  subject:      string;
  emailBody:    string;       // {Supplier Name} substituted; plain body text only
  supplierLink: string;       // NEXT_PUBLIC_APP_URL + /supplier-update?token=UUID
  poLines: [{
    poNumber:     string;
    poLine:       string;
    description:  string;
    openQty:      number;
    valueUsd:     number;
    deliveryDate: string;
  }]
}]
```

**Output:** `DispatchResult[]` — `{ supplierName, success, error? }` per supplier.

---

### `getSupplierContacts(supplierId)` — `src/app/actions/supplier-actions.ts`

Reads `supplier_contacts` for a given `supplier_id`. Parses comma-separated strings into arrays:
- `defaultEmails` — from `supplier_emails` column (Power BI sourced, daily sync)
- `additionalEmails` — from `additional_supplier_email` column (buyer-added, never overwritten by sync)
- `supplierName` — display name

Called in the Expedite Queue on initial load for each supplier card.

---

### `addAdditionalSupplierEmail(supplierId, newEmail)` — `src/app/actions/supplier-actions.ts`

Appends an email to `additional_supplier_email` in `supplier_contacts`. Reads the existing comma-separated list, deduplicates, and writes back via `INSERT ... ON CONFLICT (supplier_id) DO UPDATE`. Called when a buyer types and confirms a new TO email in the Expedite Queue.

---

### `getExpediteByToken(token)` — `src/app/actions/supplierPortal.ts`

Token validation with three possible return shapes:

| Return | Condition |
|---|---|
| `{ notFound: true }` | Token not in `active_expediting`, or JOIN returns no rows |
| `{ expired: true }` | Any row with this token has `workflow_state = 'Submitted'` |
| `PortalData` | Valid active token; includes supplier name, buyer name, and full line array from `active_expediting` LEFT JOIN `sap_open_po_master` |

---

### `submitSupplierUpdates(token, updates)` — `src/app/actions/supplierPortal.ts`

Transactional batch update using a dedicated `pg` client for explicit `BEGIN`/`COMMIT`/`ROLLBACK` control. For each line:
1. Fetches `active_expediting.id` for the token + po_number + po_line triplet
2. `UPDATE active_expediting SET current_status, new_delivery_date, supplier_comments, workflow_state = 'Submitted', updated_at = NOW()`
3. `INSERT INTO expediting_audit_log (active_expediting_id, status_submitted, new_delivery_date, comments, submitted_by, submitted_at) VALUES (..., 'Supplier', NOW())`

Full rollback on any error. Returns `{ success: true }` or `{ success: false, error: string }`.

---

## State Management

**Store:** `src/store/useExpediteStore.ts` (Zustand 5)

The store holds two pieces of state that must survive navigation between the dashboard, expedite queue, and confirm pages. It is in-memory only — resets on full page reload.

### Shape

```typescript
interface ExpediteState {
  selectedItems:  PurchaseOrder[];
  supplierEmails: Record<string, { to: string[]; cc: string[] }>;
  // supplierEmails keyed by supplierId
}
```

### Item identity

Items are compared by composite key to handle edge cases where fields may be undefined:
```
"PO Number::PO Line::SAP MAT ID"
```

### Actions

| Action | Description |
|---|---|
| `toggleSelection(item)` | Adds or removes one item by composite key |
| `selectMultipleLines(items)` | Adds items not already in the cart (no duplicates) |
| `deselectMultipleLines(items)` | Removes specified items |
| `clearSelection()` | Resets both `selectedItems` and `supplierEmails` to `{}` |
| `isSelected(item)` | Returns boolean — drives checkbox checked state |
| `setSupplierEmails(supplierId, { to, cc })` | Replaces the TO/CC arrays for one supplier |

---

## Authentication

**File:** `src/app/api/auth/[...nextauth]/route.ts`  
**Strategy:** JWT (no database session storage)

### Provider 1: Credentials (active)

Static password fallback via `FALLBACK_PASSWORD` env var. On correct password: session created as `{ id: '1', name: 'Admin User', email: 'admin@nesr.com' }`. Used while SSO is pending IT approval.

### Provider 2: Azure AD / Microsoft Entra ID (configured, not yet live)

Uses `next-auth/providers/azure-ad` with NESR App Registration credentials. Fully configured in code. Inactive because:
1. IT has not yet provisioned the `expediting.nesr.com` CNAME
2. The redirect URI `https://expediting.nesr.com/api/auth/callback/azure-ad` has not been added to the existing Entra ID App Registration

No code changes needed once IT completes both actions.

### Route protection

`src/middleware.ts` uses `withAuth` from NextAuth. Protected by default; the `matcher` explicitly **excludes**:

```
/api/auth/*            NextAuth internal routes
/login                 Login page (prevents redirect loops)
/supplier-update       Supplier portal (no session required; token-gated instead)
/_next/static          Next.js static assets
/_next/image           Next.js image optimisation
/favicon.ico           Browser favicon
/nesr-logo.jpg         Public image
/nesr-logo-circle.png  Public image
```

All other routes redirect unauthenticated requests to `/login`.

---

## n8n Workflows

All three workflows run in the self-hosted n8n instance on the Azure VM at `n8n.nesr.com`.

---

### Workflow 1 — Open POs Data Loader (Daily Sync)

**Trigger:** Schedule — weekday mornings  
**Purpose:** Truncates and reloads `sap_open_po_master` with the current SAP open PO snapshot from Power BI

**Node sequence:**

| # | Node | Description |
|---|---|---|
| 1 | Schedule Trigger | Fires at configured weekday time |
| 2 | Get Power BI Token | HTTP POST to Microsoft OAuth token endpoint; returns bearer token using Entra ID App Registration credentials |
| 3 | Code (JavaScript) | Builds DAX query payload with all filter criteria (see Table A section) |
| 4 | Get Table Data | HTTP POST to `https://api.powerbi.com/v1.0/myorg/datasets/{DATASET_ID}/executeQueries` with DAX query |
| 5 | Execute SQL | `TRUNCATE sap_open_po_master` |
| 6 | Code (JavaScript) | Maps Power BI JSON response key names to PostgreSQL column names |
| 7 | Split Out | Splits the rows array into individual items |
| 8 | Loop Over Items | Batches rows for insert |
| 9 | Insert rows | Bulk inserts into `sap_open_po_master` |

---

### Workflow 2 — Supplier Contacts Sync (Daily Upsert)

**Trigger:** Schedule — daily  
**Purpose:** Keeps `supplier_contacts` populated with default supplier emails from Power BI

Uses **UPSERT** (never truncate) so that buyer-added `additional_supplier_email` values are never overwritten. Only `supplier_emails` and `supplier_name` are updated from the sync source.

---

### Workflow 3 — Email Dispatch (Webhook-triggered)

**Trigger:** `POST https://n8n.nesr.com/webhook/expedite-email-dispatch`  
**Purpose:** Sends HTML expedition emails to suppliers  
**Response mode:** Respond Immediately — the Next.js Server Action does not await the response

**Node sequence:**

| # | Node | Description |
|---|---|---|
| 1 | Webhook | Receives POST from `prepareAllExpediteDispatches()`. Responds 200 immediately so the Vercel function is not held open. Payload: array of supplier objects (see Server Actions section). |
| 2 | Split Out | Splits the suppliers array so each supplier flows through the remaining nodes as a separate item |
| 3 | Code (JavaScript) | Builds the full HTML email body: NESR-branded header, body text with `{Supplier Name}` already substituted, PO lines table (PO Number, Line, Description, Open QTY, Value USD, Delivery Date), green CTA button linking to `supplierLink`, footer disclaimer |
| 4 | Send a message (Outlook) | Sends via Microsoft Graph API OAuth2 for `digital.supplychain@nesr.com`. Body type: HTML. TO: `toEmails` array. CC: `ccEmails` array. |

---

## Component Reference

### `LineItemDrawer`

Slide-out panel from the right edge. Triggered by clicking a dashboard sub-row. Shows three sections:
- **Material Information** — SAP MAT ID, Item Description, Open QTY, Open PO Value
- **Supplier Details** — Supplier Name, Supplier ID, Country
- **Expediting Details** — Delivery Date, Delivery Code (with full DS label from map), Delivery Comments

CSS `transform: translateX` animation (300ms ease-in-out). Backdrop click closes. Body scroll locked when open. Uses delayed unmount pattern to play exit animation before DOM removal.

### `Sidebar`

Slide-in navigation drawer (280px wide). Opened by hamburger button in dashboard header.

- **Header** — NESR logo, close button
- **Nav links** — All Tools (`/home`), Dashboard (`/`), Expedite Queue (`/expedite`) with live badge showing Zustand cart count. Active link: left green border stripe + background tint.
- **Profile block** — user initials avatar, full name, job title from session (`(session.user as any).jobTitle` with `'Admin'` fallback)
- **Sign Out** — `signOut({ callbackUrl: '/login' })`

Closes on: Escape key, backdrop click, nav link click. Body scroll locked when open.

### `MultiSelectDropdown`

Used in the dashboard filter bar. Props: `options`, `selectedOptions`, `onChange`, `label`, `displayMap?`. The `displayMap` allows raw values (e.g., `DS04`) to display as human-readable labels (e.g., `DS04 - PO Acknowledged - Delivery On time`). Searchable (auto-focused on open). Click-outside detection. Checkbox items.

### `SquareCheckbox`

A `forwardRef` wrapper around `<input type="checkbox">`. Adds `indeterminate` prop support via `ref.current.indeterminate` (needed for partial PO selection state). Brand green focus ring and accent colour.

### `Providers`

Wraps all children in NextAuth `SessionProvider`, enabling `useSession()` throughout the buyer-facing app. Rendered in the root layout `src/app/layout.tsx`.

---

## Design System

| Token | Value | Usage |
|---|---|---|
| Brand green (buyer app) | `#307c4c` | Buttons, active states, badges, links — all buyer-facing UI |
| Supplier portal green | `#059669` | Supplier portal submit button and accents — visually distinct from buyer app |
| Danger | `#ef4444` (red-500) | Error states, past-due indicators |
| Warning | `#f59e0b` (amber-500) | Due-soon indicators, partial failure states |
| Font | Geist Sans / Geist Mono | Body text / PO numbers, IDs, numeric columns |

### Custom CSS (`src/app/globals.css`)

| Rule | Description |
|---|---|
| `.skeleton-shimmer` | Left-to-right gradient shimmer (1.5s) on loading placeholder rows |
| `.expand-grid` / `.expand-grid.open` | `grid-template-rows: 0fr → 1fr` CSS trick for smooth height-agnostic expand/collapse of PO sub-tables (280ms ease-in-out). Does not require knowing the content height. |
| `@theme inline` | Pipes `--font-geist-sans`, `--font-geist-mono`, and `--color-nesr-green` into Tailwind's design token system |

---

## Local Development Setup

### Prerequisites

- **Node.js** 20 or later
- **npm** 10 or later
- Access to the PostgreSQL database (either local install or via the Ngrok tunnel)

### Steps

**1. Clone and install**
```bash
git clone <repo-url>
cd expediting_tool
npm install
```

**2. Configure environment variables**

Create `.env.local` in the project root with all variables listed in the [Environment Variables](#environment-variables) section. For local development:

```bash
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:password@0.tcp.ngrok.io:PORT/expediting_db
```

**3. Run the development server**
```bash
npm run dev
```

App available at `http://localhost:3000`. Log in with the password set in `FALLBACK_PASSWORD`.

**4. Production build**
```bash
npm run build
npm run start
```

### npm scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Next.js development server with hot reload |
| `npm run build` | Compile production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

### Ngrok tunnel (Windows 10 DB machine)

If the tunnel is not running or has restarted after a machine reboot:

1. On the Windows 10 machine: start the Ngrok agent with the TCP tunnel configured for port 5432
2. Note the new `N.tcp.ngrok.io:PORT` address from the Ngrok dashboard
3. Update `DATABASE_URL` in **three places**:
   - `.env.local` (local dev)
   - Vercel → Project Settings → Environment Variables (production)
   - n8n → Credentials → PostgreSQL node(s) used by both sync workflows

---

## Pending Items & Known Issues

### 1. SSO not yet live

The Azure AD provider is fully configured in code. The two remaining actions are on IT's side:

- **Provision** `expediting.nesr.com` CNAME pointing to the Vercel deployment
- **Add redirect URI** `https://expediting.nesr.com/api/auth/callback/azure-ad` to the existing Entra ID App Registration (same registration used by other NESR internal tools)

After both are done, update `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` in Vercel env vars to `https://expediting.nesr.com`. No code changes required.

### 2. `dispatched_by` and `dispatched_at` not populated

`active_expediting` has both columns but neither is written by the current Server Action. The action runs server-side and does not currently receive the authenticated user's identity. Will be wired up once SSO provides real user sessions with known email identities.

### 3. Responses/Export page not yet built

A planned `/expedite/responses` page will display supplier responses scoped to the logged-in buyer's POs and offer a CSV export with columns:

```
Purchase Order | Purchase Order Item | New Delivery Date |
Delivery Status Code | Delivery Comments
```

Delivery Comments will concatenate supplier comments and buyer comments. This page is blocked on SSO being live so responses can be filtered per buyer.

### 4. Ngrok tunnel address changes on restart

If the Windows 10 machine reboots or the Ngrok agent stops, the TCP address and port will change. All three `DATABASE_URL` locations must be updated (see Ngrok tunnel section above). Consider a paid Ngrok plan with a reserved TCP address to eliminate this operational overhead.

### 5. `po_release_date` not returned by `/api/pos`

The column exists in the database and the TypeScript type includes `'PO Release Date'?: string`, but the SELECT in `src/app/api/pos/route.ts` does not yet include it. To fix, add to the query:
```sql
po_release_date AS "PO Release Date"
```

### 6. UNIQUE constraint on `active_expediting` required

The UPSERT in `expediteDispatch.ts` depends on `ON CONFLICT (po_number, po_line)`. Confirm the constraint exists before deploying:
```sql
ALTER TABLE active_expediting
  ADD CONSTRAINT active_expediting_po_number_po_line_key
  UNIQUE (po_number, po_line);
```
Without it the `ON CONFLICT` clause will throw an error and all dispatches will fail.
