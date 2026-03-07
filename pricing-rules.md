# Pricing Rules (Exact Calculator Behavior)

This file reflects what `js/js/map.js` actually computes today.

## Calculation order in code
1. Build route from `pickup -> stops -> dropoff` and ignore `base -> pickup` leg for distance pricing.
2. Determine `pickupZone` from pickup coordinates.
3. Determine `distancePerKmRaw` from `data/prices.json.distance.perKm[pickupZone]`.
4. Compute `distancePerKmApplied = round2(distancePerKmRaw * 1.10)`.
5. Compute two km measures:
   - `totalKmAfterPickup` from route legs after pickup
   - `dropCenterKm` from zone center to dropoff (haversine)
6. Use `distanceBasisKm = max(totalKmAfterPickup, dropCenterKm)`.
7. Compute `distanceTotal = round2(distanceBasisKm * distancePerKmApplied)`.
8. Compute pickup charge with code path `basePriceForZone(zone) = zoneBase * 0.88`.
9. Compute `preMinSubtotal = round2(distanceTotal + pickupCharge)`.
10. Apply minimum only to `distance + pickup`:
   - if `preMinSubtotal < minimum`, set subtotal to `minimum`
   - otherwise subtotal stays `preMinSubtotal`
11. Address fee is added after minimum (see threshold rule below).
12. Cargo modifier is applied to that subtotal.
13. Time/date surcharges are applied to the cargo-adjusted subtotal.
14. Discounts are applied last, on total after surcharges.

## Variable prices and constants

### Zone bases from `data/prices.json`
- `zoneBase[1] = 4.00`
- `zoneBase[2] = 5.00`
- `zoneBase[3] = 6.00`
- `zoneBase[4] = 7.00`
- `zoneBase[5] = 9.00`
- `zoneBase[6] = 10.00`

### Effective pickup charge used by calculator
- `pickupCharge = zoneBase[pickupZone] * 0.88`
- Effective values:
  - Zone 1: `3.52`
  - Zone 2: `4.40`
  - Zone 3: `5.28`
  - Zone 4: `6.16`
  - Zone 5: `7.92`
  - Zone 6: `8.80`

### Distance per km from `data/prices.json`
- Raw map (`distancePerKmRaw`):
  - Zone 1: `3.44`
  - Zone 2: `3.21`
  - Zone 3: `2.99`
  - Zone 4: `2.80`
  - Zone 5: `2.61`
  - Zone 6: `2.43`
- Applied in quote: `distancePerKmApplied = round2(raw * 1.10)`
  - Zone 1: `3.78`
  - Zone 2: `3.53`
  - Zone 3: `3.29`
  - Zone 4: `3.08`
  - Zone 5: `2.87`
  - Zone 6: `2.67`
- Fallback if missing/invalid raw value: `1.50` raw, then same `* 1.10` logic.

### Minimum
- `minimumSubtotalEUR = 8.00`
- Applied before address fee, cargo, and surcharges.

## Address fee rule
- `addressFeeCount = stopsCount + 1` (dropoff + stops, pickup excluded)
- `addressFeePerAddressEUR = 1.25` only when `addressFeeCount >= 3`, else `0`
- `addressFee = round2(addressFeePerAddressEUR * addressFeeCount)`

Practical effect:
- `0` or `1` stop: no address fee
- `2+` stops: fee applies to all counted addresses (dropoff + every stop)

## Cargo modifier
- `small`: `cargoRate = -0.15`
- `regular`: `cargoRate = 0`
- `large`: `cargoRate = +0.20`
- `cargoAmount = round2(subtotalAfterAddress * cargoRate)`

Auto-selection behavior in code:
- If the UI has `>= 5` stop items, cargo is forced to `large`.

## Time/date surcharges

### Rates from `data/prices.json.surcharges`
- `weekend_holiday = 0.25`
- `after_hours = 0.25`

Configured but currently unused in `runEstimate()`:
- `heavy_over_30kg`
- `bulky_item`

### How surcharge rate is built
- `surchargeRate = (isWeekendOrHoliday ? weekend_holiday : 0) + (isAfterHours ? after_hours : 0)`
- `surchargeAmount = round2(subtotalAfterCargo * surchargeRate)`

### Business hours from `data/prices.json.businessHours`
- Weekday window: `07:00` to `17:00`
- Weekend/holiday window: `07:00` to `14:00`
- `afterHours` is true when selected time is `< start` or `>= end`.

Important behavior:
- Weekend/holiday surcharge only triggers when a date is explicitly selected in the form.
- After-hours surcharge only triggers when a time is explicitly selected.

## Discounts

### Validation checks
Each entered code is evaluated against:
- existence in `data/discounts.json`
- `active !== false`
- date window (`start <= dateKey <= end`)
- `minOrder` threshold against total before discounts

### Calculation behavior
- Codes are normalized to uppercase for lookup.
- Multiple codes can be active at once (same code cannot be added twice).
- Each code amount is computed from the same `totalBeforeDiscount` base.
- Percent code: `base * amount/100`
- Fixed code: fixed amount capped by base total
- All discount amounts are summed, then capped so total discount never exceeds `totalBeforeDiscount`.

Current configured codes in `data/discounts.json`:
- `WELCOME10`: `10%`
- `SELF5`: `5%`
- `F&F30`: `30%` (stored as `f&f30`, matched case-insensitively)

## Formula summary
1. `distanceTotal = round2(max(totalKmAfterPickup, dropCenterKm) * distancePerKmApplied)`
2. `pickupCharge = zoneBase[pickupZone] * 0.88`
3. `subtotal0 = round2(distanceTotal + pickupCharge)`
4. `subtotal1 = max(subtotal0, minimumSubtotalEUR)`
5. `subtotal2 = round2(subtotal1 + addressFee)`
6. `subtotal3 = round2(subtotal2 + round2(subtotal2 * cargoRate))`
7. `totalBeforeDiscount = round2(subtotal3 + round2(subtotal3 * surchargeRate))`
8. `total = max(0, round2(totalBeforeDiscount - totalDiscount))`

## Data caveat
- Holiday dates are loaded by regex extraction of `YYYY-MM-DD` from `data/holidays.json` text, not strict JSON parsing.
- This means malformed JSON formatting can still produce holiday matches if date strings are present.
