# Settlewise

> **Collections-focused invoicing and cashflow management for Indian freelancers, consultants, and boutique agencies.**

Settlewise is built around a single premise: **issuing an invoice is only the first step — what matters is getting settled.**

Instead of just generating static PDFs, Settlewise pairs a clean modern web application with a **Streamable HTTP Model Context Protocol (MCP)** server. You can manage invoices yourself or let **Claude.ai** create invoices, search client records, log partial UPI/bank transfers, and schedule automated milestone reminders through simple conversational prompts.

---

## Key Features Implemented

- **Overview Dashboard (`/overview`):**
  - Live financial cards: Total Invoiced, Collected, Outstanding, and Critical Overdue.
  - Cash collection efficiency rate (`paid amount / total invoiced`) with visual progress tracking.
  - Quick-filtered invoice lists, recent payment audits, and overdue account summaries.

- **Customer Management (`/customers`):**
  - Email deduplication per account.
  - Customer detail views showing lifetime invoiced, total collected, outstanding balance, and full payment audit history.
  - Financial safety rules: deletion is blocked if customer has existing invoices.

- **Invoicing Engine (`/invoices`):**
  - **Rule #3 Financial Precision:** All money stored and computed strictly server-side in **integer paise** (never floating point).
  - GST / tax percentage calculation and flat discount support.
  - Sequential invoice numbers (`INV-0001`, `INV-0002`, …) per user.
  - Status derived at read time (**Rule #5**): `draft` → `sent` → `viewed` → `partially_paid` → `paid` → `overdue` → `cancelled`.

- **Client-Facing Hosted Invoice (`/i/[token]`):**
  - Accessible via secure 24-character token with **zero login required**.
  - Draft protection: returns 404 for drafts or cancelled invoices.
  - Built-in UPI and Bank transfer settlement instructions.
  - Clean print stylesheet (`@media print` for Ctrl+P / Save as PDF without bloated PDF libraries).
  - First-view tracking and deduplicated view counts (owner views ignored when logged in).

- **Payment Recording & Audit:**
  - Support for multiple and partial payments in atomic database transactions.
  - Rejects payments exceeding outstanding balance.
  - Honest audit labeling: all user-recorded payments are transparently tagged `"Manually recorded"`.

- **Automated Milestone Reminders (`/reminders`):**
  - Auto-schedules milestone follow-ups for newly issued invoices: `-3 days` (before due), `0 days` (due date), `+3 days`, `+7 days`, and `+14 days` overdue.
  - **Honest Test Mode by default:** Reminders are safely simulated and marked `"Simulated (test mode)"` unless Resend is configured.
  - UI controls: pause, resume, edit scheduled date/message, and immediate `"Send now"`.
  - Automatic halt: when an invoice balance reaches zero or is cancelled, pending reminders automatically transition to `skipped`.
  - Daily Vercel Cron trigger (`/api/cron/reminders`) running at 04:00 UTC (09:30 AM IST).

- **10 Native Claude MCP Tools:**
  1. `find_customer(query)`
  2. `create_customer(...)`
  3. `create_invoice(...)`
  4. `get_invoices(status?, customer_id?, search?, ...)` (with `list_invoices` backwards-compatible alias)
  5. `update_invoice(invoice_id or invoice_number, ...)`
  6. `record_payment(invoice_id or invoice_number, amount, ...)`
  7. `get_collection_summary(from_date?, to_date?)`
  8. `get_customer_history(customer_id or name)`
  9. `schedule_reminder(invoice_id or invoice_number, scheduled_date, type, ...)`
  10. `send_payment_reminder(invoice_id or invoice_number, custom_subject?, custom_message?)`

---

## Known Limitations

1. **Single Currency per Invoice:** Defaults to INR (`₹`). Multi-currency conversion rates are not included in v1.
2. **Whole Unit Quantities:** Invoice items accept integer quantities (e.g. 1, 5, 20). Fractional hours (e.g. 1.25 hrs) can be represented by adjusting the unit rate.
3. **Daily Cron Cadence:** On Vercel Hobby plans, cron jobs run once per day (`0 4 * * *` = 09:30 AM IST). For on-demand demonstration runs, the dashboard includes a `"▶ Run Reminders Now"` button.

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required? | Example | Purpose |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | `postgresql://...` | PostgreSQL connection string (Neon, Supabase, or pooled database). |
| `AUTH_SECRET` | **Yes** | `random_32_chars` | Secret key for Auth.js session encryption. |
| `NEXTAUTH_SECRET` | **Yes** | `random_32_chars` | Compatibility key for NextAuth sessions. |
| `APP_URL` | **Yes** | `https://settlewise-b6v3.vercel.app` | Base URL used to construct public invoice links and MCP URLs. |
| `NEXTAUTH_URL` | Optional | `http://localhost:3000` | Localhost fallback URL. |
| `CRON_SECRET` | **Yes (Prod)**| `f89c24b1e56a73d092c4b817e43681d2` | Bearer token securing the `/api/cron/reminders` endpoint. |
| `RESEND_API_KEY` | Optional | `re_123456...` | If provided, sends real emails. If omitted, runs in **Test Mode**. |
| `RESEND_FROM_EMAIL` | Optional | `billing@yourdomain.com` | Verified sender address in Resend. |

---

## Local Setup

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/jeevanraj25/Settlewise.git
cd Settlewise
pnpm install
```

### 2. Configure Environment Variables
```bash
cp .env.example .env
# Fill in your DATABASE_URL, AUTH_SECRET, and CRON_SECRET
```

### 3. Initialize Database & Seed Demo Data
```bash
# Push schema to database
pnpm exec prisma db push

# Seed sample invoices and demo user
pnpm run seed
```

### 4. Start Development Server
```bash
pnpm run dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## Deployment to Vercel

1. Push your repository to GitHub:
   ```bash
   git add .
   git commit -m "feat: complete Settlewise build"
   git push origin main
   ```
2. Log into [Vercel](https://vercel.com) and click **Add New Project** → Import `Settlewise`.
3. In **Settings → Environment Variables**, add:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `NEXTAUTH_SECRET`
   - `APP_URL` (`https://<your-project>.vercel.app`)
   - `CRON_SECRET`
4. Click **Deploy**. Vercel will build the application and automatically register the daily reminder cron defined in `vercel.json`.

---

## Connecting Claude to Settlewise (Exact Steps)

You can connect Claude.ai directly to your live Settlewise app using the Model Context Protocol (MCP):

### Step 1: Copy your Personal MCP Endpoint URL
1. Log into your deployed Settlewise app.
2. Go to **Settings** (`/settings`).
3. Scroll to the **Claude MCP Integration** card.
4. Click the **Copy** button next to your personal MCP URL:
   ```text
   https://settlewise-b6v3.vercel.app/api/mcp?key=YOUR_SECRET_TOKEN
   ```

### Step 2: Add Custom Connector in Claude.ai
1. Open **[Claude.ai](https://claude.ai)** in your browser.
2. Click your profile avatar / name in the bottom left corner and select **Settings**.
3. In the settings sidebar, click **Connectors** (or **Integrations**).
4. Click **Add Custom Connector** (or **Add Connector**).
5. Fill in the connector details:
   - **Name:** `Settlewise`
   - **MCP Server URL:** Paste the URL copied in Step 1 (containing your `?key=...`).
   - **Authentication:** Select **None / No sign in** (authentication is handled securely by the token in the URL).
6. Click **Save** (or **Connect**).

> **Tip:** If you had previously connected Settlewise during Phase 1, click **Disconnect** on the existing connector and re-add it once. This forces Claude to refresh its tool cache and discover all 10 tools.

### Step 3: Example Prompts to Try in Claude
- *"Search Settlewise for customer 'Rahul' and tell me his contact info and how many invoices he has."*
- *"Show me a collection summary for this month: total invoiced, collected, and outstanding balance."*
- *"Create an invoice in Settlewise for Rahul Sharma (rahul@test.com) for ₹45,000 for 'Brand Identity & Web Design', due in 15 days."*
- *"Record a partial payment of ₹20,000 for invoice INV-0006 via UPI with reference UPI-998877."*
- *"Schedule a payment reminder for invoice INV-0006 for 3 days before its due date."*

---

## Seed Demo Credentials

To test immediately without signing up:

- **Login URL:** `/login`
- **Email:** `demo@collectly.test`
- **Password:** `demo1234`
- **Pre-loaded Data:** 4 sample invoices across various states (Sent, Overdue, Partially Paid, and Draft) with sample payment history and client records.
