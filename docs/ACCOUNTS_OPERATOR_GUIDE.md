# Cargoworks Business Accounts — Operator Guide

This guide covers everything needed to test the system, launch it with a client, manage accounts day-to-day, and troubleshoot problems. Written for Julian and any future operators.

---

## What the system does

A business account lets a trusted client place orders without paying by card each time. Instead:

- They type their account token (e.g. `BIZ-MAREAVERDE`) into the promo code field on the booking form
- The form confirms the account and reveals extra fields (who's ordering, pickup time, recipient, etc.)
- They submit the order — no Stripe, no card, no payment flow
- The order lands in your Google Calendar and the dispatcher exactly like a paid order, marked as "Account"
- You receive an email for every order
- They can see all their orders at `cargoworks.es/account.html?token=BIZ-MAREAVERDE`
- You bill them manually at the end of each billing cycle

---

## Part 1: Deploying the system (do this before anything else)

The code is in GitHub but the live backend runs in Google Apps Script. Every time you update the code, you need to publish a new version. The booking form and account panel pull from the live deployed version.

### How to deploy a new version

1. Go to [script.google.com](https://script.google.com) and open the Cargoworks project
2. Click **Deploy** (top right)
3. Click **Manage deployments**
4. Click the **pencil icon** on the existing deployment
5. Under **Version**, select **New version**
6. Click **Deploy**

You must do this every time code changes are pushed to `apps-script/Code.gs`. The editor auto-saves but the live web app only updates when you create a new version.

---

## Part 2: End-to-end testing before going live

Run through this entire checklist with `BIZ-INTERNAL` before touching any client account.

### 2.1 Test the token lookup

Open this URL in your browser (logged into Google):

```
https://script.google.com/macros/s/AKfycbzDbKDqGvKsbdc4JhG03jSecjJOZbc7ASpyF8ua9yXF5ZRXdaNI3SddxnMECoPcMapA/exec?action=validateAccountToken&token=BIZ-INTERNAL
```

Expected result:
```json
{"valid":true,"accountName":"Cargoworks Internal","requires":{"staffName":true,"pickupTime":true,"dropoffTime":true,"attName":true,"attContact":true},"status":200}
```

If you see `valid: false` — the `ACCOUNT_TOKENS` property is missing or wrong. See Part 5 for how to set it.

### 2.2 Test placing an account order

Go to the Apps Script editor. In the function dropdown at the top, select `testAccountOrder`. Click **Run (▶)**. Click **Execution log**.

Expected:
```json
{"reference":"CW-XXXX","paymentMode":"account","trackingUrl":"...","accountName":"Cargoworks Internal","status":200}
```

Also check:
- A new calendar event appears in Google Calendar for tomorrow's date
- An email arrives at info@cargoworks.es with subject `[Cargoworks] New account order: Cargoworks Internal — CW-...`

The email should contain staff name, pickup/dropoff times, recipient name and contact, pickup and dropoff addresses, and total.

### 2.3 Test the booking form

Go to [cargoworks.es](https://cargoworks.es).

1. Fill in pickup and dropoff addresses and get a price estimate
2. In the promo code field (now labelled "Promo or account code"), type `BIZ-INTERNAL`
3. Click **Apply**

Expected:
- Status text changes to: **Account confirmed: Cargoworks Internal**
- A section titled "Additional details" appears below with fields: "Who is placing this order?", Pickup time, Dropoff time, Recipient name, Recipient phone
- The submit button changes to: **Place order on Cargoworks Internal account**

4. Fill in the customer details section (name, email, phone) and the additional details section
5. Click **Place order on Cargoworks Internal account**

Expected:
- A confirmation message appears: "Order placed on Cargoworks Internal account. Reference: CW-XXXX. Track it here: [link]. Invoice will be issued at end of billing cycle."
- No Stripe payment screen appears
- The form resets but the token stays pre-filled (ready for the next order)
- A calendar event and an email arrive as in 2.2

### 2.4 Test the account order panel

Open this URL in your browser:

```
https://cargoworks.es/account.html?token=BIZ-INTERNAL
```

Expected:
- Page loads with heading "Cargoworks Internal" under the account subtitle
- A table appears with the test order(s) you placed
- Columns: Ref, Date, Route, Staff, Recipient, Status, Total, Track →
- The search box filters by reference, staff name, or recipient name
- The page auto-refreshes every 60 seconds

### 2.5 Test the dispatcher

Open [cargoworks.es/admin/dispatcher.html](https://cargoworks.es/admin/dispatcher.html) (you'll need the admin token).

Find the test order. Verify:
- A purple **Account: Cargoworks Internal** badge appears next to the payment status
- The order detail shows Staff, Att name, Att contact, Pickup time, Dropoff time
- You can assign a rider and update the order status exactly like a normal order

### 2.6 Test the daily limit

BIZ-INTERNAL has a daily limit of 3 orders. Place 3 test orders using `testAccountOrder` in the Apps Script editor (run it 3 times). On the 4th run, you should see:

```json
{"error":"Daily order limit reached for this account (3/3). Contact your account manager.","status":429}
```

On the booking form, the 4th attempt will show this as an error message.

---

## Part 3: Setting up a client account

### 3.1 Where account data lives

All account configuration is stored in a single property in your Apps Script backend. Nothing is in a database or spreadsheet. To find it:

1. Open Apps Script → your Cargoworks project
2. Click the **gear icon** (Project Settings) on the left sidebar
3. Scroll down to **Script Properties**
4. Find the property named `ACCOUNT_TOKENS`

The value is a JSON object. Each key is an account token, and the value is that account's configuration.

### 3.2 How to add a new account

Open Script Properties (as above). Click **Edit** next to `ACCOUNT_TOKENS`. The value will look like this:

```json
{
  "BIZ-INTERNAL": { ... existing ... },
  "BIZ-MAREAVERDE": { ... existing ... }
}
```

Add a new entry inside the `{ }` following the same format. Use this template:

```json
"BIZ-CLIENTNAME": {
  "name": "Display Name",
  "fiscalName": "Legal Business Name S.L.",
  "nif": "B12345678",
  "fiscalAddress": "Carrer Example 1, 08001 Barcelona",
  "billingEmail": "billing@client.com",
  "operationsEmail": "ops@client.com",
  "phone": "+34600000000",
  "dailyLimit": 20,
  "active": true,
  "requiresStaffName": true,
  "requiresPickupTime": true,
  "requiresDropoffTime": true,
  "requiresAttName": true,
  "requiresAttContact": true,
  "trialEndsDate": "",
  "trialNotes": "",
  "notes": "Any notes for yourself here"
}
```

Click **Save script properties**. No redeployment needed — the backend reads this property live at every request.

### 3.3 Choosing a token name

Token format: `BIZ-NAME` in uppercase. Rules:

- Must start with `BIZ-`
- Use the client's short name, no spaces or special characters
- Examples: `BIZ-MAREAVERDE`, `BIZ-BLOOM`, `BIZ-LUXORHOTEL`, `BIZ-MEDIAUNICA`
- A token can never be the same as an existing promo code. Check the existing tokens and promo codes before creating one.

### 3.4 Field reference

| Field | What it is | Required? |
|-------|-----------|-----------|
| `name` | Short display name shown on the booking form and in emails | Yes |
| `fiscalName` | Full legal name for invoices | For invoicing |
| `nif` | Spanish NIF/CIF | For invoices |
| `fiscalAddress` | Legal address | For invoices |
| `billingEmail` | Receives billing communications | For billing |
| `operationsEmail` | Receives a copy of every order notification | Optional |
| `phone` | Ops contact | Optional |
| `dailyLimit` | Max orders per day. `0` = unlimited | Yes |
| `active` | Set to `false` to immediately block the token | Yes |
| `requiresStaffName` | Show "Who is placing this order?" field | Recommended |
| `requiresPickupTime` | Show pickup time field | Recommended |
| `requiresDropoffTime` | Show dropoff time field | Optional |
| `requiresAttName` | Show "Who is this for?" field | Recommended |
| `requiresAttContact` | Show recipient phone field | Recommended |
| `trialEndsDate` | Reminder for yourself. Not enforced in code | Optional |
| `trialNotes` | Notes about the trial arrangement | Optional |
| `notes` | Any other notes for yourself | Optional |

### 3.5 Which fields to require

Most clients should have all 5 `requires*` set to `true`. This gives you the most information per order and ensures the rider knows exactly when and who.

Exceptions:

- **Client sends urgent, no-questions orders** (e.g. a pharmacy): set all to `false`. Orders go through fast with no extra fields.
- **Client doesn't need dropoff time** (e.g. a shop sending to individuals): set `requiresDropoffTime: false`.
- **Internal use (you booking your own orders)**: set all to `false` unless you want the structure.

You can change these at any time — the next order the client places will use the new settings.

---

## Part 4: Giving the client access

Once you've added their account, send them two things:

**Their token:** `BIZ-MAREAVERDE` (or whatever you chose)

**Their account panel URL:** `https://cargoworks.es/account.html?token=BIZ-MAREAVERDE`

**Script to send them (adapt as needed):**

> Hi [name],
>
> Your Cargoworks business account is ready. Here's how to use it:
>
> **Placing orders:**
> Go to cargoworks.es as usual. In the field that says "Promo or account code", enter your account code: `BIZ-MAREAVERDE`. Click Apply. The form will confirm your account and show additional fields. Fill everything in and click "Place order on [name] account". No card needed — we'll invoice you at the end of the month.
>
> **Viewing your orders:**
> See all your orders at any time here: https://cargoworks.es/account.html?token=BIZ-MAREAVERDE
>
> **Your daily limit:** [X orders per day]. Contact us if you need to increase this.
>
> Questions? Reply to this message or call [phone].

---

## Part 5: Day-to-day operations

### 5.1 What happens when a client places an order

1. An event appears in your Google Calendar with `[Account] ClientName — CW-XXXX` in the title
2. You receive an email with subject `[Cargoworks] New account order: ClientName — CW-XXXX` containing all order details
3. The order appears in the dispatcher marked with a purple "Account" badge
4. Assign and dispatch it the same as any other order
5. The rider completes it normally
6. The client sees the updated status in their account panel in real time

### 5.2 Dispatcher: what to look for

Account orders look like normal orders with extra badges and fields:

- **Purple badge**: "Account: [Client Name]" — tells you which account this belongs to
- **Payment: Account** badge — confirms it's not a Stripe order
- **Extra fields in the order detail**: Staff (who placed it), Att name (recipient), Att contact, Pickup time, Dropoff time

These extra fields are information for the rider — pass them on in the assignment note if needed.

### 5.3 Monthly billing

At the end of each billing cycle, open the client's account panel:

```
https://cargoworks.es/account.html?token=BIZ-CLIENTNAME
```

The table shows all their orders with status and total amount. Use this to calculate the invoice. Currently you generate the invoice manually in Declarando.

What to check before invoicing:
- All orders show status **Delivered** (any that show **Canceled** should not be billed)
- Totals match what you agreed with the client
- If there are disputed orders, contact the client before invoicing

---

## Part 6: Managing existing accounts

All changes are made in Script Properties → `ACCOUNT_TOKENS`. You don't need to redeploy after editing this property.

### Pause an account immediately

Find the account entry and set `"active": false`:
```json
"active": false
```
The next time the client tries to apply their token, they'll see "Account not found or inactive." Existing orders are not affected.

### Re-activate an account

Set `"active": true`.

### Change the daily limit

Find the entry and update `"dailyLimit"`:
- `0` = unlimited
- Any positive number = that many orders per day (resets at midnight Madrid time)

### Change which fields are required

Update the `requires*` flags. Takes effect immediately on the next order.

### Change the client's token (rare)

To rename a token (e.g. `BIZ-OLD` → `BIZ-NEW`), you need to:
1. Add a new entry with the new key and the same config
2. Remove the old key
3. Tell the client their new token

Note: old orders in Google Calendar are stored with the old token. They'll still appear in the old token's account panel URL. The new token will have a clean history from the changeover date.

### Remove an account entirely

Delete the entire entry from the JSON object. The token immediately stops working. The client's past orders remain in Google Calendar but the account panel will stop loading.

---

## Part 7: Adding BIZ-MAREAVERDE (Marea Verde launch)

Before contacting them, update the `BIZ-MAREAVERDE` entry in Script Properties with their real details (NIF, fiscal address, billing email, ops email, phone). The template entry already exists as a placeholder.

**Checklist before launch:**
- [ ] Collect: fiscal name, NIF, fiscal address, billing email, ops email, phone
- [ ] Update `BIZ-MAREAVERDE` in Script Properties with real data
- [ ] Confirm daily limit (currently set to 100 — check with them if this is right)
- [ ] Test `validateAccountToken` with their token to confirm it returns `valid: true`
- [ ] Send them the welcome message with their token and account panel URL
- [ ] Place one test order through the booking form as if you were them
- [ ] Confirm the test event appears in Calendar with their account details
- [ ] Confirm the email arrives with correct subject and body
- [ ] Delete the test order from Calendar after confirming

---

## Part 8: Troubleshooting

### "Account not found or inactive" when applying the token

Check in order:
1. Is the token typed correctly? Tokens are case-insensitive but spaces matter. Try removing any extra spaces.
2. Is `"active": true` in their account config?
3. Is the `ACCOUNT_TOKENS` property valid JSON? If you edited it recently, copy the whole value and paste it at [jsonlint.com](https://jsonlint.com) to check for errors.

### "Daily order limit reached"

The limit resets at midnight Madrid time. If a client hits the limit by mistake (e.g. a test order counted against their daily limit), you can temporarily raise `dailyLimit` or set it to `0` for that day, then restore it.

You can also delete the test orders from Google Calendar — the daily limit counter checks Calendar, so removing events frees up the count.

### Account panel shows no orders / won't load

1. Check the URL — token must match exactly (case-insensitive): `?token=BIZ-MAREAVERDE`
2. Check that `"active": true` is set
3. Open browser developer tools (F12) → Console tab and look for error messages
4. Confirm the Apps Script deployment is up to date (see Part 1)

### Order placed but no email arrived

Check:
1. Your spam/junk folder
2. That `OWNER_EMAIL` in the Apps Script code is set to `info@cargoworks.es`
3. That the order actually went through — does the Calendar event exist?
4. If the account config has `"operationsEmail"` set, that address also receives a copy

### Token was applied but extra fields didn't appear

This means `validateAccountToken` returned `valid: true` but all `requires*` flags are `false`. Either all five were intentionally set to false, or the config is missing them. Check the `ACCOUNT_TOKENS` entry for that client.

### Client says the order form isn't remembering their account

The account token is saved in their browser's localStorage. If they cleared their browser data, switched browsers, or are on a different device, they'll need to enter the token again and click Apply. This is by design — the token is their auth credential.

---

## Part 9: Account structure reference

The full JSON schema for a single account entry:

```json
"BIZ-EXAMPLE": {
  "name":               "Display Name",
  "fiscalName":         "Legal Name S.L.",
  "nif":                "B12345678",
  "fiscalAddress":      "Carrer Example 1, 08001 Barcelona",
  "billingEmail":       "billing@example.com",
  "operationsEmail":    "ops@example.com",
  "phone":              "+34600000000",
  "dailyLimit":         20,
  "active":             true,
  "requiresStaffName":  true,
  "requiresPickupTime": true,
  "requiresDropoffTime":true,
  "requiresAttName":    true,
  "requiresAttContact": true,
  "trialEndsDate":      "2026-09-30",
  "trialNotes":         "Free trial Sept 2026, renegotiate after",
  "notes":              "Any notes for the operator here"
}
```

**Token naming convention:** Always `BIZ-SHORTNAME` in uppercase. Never overlaps with a promo code.

**Active accounts URL pattern:**
- Booking form: [cargoworks.es](https://cargoworks.es) — enter token in promo/account code field
- Account panel: `https://cargoworks.es/account.html?token=BIZ-CLIENTNAME`
- Apps Script API base: `https://script.google.com/macros/s/AKfycbzDbKDqGvKsbdc4JhG03jSecjJOZbc7ASpyF8ua9yXF5ZRXdaNI3SddxnMECoPcMapA/exec`

---

## Part 10: What's not in scope yet

These features are explicitly deferred and should not be built until the MVP is proven:

- **Admin UI** for creating/editing accounts — currently done via Script Properties manually
- **Invoice generation** for account orders — done manually in Declarando for now
- **Mark as invoiced / mark as paid** on orders — not tracked in system yet
- **Credit limits** — daily order count limit only, no EUR credit limit
- **Per-employee logins** — the token is shared across the whole client team
- **Email confirmations to recipients** — operator email only for now
- **Token rotation** — no UI for this; if a token is compromised, change the key in Script Properties and notify the client

If any of these come up in conversation with a client, the answer is: "that's coming later."
