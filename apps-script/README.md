# Cargoworks Apps Script (Booking API)

This script provides two endpoints for the MVP booking flow on the Web App URL:

- `GET ?date=YYYY-MM-DD` -> `{ "blocked": [{ "start": 540, "end": 600 }] }`
- `POST` -> accepts form field `payload` (JSON string), returns `{ "reference": "ABC123" }`

## Deploy steps

1. Go to https://script.google.com and create a new project.
2. Copy the contents of Code.gs from this folder into the Apps Script editor.
3. In Project Settings, set the timezone to Europe/Madrid.
4. Deploy as a Web App:
   - Execute as: Me
   - Who has access: Anyone
5. Copy the Web App URL.

## Connect the site

Set the booking API base in [index.html](../index.html):

```html
<script>
  window.CARGOWORKS_BOOKING_API = 'https://script.google.com/macros/s/.../exec';
</script>
```

## Notes

- Calendar ID is set to `primary` in Code.gs. If you want another calendar, replace it with the calendar ID.
- If you use a different timezone, update both Code.gs and the Apps Script project settings.
- For dynamic payments, set a script property named `STRIPE_SECRET` with your Stripe secret key.
