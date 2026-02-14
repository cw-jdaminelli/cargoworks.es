# Pricing Rules (Human Terms)

Use this as a plain-language reference for UI copy.

## Pricing flow (order matters)
1. Distance is calculated from pickup to stops to dropoff. The base-to-pickup approach leg is excluded.
2. Distance billing uses the larger of:
   - total route km after pickup, or
   - pickup-center to dropoff km.
3. A base pickup charge is added based on the pickup zone.
4. Address fee is added: EUR 1 per stop plus the dropoff (pickup excluded).
5. If the subtotal from distance + pickup + address fees is below the minimum, the minimum applies.
6. Cargo modifier adjusts the subtotal (small discount or large surcharge).
7. Surcharges apply as percentages and stack (weekend/holiday + after-hours).
8. Discount code is applied last and subtracted from the total after surcharges.

## Distance and base pricing
- Per-km rate depends on the pickup zone.
- Pickup zone base charges:
  - Zone 1: EUR 4.00
  - Zone 2: EUR 5.00
  - Zone 3: EUR 6.00
  - Zone 4: EUR 7.50
  - Zone 5: EUR 9.00
  - Zone 6: EUR 11.00
- Minimum distance subtotal: EUR 8.00

## Address fee
- EUR 1 per stop plus the dropoff (pickup excluded).

## Cargo modifier
- Small parcel (shoebox): -15% of subtotal.
- Regular (60x40x30cm): no change.
- Large or multiple regular: +15% of subtotal.

## Surcharges
- Weekend/holiday surcharge: +25%.
- After-hours surcharge: +25%.
- If both apply, the percentages add.

### Business hours
- Weekdays: 07:00 to 17:00
- Weekend/holiday: 07:00 to 14:00
- After-hours is any time outside the window for that day.

## Discount codes
- Case-insensitive (entered code is normalized to uppercase).
- A code applies only if:
  - it exists,
  - it is active,
  - the date is within its start and end window, and
  - the pre-discount total meets any minimum order.

### Discount types
- Percent: applies a percentage of the pre-discount total.
- Fixed: applies a flat amount, capped so it never exceeds the total.

## Notes
- Discounts are applied after surcharges.
- Weekend/holiday includes weekends and configured holiday dates.
