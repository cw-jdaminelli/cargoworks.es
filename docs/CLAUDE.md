# Cargoworks — Project Instructions for Claude Code

Read this entire file before touching any code. These are standing decisions.
Do not invent alternatives. Do not suggest rewrites. Follow these rules in every session.

The AI assistant working on this project is **Claude Code** running in GitHub Codespaces.

---

## What this project is

Cargoworks is a cargo bike logistics platform operating in Barcelona.
Live at cargoworks.es. One operator (Julian), one rider currently, expanding.

The project is in active migration from a legacy stack to a modern one.
Both stacks coexist during migration. Never delete legacy files — deprecate them by renaming to `.legacy` suffix.

---

## Current (legacy) stack — DO NOT REWRITE, only read and reference

```
GitHub Pages (static HTML/CSS/JS)
  index.html              — client booking form
  admin/dispatcher.html   — admin dispatcher tool
  rider.html              — rider panel
  tracking.html           — order tracking

apps-script/Code.gs       — backend (~3000 lines, Google Apps Script)
  adminGeocode            — Google Maps proxy (CORS workaround)
  adminRoute              — routing proxy
  adminCreatePayment      — Stripe session creation
  doPost()                — webhook receiver

data/prices.json          — pricing zones and rates
js/js/map.js              — client-side pricing engine
js/js/dispatcher-admin.js — dispatcher logic
js/js/tracking.js         — tracking page logic
```

**Critical Apps Script rule:** All POST requests to Apps Script must use
`Content-Type: application/x-www-form-urlencoded` with a `payload=` field containing
JSON-stringified data. Never use `application/json` — Apps Script rejects it with CORS errors.

**Google Calendar as database:** Every order is a Google Calendar event.
Order state is encoded in the event description as JSON. Do not add new Calendar event writes
to the new stack — all new writes go to Supabase.

---

## Target (new) stack — build here

```
/cargoworks-next/          — new Next.js app (App Router, TypeScript)
  app/
    booking/               — client booking flow
    dispatcher/            — admin tool
    rider/                 — rider panel
    tracking/[id]/         — order tracking
    api/
      geocode/             — Google Maps proxy
      route/               — routing proxy
      payments/            — Stripe session creation
      webhooks/
        stripe/            — Stripe webhook receiver (also triggers Quipu invoice)
      invoices/            — Quipu invoice creation
  lib/
    supabase.ts            — database client
    stripe.ts              — Stripe helpers
    maps.ts                — geocoding + routing
    quipu.ts               — invoicing
  supabase/
    migrations/            — schema files
```

**Hosting:** Vercel (free Hobby tier). Auto-deploy on push to main.
**Database:** Supabase (free tier). PostgreSQL.
**Invoicing:** Quipu API. Handles Verifactu compliance automatically.
**Payments:** Stripe (unchanged from legacy).
**Email:** Resend (free tier, 3000/month).
**No Zapier. No middleware.** The Stripe webhook receiver calls Quipu directly in code.

---

## Supabase schema — agreed, do not modify without explicit instruction

```sql
orders (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  status text not null default 'pending',
  -- status values: pending / confirmed / in_progress / delivered / cancelled
  pickup_address text,
  dropoff_address text,
  stops jsonb default '[]',
  customer_name text,
  customer_phone text,
  customer_email text,
  scheduled_date date,
  scheduled_time text,
  price_net numeric(10,2),
  price_vat numeric(10,2),
  price_total numeric(10,2),
  payment_url text,
  payment_status text default 'unpaid',
  -- payment_status values: unpaid / paid / refunded
  rider_id uuid references riders(id),
  invoice_id text,
  notes text,
  calendar_event_id text, -- legacy reference, read-only
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)

riders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  status text default 'active'
)

clients (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  email text,
  fiscal_name text,
  nif text,
  fiscal_address text,
  invoice_preference text default 'simplificada'
  -- invoice_preference values: simplificada / completa
)
```

---

## Migration phases — current progress

- [ ] Phase 1: Supabase schema created + Calendar migration script
- [ ] Phase 2: Quipu replaces Declarando (invoicing + tax presentations)
- [ ] Phase 3: Next.js API routes (geocode, route, payments, webhooks->Quipu, invoices)
- [ ] Phase 4: Next.js frontend (tracking, rider, booking, dispatcher)
- [ ] Phase 5: Supabase Auth (admin, rider, client accounts)
- [ ] Phase 6: Kill Apps Script + Google Calendar as DB

When a phase is complete, mark it [x] here and commit.

---

## How to work on this project

### The only question before writing any code

"Does this belong in the legacy stack (fix/maintain) or the new stack (build fresh)?"

- Legacy broken and needs a quick fix -> edit the legacy file, minimal change only
- New functionality -> build it in /cargoworks-next/
- Never add new features to Apps Script — it's being retired

### Change style

- Targeted minimal edits only. Never rewrite entire files.
- Never create files outside the agreed structure above.
- One session = one task. Do not scaffold ahead. Do not create files "for later."
- If the user says "the geocode route," touch ONLY the geocode route and its test.
- If uncertain about file placement, ask before creating.

### Testing before committing

Every change tested with a real request before commit.
- Apps Script changes: deploy new version, test endpoint manually.
- Next.js: run `npm run dev`, verify in browser via forwarded port.
- Supabase: verify query in Supabase dashboard before adding to code.

### What not to do

- Do not install packages without asking first.
- Do not create a `utils/` folder — shared logic goes in `lib/`.
- Do not use `any` TypeScript types — be explicit.
- Do not leave console.log in committed code.
- Do not touch `prices.json` or `map.js` — pricing engine is stable and complex.
- Do not suggest switching from Quipu, Stripe, Supabase, Vercel — decided.
- Do not suggest Docker, Redis, Zapier, or extra infrastructure.

---

## Environment variables

Exist in Vercel and Codespaces secrets. Never hardcode. Never log.

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
GOOGLE_MAPS_API_KEY
ANTHROPIC_API_KEY        — server-side only, never in client bundle
QUIPU_API_KEY
RESEND_API_KEY
```

The Anthropic API key must NEVER be used client-side in the new stack.
Legacy stack has it in sessionStorage — do not replicate that pattern.

---

## Pricing engine — read only, do not touch

The pricing engine in `map.js` is complex and battle-tested. Do not rewrite it.
When the new stack needs pricing, extract the pure calculation functions without modifying them,
or call the legacy endpoint during transition.

Key rules:
- perKm gets a x1.1 markup before use
- Stops fee: EUR 1.25 x count if count >= 3
- >=5 stops auto-promotes cargo to large (+20%)
- Surcharge: 25% weekend/holiday, 25% after-hours, stackable
- VAT always 21%, added on top of everything
- Never rewrite address fields — geocoded coordinates are internal only

---

## Fiscal and invoicing rules

Cargoworks is a Spanish autonomo operation.
All issued invoices must be Verifactu-compliant. Quipu handles this — do not build custom invoicing.

Invoice types:
- `simplificada` — B2C, no buyer NIF, under EUR 400
- `completa` — B2B, requires buyer fiscal name + NIF + address

Booking form fiscal toggle:
- Default: simplificada (no extra fields)
- Toggle on: show fiscal_name, nif, fiscal_address
- Saves to clients table if client has an account

The Stripe webhook receiver (Phase 3) must, on `payment_intent.succeeded`:
1. Update the order in Supabase (payment_status = paid)
2. Call Quipu API to create the invoice (completa or simplificada based on order data)
3. Store the returned Quipu invoice_id back on the order

---

## Who is working on this

Julian — founder, non-developer, drives this via Claude Code in GitHub Codespaces.
Hardware: Chromebook C423NA (low spec) — everything runs in Codespaces, never local.
Julian tests and adjusts code with Claude Code's help.
Explain what each change does in plain terms. No unexplained magic.

One future rider-developer may join. Codebase must be self-explanatory.
Standard patterns only. No clever abstractions.

---

## SESSION LOG PROTOCOL — Claude Code must follow this

At the START of every session, Claude Code reads the "Session log" section below
to see what was done last and what's pending.

At the END of every session, BEFORE the user closes the session, Claude Code MUST
append a dated entry to the "Session log" section with:
- Date
- Phase and task worked on
- Files created or modified (full paths)
- What was completed
- What was tested and the result
- What is left / next step
- Any decision made or open question

Claude Code updates this file as the last action of every session, then commits it
with message "session log: <date> <short summary>".

If the user ends abruptly, Claude Code still writes the log entry from what was done so far.

---

## Session log

### [TEMPLATE — copy this format for each entry]
**Date:** YYYY-MM-DD
**Phase / task:**
**Files touched:**
**Completed:**
**Tested:**
**Next step:**
**Notes / decisions:**

---
(entries appear below, newest at top)
