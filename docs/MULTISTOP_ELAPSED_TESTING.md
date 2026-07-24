# Multi-stop, elapsed-time-billed routes — manual test checklist

Covers the feature built for B2B accounts (e.g. flowerproject) that need multi-stop
routes billed by actual elapsed time, with each stop independently tracked
(own status, own POD, own public tracking link). See the implementation plan
for full design context.

Run each section against the live dispatcher/rider/tracking/account pages once
`apps-script/Code.gs` has been deployed (pushed to Apps Script + web app
redeployed) and the static files (`admin/dispatcher.html`, `js/js/dispatcher-admin.js`,
`admin/rider.html`, `js/js/tracking.js`, `tracking.html`, `account.html`) are live.

Check off each item as `[x]` as you go.

---

## Stage 1 — data model / backward compatibility

- [ ] Edit a plain flat-rate order (no stops) and save. Confirm the stored JSON
      shape is unchanged — no `billingMode`/`hourlyRate`/`elapsedMinutes` fields
      showing up with non-empty/surprising values, `quote.route.stops` stays `[]`.
- [ ] Edit an existing multi-stop order that predates this feature (stops are
      plain `{address}` objects with no `id`). Save it. Confirm:
  - Each stop now has a real `id` and `trackingToken` after this first save.
  - If the old stops had `tier`/`priority`/`outlier` set (from a rider route
    commit), those values are preserved, not dropped.
- [ ] Re-open a multi-stop order and save it again *without* changing anything.
      Confirm stop ids/tokens stay exactly the same as the first save (no churn
      on every save).
- [ ] Simulate a rider having completed some stops (mark 1 of 3 stops Delivered
      via the API — see Stage 2), then have the dispatcher edit and save the
      order (e.g. change a customer note). Confirm the completed stop's
      `status`/`podUrl`/`completedAt` are untouched after the dispatcher's save.
- [ ] Duplicate a multi-stop order that has some completed stops. Confirm the
      new copy has: fresh stop ids, fresh tracking tokens, every stop status
      reset to `Pending`, empty `podUrl`/`completedAt`/`failureReason`, and
      `elapsedMinutes: 0`. The original order must be unaffected.

## Stage 2 — backend endpoints (can be tested via direct POST/curl before any UI touches them)

- [ ] `riderCompleteStop` with `status:'Delivered'` and a POD photo (base64) —
      confirm the target stop's `status`, `completedAt`, and `podUrl` are set.
- [ ] `riderCompleteStop` with `status:'Failed'` and **no** `reason` — confirm a
      400 error, nothing is written.
- [ ] `riderCompleteStop` with `status:'Failed'` and a `reason` — confirm
      `failureReason` is stored and the order's timeline includes the reason text.
- [ ] Complete every stop on a 3-stop test route, mixing Delivered and Failed
      outcomes. Confirm that on the *last* call:
  - The master order status auto-flips to `Delivered` — **never** `Failed`,
    regardless of how many individual stops failed.
  - `adminData.routeCompletedAt` is stamped.
- [ ] Repeat the above with `quote.billingMode = 'elapsed'` and `quote.hourlyRate`
      set, and `adminData.routeStartedAt` already present (e.g. from OMW).
      Confirm `quote.elapsedMinutes` and `quote.total` are computed correctly:
      `total = hourlyRate * (elapsedMinutes / 60)`, rounded to cents.
- [ ] `riderSetRouteStart` with no `startedAt` — confirm it stamps "now".
      Call it again with an explicit past ISO timestamp — confirm it *overwrites*
      the previous value (unlike the implicit OMW stamp, which only sets once).
- [ ] `adminUpdateStop` (dispatcher-side correction, same body as
      `riderCompleteStop` but admin-token authed) — confirm it works identically,
      including rejecting a reason-less Failed status.
- [ ] Try `riderCompleteStop`/`adminUpdateStop` with a `stopId` that doesn't
      exist on the order — confirm a 404, not a crash.
- [ ] Try `riderCompleteStop` as a rider who isn't assigned to the order —
      confirm 403.

## Stage 3 — AI scanner reuse (dispatcher-side)

- [ ] From the dispatcher's "⚡ Quick add" panel, use 📷 Camera or 🖼 File to
      scan a photo of a multi-stop paper order sheet. Confirm:
  - All addresses on the sheet are extracted in one pass (not one at a time).
  - Any tier/priority labels visible on the sheet come through as `tier`.
  - This uses the admin token (no rider login involved) and does **not**
    prompt for a personal Anthropic API key (that prompt only appears for the
    separate "Quick Import" whole-order feature, which is unrelated/untouched).
- [ ] Confirm the rider app's own route-sheet scanner (`admin/rider.html`)
      still works unchanged — it should still authenticate via rider id, not
      the admin token.

## Stages 4–5 — dispatcher UI

- [ ] Open an ordinary flat-rate, no-stop order. Confirm the stops list area is
      empty/normal, "Billing mode" defaults to "Flat rate", and nothing new is
      visibly different from before this change.
- [ ] Add 2–3 stops manually via "+ Add stop" on a new order, edit their
      addresses/tiers, remove one, save. Confirm the order saves correctly and
      re-opens with the same stops.
- [ ] On a multi-stop order, switch "Billing mode" to "Elapsed time (hourly
      rate)". Confirm:
  - The flat-rate breakdown fields (Base/Distance/Stops fee/etc.) and "⚙ Get
    system pricing" hide.
  - The elapsed-billing fields (hourly rate, route started, route completed,
    elapsed minutes) appear.
  - Typing an hourly rate + route started/completed times auto-computes
    "Elapsed minutes" and the final total.
- [ ] Check the "Manual override" checkbox next to "Elapsed minutes" — confirm
      typing a value directly no longer gets overwritten by the auto-calc.
- [ ] Check the main pricing "Manual override" checkbox — confirm it still
      works for the final total exactly as before, in both flat and elapsed mode.
- [ ] On a saved multi-stop order, use the "✓ Delivered"/"✗ Failed" buttons next
      to a stop row (these save immediately, not part of the main Save button).
      Confirm:
  - Failed prompts for a reason and refuses to submit an empty one.
  - The row updates in place (status badge, POD link if uploaded) without
    closing/reopening the editor.
  - Once the last stop is completed, the order's own Status field updates to
    reflect the auto-completion.
- [ ] Use "🔗 Copy tracking link" on a stop — paste the copied link into a new
      tab and confirm it opens the correct per-stop tracking page (see Stage 7).
- [ ] Try removing an already-completed stop — confirm the warning dialog
      appears before it's removed.

## Stage 6 — rider UI

- [ ] Open a single-stop (or no-stop) order as the assigned rider — confirm the
      whole-order Delivered/Failed buttons and POD flow behave exactly as
      before this change.
- [ ] Open a multi-stop order as the assigned rider, progress it to "In
      transit". Confirm:
  - The route section shows a per-stop completion row instead of plain
    address text.
  - The footer's whole-order Delivered/Failed buttons are replaced with an
    informational message ("Mark each stop above…").
- [ ] If `billingMode` is `elapsed` and `routeStartedAt` isn't set yet: confirm
      the "▶ Start route" button appears, and "Started earlier?" lets you
      backdate it (5/10/15/30/60 min ago options).
- [ ] After starting the route, confirm the section instead shows "Route
      started HH:MM" with an "✎ Edit start time" option that lets you correct it.
- [ ] For a Pending stop: attach a photo, then tap "✓ Delivered" — confirm the
      photo uploads and the stop shows Delivered with a "View POD" link.
- [ ] Tap "✗ Failed" on a stop — confirm you're prompted for a reason and can't
      submit without one.
- [ ] Complete the last remaining stop — confirm the whole order flips to
      Delivered automatically (no separate action needed) and the detail view
      re-renders to reflect it.

## Stage 7 — public tracking + account panel

- [ ] Open a stop's public tracking link (`tracking.html?ref=...&stop=...&t=...`)
      in an incognito/private window. Confirm it shows only that stop's
      reference, "Stop X of Y", status, scheduled time, address, and (if
      delivered) a POD link — nothing about the rest of the route.
- [ ] Try the same link with the `t` token removed or wrong — confirm
      Unauthorized (401), not a silent bypass.
- [ ] Confirm the per-stop tracking page never shows `failureReason` even if
      the stop failed (that's account/dispatcher-only information).
- [ ] Confirm the *whole-order* tracking page (`tracking.html?ref=...`, no
      `stop=`) still works exactly as before for both single- and multi-stop
      orders.
- [ ] Log into `account.html` with the flowerproject account token. Confirm:
  - Multi-stop orders show a "+N stops ▾" toggle button instead of the old
    static badge.
  - Clicking it expands a nested table with each stop's address, status
    (with failure reason shown for Failed stops), POD link, and tracking link.
  - Order-level totals at the bottom of the page are unaffected (still sum
    `total` per order, not per stop).
- [ ] Log into `account.html` with a *different*, single-stop account token —
      confirm the table looks and behaves exactly as it did before this change
      (no stray toggle buttons, no console errors).

## Stage 8 — end to end

- [ ] Full real-world walkthrough with a real (or sandboxed) flowerproject
      order: dispatcher scans a paper order sheet → reviews/edits the
      extracted stops → sets billing mode to Elapsed + an hourly rate → saves
      → rider starts the route (or backdates it if forgotten) → rider
      completes each stop in turn (mix of delivered/failed, with photos and
      reasons) → confirm:
  - The order auto-completes once the last stop is done.
  - The dispatcher can still override the recorded elapsed time and/or the
    final total manually after the fact.
  - The account panel and each stop's public tracking link all agree with
    what actually happened on the route.
