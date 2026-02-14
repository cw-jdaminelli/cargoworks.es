# cargoworks.es
CARGOWORKS.es Courier Service Website

## Development

Run a local server to preview the site:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000 in your browser.

## Google Maps API Key Setup

To keep the key safe and the map stable:

- Enable billing and the following APIs: Maps JavaScript API, Geocoding API.
- Create a Browser key and restrict by HTTP referrers.
- Add exact referrer patterns for both production and local preview.

Recommended referrers:

- Production: https://cargoworks.es/* (replace with your domain)
- Staging (if any): https://staging.cargoworks.es/*
	- Local preview: http://localhost:8000/* and http://127.0.0.1:8000/*
	- Codespaces: https://*.app.github.dev/* (and legacy https://*.githubpreview.dev/*)

Key tips:

- Referrers must match scheme, host, and port. localhost with a different port will fail.
- Changes can take a few minutes to propagate.
- If the map fails to load, the site shows a diagnostic in the Zones section.

## Editing Zones

Use the local-only Zones Editor page to draw and export zones:

1. Start the local server (see above).
2. Open: http://localhost:8000/admin/zones-editor.html
3. Click “Edit zones”, draw one or more polygons.
4. Click “Export zones” to download zones.geojson.
5. Replace the file at data/zones.geojson in this repository and deploy.

Notes:

- Editing is intentionally restricted to local (localhost or file protocol) for safety.
- The public site index.html loads zones from data/zones.geojson and allows address lookup.

## Booking API (MVP Calendar Sync)

The estimator can submit booking requests and read availability via a lightweight backend.
Set the endpoint in [index.html](index.html#L314) using:

```html
<script>
	window.CARGOWORKS_BOOKING_API = 'https://YOUR-API-BASE';
</script>
```

Expected endpoints (Apps Script Web App URL):

- `GET ?date=YYYY-MM-DD` → `{ "blocked": [{ "start": 540, "end": 600 }] }`
- `POST` → accepts a JSON payload with `customer`, `notes`, and `quote`, returns `{ "reference": "ABC123" }`

We plan to use a Google Apps Script web app for MVP. This keeps calendar keys off the client and can be replaced later by a full backend.

Setup steps are in [apps-script/README.md](apps-script/README.md).
