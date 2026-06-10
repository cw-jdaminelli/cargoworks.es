# Business Account MVP — Claude Code Instructions

Read this file at the start of every session on this feature. Read it fully.
Then read CLAUDE.md and the latest session log entry. Then start work.

This file lives at the repo root alongside CLAUDE.md. Do not move it.

---

## What we're building next

A minimum-viable business account system. First client: Marea Verde (flower and plant shop, Barcelona). Ship by Monday morning.

The system lets a trusted business client:
- Place orders without going through Stripe payment each time
- Have all orders logged against their account
- See their order history in a token-based panel
- (Invoicing handled manually by operator in Declarando until later)

Operator (Julian) manages accounts by editing Script Properties directly. No admin UI this right now.

---

## Architecture (stays on existing stack)

- Apps Script `Code.gs` — backend
- Google Calendar — order database
- Existing booking form in `js/js/map.js` — frontend
- New page `account.html` at repo root — client-facing panel
- Script Properties — `ACCOUNT_TOKENS` JSON for account configs

No new infrastructure. No Supabase, Vercel, Quipu integration right now.
Defer all of those to the bigger migration plan tracked in CLAUDE.md.

---

## ACCOUNT_TOKENS structure

Stored in Apps Script → Project Settings → Script Properties under key `ACCOUNT_TOKENS` as JSON.

```json
{
  "BIZ-INTERNAL": {
    "name": "Cargoworks Internal",
    "fiscalName": "Cargoworks Internal",
    "nif": "",
    "fiscalAddress": "",
    "billingEmail": "",
    "operationsEmail": "",
    "phone": "",
    "dailyLimit": 3,
    "active": true,
    "requiresStaffName": true,
    "requiresPickupTime": true,
    "requiresDropoffTime": true,
    "requiresAttName": true,
    "requiresAttContact": true,
    "trialEndsDate": "",
    "trialNotes": "",
    "notes": "Test account, 3/day limit"
  },
  "BIZ-MAREAVERDE": {
    "name": "Marea Verde",
    "fiscalName": "[their razon social]",
    "nif": "[their NIF]",
    "fiscalAddress": "[their fiscal address]",
    "billingEmail": "[their billing email]",
    "operationsEmail": "[their ops email]",
    "phone": "[their phone]",
    "dailyLimit": 100,
    "active": true,
    "requiresStaffName": true,
    "requiresPickupTime": true,
    "requiresDropoffTime": true,
    "requiresAttName": true,
    "requiresAttContact": true,
    "trialEndsDate": "2026-06-30",
    "trialNotes": "Free trial June 2026. mverde30 promo active separately. Renegotiate end of June.",
    "notes": "Flower/plant shop, time-sensitive gift deliveries"
  }
}
```

Operator-chosen tokens, format `BIZ-NAME` in uppercase. Token validation is
case-insensitive and whitespace-trimmed.

---

## Tokens vs promo codes — never overlap

A string can be either a token OR a promo code, never both. Enforce this in code:

- Helper `isStringAlreadyUsed(s)` checks both ACCOUNT_TOKENS keys and the promo code store
- `adminCreateAccount` would call this before saving (not built this week, but the helper exists for future use)
- Manual account creation (next few days, in Script Properties) requires operator to check by hand — document the rule

---

## Backend tasks (Code.gs only)

> Status: Steps 1–9 implemented in `apps-script/Code.gs`. Steps 5 confirmed working. Steps 6–9 deployed, pending end-to-end test.

### 1. ACCOUNT_TOKENS structure documented in code comments

A clear comment block near the top of Code.gs explaining the schema.

### 2. Helper: `isStringAlreadyUsed(s)`

Returns `true` if `s` matches any existing account token (case-insensitive) or any existing promo code. Used to prevent collisions in future.

### 3. Helper: `checkAccountDailyLimit(token, dailyLimit)`

Queries the Orders Calendar for events from today (00:00 local time to now) with `accountToken === token`. Returns `{ allowed: boolean, used: int, limit: int }`.

### 4. Helper: `getAccountConfig(rawToken)`

- Trims whitespace and uppercases input
- Looks up in ACCOUNT_TOKENS
- Returns config object or null
- If found but `active === false`, return null

### 5. New endpoint: `validateAccountToken` (GET action)

Input: `?action=validateAccountToken&token=X`
Behaviour:
- Calls `getAccountConfig(token)`
- If valid: returns `{ valid: true, accountName, requires: { staffName, pickupTime, dropoffTime, attName, attContact } }`
- If invalid or inactive: returns `{ valid: false, reason: "Account not found or inactive" }`

Frontend calls this when token is entered in booking form to know which fields to show.

### 6. Modify `doPost` for account orders

When `payload.accountToken` is provided:
- Call `getAccountConfig(token)`
- If invalid: return clear error response
- Call `checkAccountDailyLimit` — if not allowed, return error with friendly message
- Skip `createStripeSession`
- Set `paymentStatus = 'Account'`, `paymentMode = 'account'`
- Save extra fields from payload into Calendar event description JSON: `staffName, pickupTime, dropoffTime, customerName, attName, attContact`
- Save the account token itself on the event so we can query later
- Return: `{ reference, paymentMode: 'account', trackingUrl, accountName }`
- Do NOT return clientSecret (no payment to make)

### 7. Stripe webhook safety check

In the existing Stripe webhook handler in `doPost`: at the very top, if the order being looked up has `paymentMode === 'account'`, return `{ ok: true, ignored: 'account order' }` and exit. Prevents Stripe-related errors from polluting account orders.

### 8. Operator email notification on every account order

After successfully creating an account order, send an email to operator (Julian's email, hardcoded for now or read from a new Script Property `OPS_NOTIFICATION_EMAIL`). Subject: `[Cargoworks] New account order: {accountName} — {reference}`. Body: order summary including all extra fields, tracking link, dispatcher link.

This is the "you're not online at 11pm" safety net.

### 9. New endpoint: `accountOrders` (GET action)

Input: `?action=accountOrders&token=X`
Behaviour:
- Validates token via `getAccountConfig`
- Queries Calendar for all events where `accountToken === token`
- Returns: `{ accountName, orders: [{ reference, status, paymentStatus, date, pickup, dropoff, stops, total, trackingUrl, staffName, pickupTime, dropoffTime, customerName, attName, attContact }] }`
- Sort by date descending (newest first)
- Limit to last 100 orders by default (more than enough for a panel view)

---

## Frontend tasks

> Status: Steps 10–13 not yet started. Next session.

### 10. Booking form changes (`js/js/map.js`)

Reuse the existing promo/discount code input field. When user enters something and tabs out or hits a debounced delay:

- Call `validateAccountToken` endpoint
- If `valid: true` (it's an account token):
  - Save to localStorage as `cwAccountToken`
  - Visually mark the field as "Account confirmed: {accountName}"
  - Unfurl additional fields based on `requires` flags:
    - Staff name (who is placing this order from the team)
    - Pickup time (specific time, with note about possible surcharge)
    - Dropoff time (specific time, with note about possible surcharge)
    - Customer/recipient name
    - Attention name (att — who's the order for)
    - Attention contact (phone or email of att person)
  - Group these visually under a header: "Additional details for {accountName}"
  - Change submit button text from "Pay & Book" to "Place order on {accountName} account"
  - Suppress Stripe modal initialization
- If not a token: treat as normal promo code (existing logic, no changes)
- On page load: check localStorage for `cwAccountToken`, pre-fill the field, re-validate (in case token was revoked since last visit)

### 11. Booking submission for account orders

When form is submitted with a valid account token:
- Include all extra fields in `buildBookingPayload`: `accountToken, staffName, pickupTime, dropoffTime, customerName, attName, attContact`
- After backend response, if `paymentMode === 'account'`:
  - Skip Stripe entirely
  - Show inline confirmation: "Order placed on {accountName} account. Reference: {reference}. Track it here: {trackingUrl}. Invoice will be issued at end of billing cycle."
  - Reset the form for the next order (keep the account token pre-filled)

### 12. `account.html` new file at repo root

- Token from `?token=X` URL param OR manual input field
- Matches existing site styling (Inter body, Oswald headings, purple/coral/green palette)
- Header: "Cargoworks — Business Account Orders"
- Subheader: "Account: {accountName}"
- Table columns: Ref / Date / Route (pickup → dropoff) / Staff / Att / Status / Total / [Track →]
- If order has stops, show stop count as badge
- Auto-refresh every 60 seconds
- Search/filter input that filters client-side by reference, staff name, att name
- Footer: "For billing questions contact us at [contact]"
- No password — token IS the auth
- Mobile-friendly (Marea Verde staff likely on phones in shop)

### 13. Dispatcher view check

Verify (not necessarily change) that dispatcher.html correctly handles orders with `paymentStatus === 'Account'`:
- They should appear in the assignment queue same as paid orders
- Visually distinct (a badge or color) so operator knows they're billable later
- All extra fields (staff name, pickup time, att, etc.) should be visible in order detail
- If anything is broken or unclear, fix it

---

## What's explicitly OUT of scope this week

- Admin UI for creating/editing accounts (operator edits Script Properties manually)
- CSV export of account orders
- Account-side "request invoice" button
- Stripe payment for invoices from account panel
- Mark-invoiced / mark-paid endpoints
- Rate limiting per minute (daily limit is enough)
- Credit limit enforcement (no `creditLimit` field, defer)
- Visual overdue indicators
- Token rotation flow
- Per-employee individual logins
- Email confirmations to the recipient/att person
- Order modification after placement
- Analytics dashboards

If something in this list comes up during the session, defer it. Add it to the session log as "deferred: {item}" so we know to come back to it.

---

## Code style and constraints (reiterating CLAUDE.md)

- Targeted minimal edits only. No rewrites.
- Use existing patterns in Code.gs — don't introduce new ones unless necessary.
- All POSTs to Apps Script use `application/x-www-form-urlencoded` with `payload=` field containing JSON-stringified data.
- New endpoints (validateAccountToken, accountOrders) are GET actions, return JSON.
- Never log token values to console.
- Never expose ACCOUNT_TOKENS contents in any client-facing response except via `validateAccountToken` and only the fields the client needs.
- Match existing error response format used elsewhere in Code.gs.
- HTML/CSS for `account.html` matches existing site styles — copy patterns from `tracking.html`.

---

## Session log entry expected at end of every session

Write a dated entry in CLAUDE.md session log including:
- What steps from this plan were completed (reference the numbered list above)
- What was tested and the result
- What broke and how it was fixed
- What is left for the next session
- Anything deferred or punted

Commit message format: `account-mvp: session {date} — {summary}`

---

## When the MVP is "done"

All of these are true:
1. BIZ-INTERNAL can book a test order, the order appears with paymentStatus=Account, dispatcher sees it, rider can complete it
2. BIZ-INTERNAL is correctly rejected on the 4th order in a day (limit 3)
3. account.html?token=BIZ-INTERNAL shows the test orders
4. BIZ-MAREAVERDE end-to-end works identically with their real config
5. Operator gets an email notification on every account order
6. Stripe webhook ignores account orders without errors
7. Code is deployed (new Apps Script version + GitHub Pages push)
8. Marea Verde have received their launch message with their token and account URL

Stop at that point. Defer everything else to following weeks.
