// Zones map with Google Maps, Snazzy style, geocoding, and optional zone editing
window.initZonesMap = function initZonesMap(){
  if (window._zonesMapInitialized) { try { console.log('[Maps] initZonesMap: already initialized'); } catch(_) {} return; }
  try { console.log('[Maps] initZonesMap start'); } catch(e) {}
  const STYLE_VERSION = '2026-01-24-1';
  const ZONES_VERSION = '2026-01-24-1';
  const PRICES_VERSION = '2026-01-24-1';
  const HOLIDAYS_VERSION = '2026-01-24-1';
  const DISCOUNTS_VERSION = '2026-02-08-1';
  const CALENDAR_API_KEY = '';
  const CALENDAR_ID = '';
  const CALENDAR_TIMEZONE = 'Europe/Madrid';
  const AVAILABILITY_SLOT_MINUTES = 15;
  const RETURN_SPEED_KMH = 18;
  const BOOKING_API_BASE = (function(){
    try { return String((window && window.CARGOWORKS_BOOKING_API) || '').trim(); } catch(_) { return ''; }
  })();
  const qStopsWrap = document.getElementById('quoteStops');
  const qAddStop = document.getElementById('quoteAddStop');
  // Removed: "Use destination as first stop" helper button
  const devHost = (function(){
    const host = location.hostname || '';
    return host === 'localhost' || host === '127.0.0.1' || location.protocol === 'file:' || host.endsWith('.app.github.dev') || host.endsWith('githubpreview.dev');
  })();
  // Enable editor controls on dev hosts or with ?edit=1
  const editMode = (function(){
    try {
      const params = new URLSearchParams(location.search || '');
      if (params.get('edit') === '1') return true;
    } catch(_) {}
    return devHost;
  })();

  // Create the map before any operations that reference it
  const mapEl = document.getElementById('zonesMap');
  if (!mapEl) { try { console.warn('[Maps] zonesMap element not found'); } catch(_) {} return; }
  const center = { lat: 41.3874, lng: 2.1686 }; // Barcelona
  const map = new google.maps.Map(mapEl, {
    center,
    zoom: 13,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false
  });
  try { window._zonesMapInitialized = true; } catch(_) {}

  // Apply map style (Snazzy style), fallback to navy water if unavailable
  const fallbackStyle = [
    { featureType: 'water', stylers: [{ color: '#0b2a44' }] }
  ];
  const styleUrl = '/data/snazzy-style.json?v=' + STYLE_VERSION;
  fetch(styleUrl)
    .then(res => res.json())
    .then(style => { map.setOptions({ styles: style }); })
    .catch(() => {
      map.setOptions({ styles: fallbackStyle });
      try { console.log('[Maps] Applied fallback style'); } catch(e) {}
    });

  const geocoder = new google.maps.Geocoder();
  const directions = new google.maps.DirectionsService();
  const priceEl = document.getElementById('zonePrice');
  if (priceEl) { priceEl.textContent = ''; }
  const editBtn = document.getElementById('zonesEdit');
  const exportBtn = document.getElementById('zonesExport');
  // Route overlays
  let routeMarkers = [];
  let routePolyline = null;
  // Address markers (used when fewer than 2 points are set)
  let addressMarkers = new Map();

  function clearAddressMarker(inputEl){
    try {
      const marker = addressMarkers.get(inputEl);
      if (marker) { marker.setMap(null); addressMarkers.delete(inputEl); }
    } catch(_) {}
  }
  function clearAllAddressMarkers(){
    try {
      addressMarkers.forEach(m => { try { m.setMap(null); } catch(__){} });
      addressMarkers.clear();
    } catch(_) {}
  }
  function setAddressMarker(inputEl, latLng){
    try {
      if (!inputEl || !latLng || !google.maps || !google.maps.Marker) return;
      let marker = addressMarkers.get(inputEl);
      if (!marker) {
        marker = new google.maps.Marker({ position: latLng, map });
        addressMarkers.set(inputEl, marker);
      } else {
        marker.setPosition(latLng);
        if (!marker.getMap()) marker.setMap(map);
      }
    } catch(_) {}
  }

  // Pricing: show base price per zone when clicked; no surcharges computed here

  function setResult(text){ /* zone label removed for MVP */ }

  // Per-zone color palette and helpers
  const palette = ['#ff6fa1', '#6b2ca9', '#2ecc71', '#f5a623', '#3fa9f5', '#e74c3c', '#8e44ad', '#16a085', '#d35400', '#34495e'];
  function colorForName(name){
    if (!name) return palette[0];
    let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }
  function colorForFeature(feature){
    const c = feature && feature.getProperty && feature.getProperty('color');
    if (c) return c;
    const n = feature && feature.getProperty && feature.getProperty('name');
    return colorForName(n);
  }

  // Data layer for zones
  const data = map.data;
  data.setStyle(function(feature){
    const col = colorForFeature(feature);
    return {
      strokeColor: col,
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: col,
      fillOpacity: 0.20
    };
  });

  // Helper: extract rings (outer + holes) from a Data feature geometry
  function getFeatureRingsLatLngs(feature){
    try {
      const geom = feature && feature.getGeometry && feature.getGeometry();
      if (!geom || !geom.getType) return [];
      const type = geom.getType();
      const rings = [];
      if (type === 'Polygon') {
        // google.maps.Data.Polygon → array of LinearRings
        const ringObjs = geom.getArray ? geom.getArray() : [];
        ringObjs.forEach(ring => {
          const arr = ring && ring.getArray ? ring.getArray() : [];
          if (arr.length) rings.push(arr);
        });
      } else if (type === 'MultiPolygon') {
        // MultiPolygon → array of Polygons, each with LinearRings
        const polys = geom.getArray ? geom.getArray() : [];
        polys.forEach(poly => {
          const ringObjs = poly && poly.getArray ? poly.getArray() : [];
          ringObjs.forEach(ring => {
            const arr = ring && ring.getArray ? ring.getArray() : [];
            if (arr.length) rings.push(arr);
          });
        });
      } else if (geom.forEachLatLng) {
        // Fallback: treat all vertices as a single ring
        const arr = [];
        geom.forEachLatLng(ll => arr.push(ll));
        if (arr.length) rings.push(arr);
      }
      return rings;
    } catch(_) { return []; }
  }

  // Hover/click interactions: highlight and show zone name
  const infoWindow = new google.maps.InfoWindow({ disableAutoPan: true });
  data.addListener('mouseover', function(e){
    try {
      data.overrideStyle(e.feature, { strokeWeight: 3, fillOpacity: 0.35 });
      // No hover popup
      infoWindow.close();
    } catch(_) {}
  });
  data.addListener('mouseout', function(e){
    try {
      data.revertStyle(e.feature);
      infoWindow.close();
    } catch(_) {}
  });
  data.addListener('click', function(e){
    // No popup on click; handled by result text below
    try { infoWindow.close(); } catch(_) {}
  });

  // Hover tooltip and highlight for zone names
  let hoverInfo = new google.maps.InfoWindow({ disableAutoPan: true });
  data.addListener('mouseover', function(e){
    data.overrideStyle(e.feature, { strokeWeight: 3, fillOpacity: 0.35 });
    if (hoverInfo) hoverInfo.close();
  });
  data.addListener('mouseout', function(e){
    data.revertStyle();
    if (hoverInfo) hoverInfo.close();
  });
  // Click updates price display (zone label suppressed)
  data.addListener('click', function(e){
    const raw = (e.feature && e.feature.getProperty && e.feature.getProperty('name')) || '';
    const m = String(raw).match(/(\d+)/);
    const num = m ? m[1] : '';
    if (priceEl) {
      const p = num && window._zonePrices && window._zonePrices[num] && window._zonePrices[num].base;
      priceEl.textContent = p ? ('€' + p) : '';
    }
    try { handleMapClick(e && e.latLng); } catch(_) {}
    });

  // Load zones from GeoJSON
  let zonesFeatures = [];
  // Clear any previously loaded features to avoid stale overlays
  try {
    const prev = [];
    data.forEach(f => prev.push(f));
    prev.forEach(f => data.remove(f));
    zonesFeatures = [];
  } catch(_) {}
  const zonesUrl = '/data/zones.geojson?v=' + ZONES_VERSION;
  fetch(zonesUrl)
    .then(res => res.json())
    .then(geojson => {
      data.addGeoJson(geojson);
      data.forEach(f => zonesFeatures.push(f));
      try {
        const bounds = new google.maps.LatLngBounds();
        data.forEach(f => {
          const g = f.getGeometry();
          g.forEachLatLng && g.forEachLatLng(latlng => bounds.extend(latlng));
        });
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds);
          try {
            google.maps.event.addListenerOnce(map, 'idle', function(){
              try { if (13) map.setZoom(13); } catch(_) {}
            });
          } catch(_) {}
        }
      } catch(e) {}
    })
    .catch(() => {});

  // Load pricing once
  (function loadPrices(){
    const pricesUrl = '/data/prices.json?v=' + PRICES_VERSION;
    fetch(pricesUrl)
      .then(res => res.json())
      .then(json => {
        window._zonePrices = (json && json.zones) || {};
        window._distancePricing = (json && json.distance) || null;
        window._surcharges = (json && json.surcharges) || {};
        window._businessHours = (json && json.businessHours) || null;
        const curr = (json && json.currency) || 'EUR';
        function symbolForCurrency(code){
          switch(String(code||'').toUpperCase()){ case 'EUR': return '€'; case 'USD': return '$'; case 'GBP': return '£'; default: return '€'; }
        }
        window._currencySymbol = symbolForCurrency(curr);
      })
      .catch(() => { window._zonePrices = {}; });
  })();

  (function loadHolidays(){
    const holidaysUrl = '/data/holidays.json?v=' + HOLIDAYS_VERSION;
    fetch(holidaysUrl)
      .then(res => res.text())
      .then(text => {
        const matches = String(text || '').match(/\d{4}-\d{2}-\d{2}/g) || [];
        window._holidaysSet = new Set(matches);
      })
      .catch(() => { window._holidaysSet = new Set(); });
  })();

  let _discountsReady = false;
  let _discountsLoadPromise = null;
  function loadDiscounts(){
    const discountsUrl = '/data/discounts.json?v=' + DISCOUNTS_VERSION;
    return fetch(discountsUrl)
      .then(res => res.json())
      .then(json => {
        window._discountCodes = (json && Array.isArray(json.codes)) ? json.codes : [];
        _discountsReady = true;
      })
      .catch(() => { window._discountCodes = []; _discountsReady = true; });
  }
  function ensureDiscountsLoaded(){
    if (_discountsReady) return Promise.resolve();
    if (_discountsLoadPromise) return _discountsLoadPromise;
    _discountsLoadPromise = loadDiscounts();
    return _discountsLoadPromise;
  }
  ensureDiscountsLoaded();

  function pointInRing(latLng, ringLatLngs){
    const x = latLng.lng();
    const y = latLng.lat();
    let inside = false;
    const n = ringLatLngs.length;
    for (let i = 0, j = n - 1; i < n; j = i++){
      const xi = ringLatLngs[i].lng();
      const yi = ringLatLngs[i].lat();
      const xj = ringLatLngs[j].lng();
      const yj = ringLatLngs[j].lat();
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function featureContainsLatLng(feature, latLng){
    const rings = getFeatureRingsLatLngs(feature);
    if (!rings.length) return false;
    const inOuter = pointInRing(latLng, rings[0]);
    if (!inOuter) return false;
    // If inside any hole, it's excluded
    for (let k = 1; k < rings.length; k++){
      if (pointInRing(latLng, rings[k])) return false;
    }
    return true;
  }
  function featureOuterArea(feature){
    try {
      const rings = getFeatureRingsLatLngs(feature);
      if (!rings.length || !google.maps.geometry || !google.maps.geometry.spherical) return Number.POSITIVE_INFINITY;
      return google.maps.geometry.spherical.computeArea(rings[0]);
    } catch(_) { return Number.POSITIVE_INFINITY; }
  }

  function findZoneForLatLng(latLng){
    // Prefer the innermost (smallest area) zone that contains the point, respecting holes
    let best = null; let bestArea = Number.POSITIVE_INFINITY;
    for (const f of zonesFeatures){
      if (featureContainsLatLng(f, latLng)){
        const a = featureOuterArea(f);
        if (a < bestArea){ bestArea = a; best = f; }
      }
    }
    return best;
  }

  function clearRouteOverlays(){
    try {
      routeMarkers.forEach(m => { try { m.setMap(null); } catch(_){} });
      routeMarkers = [];
      if (routePolyline) { try { routePolyline.setMap(null); } catch(_){} routePolyline = null; }
    } catch(_) {}
  }
  function renderRoute(pickupLoc, stopLocs, dropLoc, routeDetails){
    try {
      clearAllAddressMarkers();
      clearRouteOverlays();
      const pts = [];
      if (pickupLoc) pts.push(pickupLoc);
      (stopLocs||[]).forEach(p => { if (p) pts.push(p); });
      if (dropLoc) pts.push(dropLoc);
      // Markers: P, 1..N, D
      if (pickupLoc && google.maps && google.maps.Marker) {
        routeMarkers.push(new google.maps.Marker({ position: pickupLoc, map, label: { text: 'P' } }));
      }
      for (let i = 0; i < (stopLocs||[]).length; i++){
        const p = stopLocs[i];
        if (!p) continue;
        const text = String(i+1);
        routeMarkers.push(new google.maps.Marker({ position: p, map, label: { text } }));
      }
      if (dropLoc && google.maps && google.maps.Marker) {
        routeMarkers.push(new google.maps.Marker({ position: dropLoc, map, label: { text: 'D' } }));
      }
      // Polyline: use detailed path when available, otherwise straight segments
      const pathPoints = (routeDetails && Array.isArray(routeDetails.pathPoints) && routeDetails.pathPoints.length)
        ? routeDetails.pathPoints
        : pts;
      if (pathPoints && pathPoints.length >= 2 && google.maps && google.maps.Polyline) {
        routePolyline = new google.maps.Polyline({
          path: pathPoints,
          map,
          strokeColor: '#34495e',
          strokeOpacity: 0.9,
          strokeWeight: 4
        });
      }
      // Fit bounds to show all points
      const b = new google.maps.LatLngBounds();
      pts.forEach(p => { try { b.extend(p); } catch(_){} });
      try { if (!b.isEmpty()) map.fitBounds(b); } catch(_) {}
      // Expose minimal API
      window.CargoworksRoutes = {
        getPoints: function(){ return { pickup: pickupLoc, stops: stopLocs.slice(), drop: dropLoc }; },
        getPath: function(){ return (pathPoints||[]).slice(); },
        clear: function(){ clearRouteOverlays(); }
      };
    } catch(_) {}
  }

  // Address search removed; estimator handles quoting

  function boundsCenterLatLng(latLngs){
    const b = new google.maps.LatLngBounds();
    (latLngs||[]).forEach(ll => b.extend(ll));
    try { return b.getCenter(); } catch(_) { return null; }
  }
  function getZoneCenterLatLng(zoneNum){
    let target = null;
    data.forEach(f => {
      const name = f.getProperty && f.getProperty('name');
      if (!name) return;
      const m = String(name).match(/(\d+)/);
      const num = m ? m[1] : '';
      if (num === zoneNum && !target) {
        const rings = getFeatureRingsLatLngs(f);
        target = boundsCenterLatLng(rings[0] || []);
      }
    });
    return target || new google.maps.LatLng(center.lat, center.lng);
  }
  async function geocodeOne(q){
    // Bias results to Barcelona and retry with explicit city if needed
    const bcnBounds = (function(){
      try {
        const sw = new google.maps.LatLng(41.317, 2.052);
        const ne = new google.maps.LatLng(41.468, 2.239);
        return new google.maps.LatLngBounds(sw, ne);
      } catch(_) { return null; }
    })();
    try {
      const resp = await geocoder.geocode({
        address: q,
        region: 'ES',
        bounds: bcnBounds || undefined
      });
      if (resp && resp.results && resp.results[0]) {
        return resp.results[0].geometry.location;
      }
    } catch(_) {}
    // Retry with explicit city hint
    try {
      const resp2 = await geocoder.geocode({
        address: q + ', Barcelona, Spain',
        region: 'ES',
        bounds: bcnBounds || undefined
      });
      if (resp2 && resp2.results && resp2.results[0]) {
        return resp2.results[0].geometry.location;
      }
    } catch(_) {}
    return null;
  }
  function secondsToHuman(sec){
    const h = Math.floor(sec/3600);
    const m = Math.round((sec%3600)/60);
    return (h? (h+'h '):'') + (m? (m+' min'):'');
  }
  function estimateDurationFallback(origin, waypoints, destination){
    try {
      const pts = [origin].concat(waypoints||[]).concat([destination]).filter(Boolean);
      if (pts.length < 2) return 0;
      let meters = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        meters += google.maps.geometry.spherical.computeDistanceBetween(pts[i], pts[i+1]) || 0;
      }
      const detourFactor = 1.25; // account for non-straight routes
      const km = (meters * detourFactor) / 1000;
      const speedKmH = 15; // average cargo bike speed
      const hours = km / speedKmH;
      return Math.round(hours * 3600);
    } catch(_) { return 0; }
  }
  async function computeRouteDuration(origin, waypoints, destination){
    // Use DirectionsService in production; fallback to estimate in dev or on error
    if (devHost) {
      return estimateDurationFallback(origin, waypoints, destination);
    }
    try {
      const req = {
        origin,
        destination,
        travelMode: google.maps.TravelMode.BICYCLING,
        waypoints: (waypoints||[]).map(loc => ({ location: loc, stopover: true }))
      };
      const res = await directions.route(req);
      const route = res && res.routes && res.routes[0];
      if (!route || !route.legs) return estimateDurationFallback(origin, waypoints, destination);
      let total = 0;
      route.legs.forEach(leg => { total += (leg.duration && leg.duration.value) || 0; });
      return total;
    } catch(e) {
      return estimateDurationFallback(origin, waypoints, destination);
    }
  }
  async function computeRouteDetails(origin, waypoints, destination){
    // Returns { totalSec, legs: [{ sec, meters, from, to }] }
    const pts = [origin].concat(waypoints||[]).concat([destination]).filter(Boolean);
    const legs = [];
    if (!pts || pts.length < 2) return { totalSec: 0, legs };
    if (!devHost) {
      try {
        const req = {
          origin,
          destination,
          travelMode: google.maps.TravelMode.BICYCLING,
          waypoints: (waypoints||[]).map(loc => ({ location: loc, stopover: true }))
        };
        const res = await directions.route(req);
        const route = res && res.routes && res.routes[0];
        if (route && route.legs && route.legs.length) {
          let totalSec = 0;
          const pathPoints = [];
          for (let i = 0; i < route.legs.length; i++) {
            const leg = route.legs[i];
            const sec = (leg.duration && leg.duration.value) || 0;
            const meters = (leg.distance && leg.distance.value) || 0;
            totalSec += sec;
            legs.push({ sec, meters, from: pts[i], to: pts[i+1] });
            // Collect detailed path points for legs after pickup (exclude base→pickup leg at index 0)
            if (i >= 1 && leg.steps) {
              for (let s = 0; s < leg.steps.length; s++) {
                const step = leg.steps[s];
                const path = step && step.path;
                if (Array.isArray(path)) {
                  for (let k = 0; k < path.length; k++) {
                    pathPoints.push(path[k]);
                  }
                } else {
                  if (step && step.start_location) pathPoints.push(step.start_location);
                  if (step && step.end_location) pathPoints.push(step.end_location);
                }
              }
            }
          }
          return { totalSec, legs, pathPoints };
        }
      } catch(_) {}
    }
    // Fallback: estimate per-leg using spherical distances
    try {
      let totalSec = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const meters = (google.maps.geometry && google.maps.geometry.spherical)
          ? (google.maps.geometry.spherical.computeDistanceBetween(pts[i], pts[i+1]) || 0)
          : 0;
        const detourFactor = 1.25;
        const km = (meters * detourFactor) / 1000;
        const speedKmH = 15;
        const sec = Math.round((km / speedKmH) * 3600);
        totalSec += sec;
        legs.push({ sec, meters, from: pts[i], to: pts[i+1] });
      }
      return { totalSec, legs, pathPoints: [] };
    } catch(_) { return { totalSec: 0, legs: [] }; }
  }

  function countZoneCrossings(points){
    try {
      let crossings = 0;
      let prevZone = null;
      for (let i = 0; i < points.length; i++){
        const zStr = zoneNumberForLatLng(points[i]);
        const z = Number(zStr || 0) || 0;
        if (!z) continue;
        if (prevZone == null) { prevZone = z; continue; }
        if (z !== prevZone) { crossings++; prevZone = z; }
      }
      return crossings;
    } catch(_) { return 0; }
  }
  function approxSegmentCrossingsByZones(a, b){
    a = Number(a||0)||0; b = Number(b||0)||0;
    if (!a || !b) return 0;
    if (a === b) return Math.max(0, 2*a - 1); // across same ring (diameter) → 2n-1
    return Math.abs(a - b);
  }
  function countCrossingsForPickupToDrop(routeDetails, pickupLoc, stopLocs, dropLoc){
    // Prefer detailed path points gathered for pickup→stops→drop legs
    if (routeDetails && Array.isArray(routeDetails.pathPoints) && routeDetails.pathPoints.length){
      return countZoneCrossings(routeDetails.pathPoints);
    }
    // Fallback: approximate using zone indices at endpoints
    const points = [pickupLoc].concat(stopLocs||[]).concat([dropLoc]).filter(Boolean);
    let total = 0;
    for (let i = 0; i < points.length - 1; i++){
      const a = zoneNumberForLatLng(points[i]);
      const b = zoneNumberForLatLng(points[i+1]);
      total += approxSegmentCrossingsByZones(a, b);
    }
    return total;
  }
  function zoneNumberForLatLng(latLng){
    const z = findZoneForLatLng(latLng);
    const n = z && z.getProperty && z.getProperty('name');
    const m = String(n||'').match(/(\d+)/);
    return m ? m[1] : '';
  }
  function basePriceForZone(num){
    const p = num && window._zonePrices && window._zonePrices[num] && window._zonePrices[num].base;
    return Number(p||0);
  }

  const qPickup = document.getElementById('quotePickup');
  const qDrop = document.getElementById('quoteDropoff');
  let lastAddressInput = null;
  let activeLocationInput = null;
  function isAddressInput(el){
    return !!(el && el.tagName === 'INPUT' && (el.id === 'quotePickup' || el.id === 'quoteDropoff' || el.classList.contains('quote-stop')));
  }
  document.addEventListener('focusin', function(e){
    const el = e && e.target;
    if (isAddressInput(el)) lastAddressInput = el;
  });
  function collectAddressInputs(){
    const ordered = getOrderedInputs();
    if (ordered.length) return ordered;
    const inputs = [];
    if (qPickup) inputs.push(qPickup);
    if (qDrop) inputs.push(qDrop);
    if (qStopsWrap) {
      Array.from(qStopsWrap.querySelectorAll('.quote-stop')).forEach(function(el){ inputs.push(el); });
    }
    return inputs;
  }
  function clearStoredLocation(inputEl){
    try {
      if (!inputEl || !inputEl.dataset) return;
      delete inputEl.dataset.lat;
      delete inputEl.dataset.lng;
      delete inputEl.dataset.address;
      clearAddressMarker(inputEl);
      if (typeof invalidateEstimate === 'function') invalidateEstimate();
    } catch(_) {}
  }
  function requestGeocodeForInput(inputEl){
    try {
      if (!inputEl) return;
      const val = String(inputEl.value || '').trim();
      if (!val) {
        clearStoredLocation(inputEl);
        clearRouteOverlays();
        updateAddressMarkers();
        return;
      }
      const stored = String((inputEl.dataset && inputEl.dataset.address) || '').trim();
      const hasCoords = inputEl.dataset && inputEl.dataset.lat && inputEl.dataset.lng;
      if (stored && stored === val && hasCoords) return;
      geocodeOne(val).then(function(loc){
        if (!loc) return;
        inputEl.dataset.lat = String(loc.lat());
        inputEl.dataset.lng = String(loc.lng());
        inputEl.dataset.address = val;
        setAddressMarker(inputEl, loc);
        updateAddressMarkers();
        autoEstimateIfReady();
      });
    } catch(_) {}
  }
  function attachAddressInputHandlers(inputEl){
    try {
      if (!inputEl) return;
      inputEl.addEventListener('input', function(){
        const val = String(inputEl.value || '').trim();
        if (!val) {
          clearStoredLocation(inputEl);
          clearRouteOverlays();
          updateAddressMarkers();
          return;
        }
        const stored = String((inputEl.dataset && inputEl.dataset.address) || '').trim();
        if (!stored) { clearAddressMarker(inputEl); return; }
        if (val !== stored) {
          clearStoredLocation(inputEl);
          clearRouteOverlays();
          updateAddressMarkers();
        }
      });
      inputEl.addEventListener('focus', function(){
        activeLocationInput = inputEl;
        scheduleLocationOptionRefresh();
      });
      inputEl.addEventListener('blur', function(){
        if (activeLocationInput === inputEl) activeLocationInput = null;
        requestGeocodeForInput(inputEl);
      });
      inputEl.addEventListener('keydown', function(e){
        if (e && e.key === 'Enter') {
          e.preventDefault();
          requestGeocodeForInput(inputEl);
        }
      });
      inputEl.addEventListener('input', function(){
        if (document.activeElement === inputEl) scheduleLocationOptionRefresh();
      });
    } catch(_) {}
  }
    // Simple i18n helper for estimator messages
    function i18n(key, params){
      try {
        const translations = window.CARGOWORKS_TRANSLATIONS || {};
        const lang = document.documentElement.lang || 'en';
        const dict = Object.assign({}, translations.en||{}, translations[lang]||{});
        let s = dict[key] || '';
        if (params && s) {
          Object.keys(params).forEach(k => { s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), String(params[k])); });
        }
        return s;
      } catch(_) { return ''; }
    }

  function findPacContainerForInput(inputEl){
    try {
      const ownedId = (inputEl && (inputEl.getAttribute('aria-controls') || inputEl.getAttribute('aria-owns'))) || '';
      if (ownedId) {
        const ownedEl = document.getElementById(ownedId);
        if (ownedEl && ownedEl.classList && ownedEl.classList.contains('pac-container')) return ownedEl;
      }
      const containers = Array.from(document.querySelectorAll('.pac-container'));
      if (!containers.length) return null;
      const inputRect = inputEl.getBoundingClientRect();
      let best = null;
      let bestScore = Number.POSITIVE_INFINITY;
      containers.forEach(function(container){
        const r = container.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const dx = Math.abs(r.left - inputRect.left);
        const dy = Math.abs(r.top - inputRect.bottom);
        const score = dx + dy;
        if (score < bestScore) { bestScore = score; best = container; }
      });
      return best;
    } catch(_) { return null; }
  }
  function ensureLocationOptionInPac(inputEl){
    if (!inputEl) return;
    const container = findPacContainerForInput(inputEl);
    if (!container) return;
    let option = container.querySelector('.cw-location-option');
    if (option && option._cwInput && option._cwInput !== inputEl) {
      option.remove();
      option = null;
    }
    const label = i18n('useCurrentLocation') || 'Use current location';
    if (!option) {
      option = document.createElement('div');
      option.className = 'pac-item cw-location-option';
      option.setAttribute('role', 'option');
      option.tabIndex = -1;
      option.innerHTML = '<span class="cw-location-icon" aria-hidden="true">⌖</span><span class="cw-location-text"></span>';
      option.addEventListener('mousedown', function(e){ try { e.preventDefault(); } catch(_) {} });
      option.addEventListener('click', function(){
        try { setCurrentLocationForInput(inputEl); } catch(_) {}
      });
      option._cwInput = inputEl;
      container.appendChild(option);
    }
    const text = option.querySelector('.cw-location-text');
    if (text) text.textContent = label;
  }
  function scheduleLocationOptionRefresh(){
    if (!activeLocationInput) return;
    window.setTimeout(function(){
      try { ensureLocationOptionInPac(activeLocationInput); } catch(_) {}
    }, 0);
  }
  const pacObserver = new MutationObserver(function(){
    if (activeLocationInput) scheduleLocationOptionRefresh();
  });
  try {
    pacObserver.observe(document.body, { childList: true, subtree: true });
  } catch(_) {}
  function setCurrentLocationForInput(inputEl){
    try {
      if (!inputEl || !navigator.geolocation) {
        setQuoteResultWithDebug(i18n('quoteLocationUnavailable') || 'Location unavailable', 'Geolocation not supported');
        return;
      }
      navigator.geolocation.getCurrentPosition(async function(pos){
        try {
          const ll = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
          const addr = await reverseGeocodeAddress(ll);
          const label = addr || (i18n('quoteCurrentLocation') || 'Current location');
          inputEl.value = label;
          inputEl.dataset.lat = String(ll.lat());
          inputEl.dataset.lng = String(ll.lng());
          inputEl.dataset.address = label;
          setAddressMarker(inputEl, ll);
          updateAddressMarkers();
          autoEstimateIfReady();
        } catch(err) {
          setQuoteResultWithDebug(i18n('quoteLocationUnavailable') || 'Location unavailable', (err && err.message) || 'Reverse geocode failed');
        }
      }, function(err){
        setQuoteResultWithDebug(i18n('quoteLocationUnavailable') || 'Location unavailable', (err && err.message) || 'Geolocation blocked');
      }, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000
      });
    } catch(_) {}
  }
  // Note: Removed helper that converted destination into the first stop.
  const qEstimate = document.getElementById('quoteEstimate');
  const qOptimize = document.getElementById('quoteOptimize');
  const qOut = document.getElementById('quoteResult');
  const qRate = document.getElementById('quoteRate');
  const qDate = document.getElementById('quoteDate');
  const qTime = document.getElementById('quoteTime');
  const qCargo = document.getElementById('quoteCargo');
  const qLoadRandom = document.getElementById('quoteLoadRandom');
  const qRefresh = document.getElementById('quoteRefresh');
  const qDiscount = document.getElementById('quoteDiscount');
  const qDiscountApply = document.getElementById('quoteDiscountApply');
  const qDiscountStatus = document.getElementById('quoteDiscountStatus');
  const qTimeStatus = document.getElementById('quoteTimeStatus');
  const qName = document.getElementById('quoteName');
  const qEmail = document.getElementById('quoteEmail');
  const qPhone = document.getElementById('quotePhone');
  const qNotes = document.getElementById('quoteNotes');
  const qUpdates = document.getElementById('quoteUpdates');
  const qConsent = document.getElementById('quoteConsent');
  const qSubmit = document.getElementById('quoteSubmit');
  const qBookingStatus = document.getElementById('quoteBookingStatus');
  const DEFAULT_DISCOUNT_CODE = 'SELF5';
  // const qByDistance = document.getElementById('quoteByDistance'); // removed toggle
  // Show simple API status near estimator
  (function showApiStatus(){
    try {
      var container = document.querySelector('.quote-estimator') || document.querySelector('.zones-controls');
      if (!container) return;
      var el = document.getElementById('apiStatus');
      if (!el) { el = document.createElement('span'); el.id = 'apiStatus'; el.className = 'zones-result'; el.style.marginLeft = '0.5rem'; container.appendChild(el); }
      var hasPlaces = !!(google.maps.places && (google.maps.places.Autocomplete || google.maps.places.PlaceAutocompleteElement));
      if (!hasPlaces) {
        try {
          const translations = window.CARGOWORKS_TRANSLATIONS || {};
          const lang = document.documentElement.lang || 'en';
          const dict = Object.assign({}, translations.en||{}, translations[lang]||{});
          el.textContent = dict.apiStatusNoPlaces || 'Address suggestions unavailable — enable Places API or use PlaceAutocompleteElement.';
        } catch(_) {
          el.textContent = 'Address suggestions unavailable — enable Places API or use PlaceAutocompleteElement.';
        }
      } else {
        el.textContent = '';
      }
    } catch(_) {}
  })();
  function pad2(n){ return String(n).padStart(2, '0'); }
  function defaultDateTimeInputs(){
    try {
      const now = new Date();
      if (qDate && !qDate.value) {
        qDate.value = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
      }
      if (qTime && !qTime.value) {
        qTime.value = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
      }
    } catch(_) {}
  }
  if (qDiscount && !qDiscount.value) qDiscount.value = DEFAULT_DISCOUNT_CODE;
  if (qDate) qDate.addEventListener('change', function(){ try { autoEstimateIfReady(); refreshAvailability(); } catch(_) {} });
  if (qTime) qTime.addEventListener('change', function(){ try { autoEstimateIfReady(); refreshAvailability(); } catch(_) {} });
  if (qCargo) qCargo.addEventListener('change', function(){ try { autoEstimateIfReady(); } catch(_) {} });
  let activeDiscountCodes = [];
  function setDiscountStatus(msg, isError){
    if (!qDiscountStatus) return;
    qDiscountStatus.textContent = msg || '';
    qDiscountStatus.classList.toggle('is-error', !!isError);
  }
  function setBookingStatus(msg, isError){
    if (!qBookingStatus) return;
    qBookingStatus.textContent = msg || '';
    qBookingStatus.classList.toggle('is-error', !!isError);
  }
  function setBookingStatusHtml(parts, isError){
    if (!qBookingStatus) return;
    qBookingStatus.textContent = '';
    qBookingStatus.classList.toggle('is-error', !!isError);
    (parts || []).forEach(function(part){
      if (typeof part === 'string') {
        qBookingStatus.appendChild(document.createTextNode(part));
      } else if (part && part.nodeType) {
        qBookingStatus.appendChild(part);
      }
    });
  }
  function buildStatusLink(url, label){
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = label || url;
    return link;
  }
  function normalizeDiscountCode(code){
    return String(code || '').trim().toUpperCase();
  }
  function getDiscountCodes(){
    return Array.isArray(window._discountCodes) ? window._discountCodes : [];
  }
  function findDiscountByCode(code){
    const target = normalizeDiscountCode(code);
    if (!target) return null;
    return getDiscountCodes().find(item => normalizeDiscountCode(item && item.code) === target) || null;
  }
  function computeDiscountAmount(discount, total){
    if (!discount || !total) return 0;
    const type = String(discount.type || '').toLowerCase();
    const amount = Number(discount.amount || 0) || 0;
    if (type === 'fixed') return Math.min(total, Math.max(0, amount));
    if (type === 'percent') return Math.min(total, Math.max(0, (total * amount / 100)));
    return 0;
  }
  function resolveDiscountsForEstimate(totalBeforeDiscount, dateKey, cur){
    const codes = Array.isArray(activeDiscountCodes) ? activeDiscountCodes.slice() : [];
    const applied = [];
    const errors = [];
    const baseTotal = Number(totalBeforeDiscount || 0) || 0;
    codes.forEach(function(code){
      const normalized = normalizeDiscountCode(code);
      if (!normalized) return;
      const discount = findDiscountByCode(normalized);
      if (!discount) {
        errors.push(i18n('discountNotFound') || 'Code not found.');
        return;
      }
      if (discount.active === false) {
        errors.push(i18n('discountInactive') || 'Code inactive.');
        return;
      }
      const start = String(discount.start || '').trim();
      const end = String(discount.end || '').trim();
      if (start && dateKey < start) {
        errors.push(i18n('discountNotActiveYet') || 'Code not active yet.');
        return;
      }
      if (end && dateKey > end) {
        errors.push(i18n('discountExpired') || 'Code expired.');
        return;
      }
      const minOrder = Number(discount.minOrder || 0) || 0;
      if (minOrder && baseTotal < minOrder) {
        const minMsg = i18n('discountMinOrder', { currency: (cur || '€'), amount: minOrder.toFixed(2) }) || ('Min order ' + (cur || '€') + minOrder.toFixed(2));
        errors.push(minMsg);
        return;
      }
      const amount = computeDiscountAmount(discount, baseTotal);
      if (amount) {
        applied.push({ code: normalized, amount, discount });
      }
    });
    const totalDiscount = Math.min(baseTotal, applied.reduce((sum, item) => sum + (Number(item.amount || 0) || 0), 0));
    return { totalDiscount, applied, errors };
  }
  function clearActiveDiscount(){
    activeDiscountCodes = [];
    if (qDiscount) qDiscount.value = '';
    setDiscountStatus('');
  }

  if (qDiscountApply) {
    qDiscountApply.addEventListener('click', function(){
      const code = normalizeDiscountCode(qDiscount && qDiscount.value);
      if (!code) { clearActiveDiscount(); return; }
      setDiscountStatus(i18n('discountChecking') || 'Checking code...');
      ensureDiscountsLoaded().then(function(){
        const discount = findDiscountByCode(code);
        if (!discount) {
          setDiscountStatus(i18n('discountNotFound') || 'Code not found.', true);
          return;
        }
        if (activeDiscountCodes.includes(code)) {
          setDiscountStatus('Code already applied.');
          return;
        }
        activeDiscountCodes.push(code);
        setDiscountStatus(i18n('discountApplied', { code }) || ('Code applied: ' + code));
        if (typeof runEstimate === 'function') runEstimate();
      });
    });
  }
  if (qDiscount) {
    qDiscount.addEventListener('input', function(){
      const code = normalizeDiscountCode(qDiscount.value);
      if (!code || !activeDiscountCodes.includes(code)) setDiscountStatus('');
    });
  }

  function parseTimeToMinutes(str){
    const s = String(str || '').trim();
    if (!s) return null;
    const parts = s.split(':');
    if (!parts.length) return null;
    const h = Number(parts[0] || 0);
    const m = Number(parts[1] || 0);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return (h * 60) + m;
  }
  function formatDateKeyLocal(dt){
    return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
  }
  function getSelectedDateTime(){
    try {
      const now = new Date();
      const dateStr = qDate && qDate.value ? String(qDate.value) : '';
      const timeStr = qTime && qTime.value ? String(qTime.value) : '';
      const base = dateStr ? new Date(dateStr + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const minutes = parseTimeToMinutes(timeStr);
      const h = minutes != null ? Math.floor(minutes / 60) : now.getHours();
      const m = minutes != null ? (minutes % 60) : now.getMinutes();
      return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0);
    } catch(_) { return new Date(); }
  }
  function getBusinessHours(isWeekendHoliday){
    const bh = window._businessHours || {};
    const fallback = {
      weekday: { start: '07:00', end: '17:00' },
      weekendHoliday: { start: '07:00', end: '14:00' }
    };
    const use = isWeekendHoliday ? (bh.weekendHoliday || fallback.weekendHoliday) : (bh.weekday || fallback.weekday);
    return use || fallback.weekday;
  }
  function computeSurchargeInfo(){
    const hasDate = !!(qDate && qDate.value);
    const hasTime = !!(qTime && qTime.value);
    const now = new Date();
    const dateBase = hasDate
      ? new Date(String(qDate.value) + 'T00:00:00')
      : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateKey = formatDateKeyLocal(dateBase);
    const holidays = window._holidaysSet instanceof Set ? window._holidaysSet : new Set();
    const isHoliday = hasDate ? holidays.has(dateKey) : false;
    const isWeekend = hasDate ? (dateBase.getDay() === 0 || dateBase.getDay() === 6) : false;
    const isWeekendHoliday = isWeekend || isHoliday;
    const hours = getBusinessHours(isWeekendHoliday);
    const startMin = parseTimeToMinutes(hours && hours.start) ?? 0;
    const endMin = parseTimeToMinutes(hours && hours.end) ?? (24 * 60);
    const timeMin = hasTime ? parseTimeToMinutes(qTime && qTime.value) : null;
    const afterHours = (timeMin == null) ? false : (timeMin < startMin || timeMin >= endMin);
    const sur = window._surcharges || {};
    const weekendRate = Number(sur.weekend_holiday || 0) || 0;
    const afterRate = Number(sur.after_hours || 0) || 0;
    const rate = (isWeekendHoliday ? weekendRate : 0) + (afterHours ? afterRate : 0);
    return {
      dateKey,
      timeLabel: (timeMin == null) ? '' : (pad2(Math.floor(timeMin / 60)) + ':' + pad2(timeMin % 60)),
      isHoliday,
      isWeekend,
      isWeekendHoliday,
      afterHours,
      rate,
      weekendRate,
      afterRate
    };
  }

  const availabilityCache = new Map();
  let availabilitySeq = 0;
  function setAvailabilityStatus(msg, isError){
    if (!qTimeStatus) return;
    qTimeStatus.textContent = msg || '';
    qTimeStatus.classList.toggle('is-error', !!isError);
  }
  function calendarConfigured(){
    return !!BOOKING_API_BASE;
  }
  function parseLatLngFromText(text){
    const m = String(text || '').match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
    if (!m) return null;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  }
  function extractReturnOverride(text){
    const m = String(text || '').match(/return\s*[:=]\s*(\d+)/i);
    if (!m) return null;
    return Number(m[1] || 0) || 0;
  }
  async function getReturnMinutesForEvent(event){
    try {
      const desc = (event && event.description) || '';
      const sum = (event && event.summary) || '';
      const override = extractReturnOverride(desc) ?? extractReturnOverride(sum);
      if (override != null) return override;
      const dropText = desc || sum || (event && event.location) || '';
      const parsed = parseLatLngFromText(dropText);
      let ll = parsed;
      if (!ll && event && event.location) {
        const loc = await geocodeOne(event.location);
        if (loc) ll = { lat: loc.lat(), lng: loc.lng() };
      }
      if (!ll) return 0;
      const distanceKm = Math.max(0, haversineKm(center, ll) || 0);
      return Math.round((distanceKm / RETURN_SPEED_KMH) * 60);
    } catch(_) { return 0; }
  }
  function eventDateFromValue(val){
    if (!val) return null;
    const dt = new Date(val);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  async function fetchAvailabilityForDate(dateKey){
    if (!calendarConfigured()) return null;
    if (availabilityCache.has(dateKey)) return availabilityCache.get(dateKey);
    const base = BOOKING_API_BASE.replace(/\/$/, '');
    const url = base + '?date=' + encodeURIComponent(dateKey);
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('Availability fetch failed');
    const json = await res.json();
    const blocked = Array.isArray(json && json.blocked) ? json.blocked : [];
    const result = { blocked };
    availabilityCache.set(dateKey, result);
    return result;
  }
  function isTimeBlocked(min, blocked){
    return blocked.some(b => min >= b.start && min < b.end);
  }
  function isWeekendHolidayKey(dateKey){
    const holidays = window._holidaysSet instanceof Set ? window._holidaysSet : new Set();
    if (holidays.has(dateKey)) return true;
    const parts = String(dateKey || '').split('-');
    if (parts.length !== 3) return false;
    const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const day = dt.getDay();
    return day === 0 || day === 6;
  }
  function findNextAvailableMinute(startMin, blocked, dateKey){
    const hours = getBusinessHours(isWeekendHolidayKey(dateKey));
    const startHours = parseTimeToMinutes(hours && hours.start) ?? 0;
    const endHours = parseTimeToMinutes(hours && hours.end) ?? (24 * 60);
    const start = Math.max(startMin, startHours);
    for (let m = start; m < endHours; m += AVAILABILITY_SLOT_MINUTES){
      if (!isTimeBlocked(m, blocked)) return m;
    }
    return null;
  }
  function setTimeInputMinutes(min){
    if (!qTime || min == null) return;
    const h = Math.floor(min / 60);
    const m = min % 60;
    qTime.value = pad2(h) + ':' + pad2(m);
  }
  async function refreshAvailability(){
    if (!calendarConfigured()) { setAvailabilityStatus(''); return; }
    const dateKey = qDate && qDate.value ? String(qDate.value) : formatDateKeyLocal(new Date());
    const seq = ++availabilitySeq;
    setAvailabilityStatus(i18n('availabilityChecking') || 'Checking availability...');
    try {
      const data = await fetchAvailabilityForDate(dateKey);
      if (seq !== availabilitySeq) return;
      const blocked = (data && data.blocked) || [];
      const selectedMin = parseTimeToMinutes(qTime && qTime.value);
      const nextMin = findNextAvailableMinute(selectedMin != null ? selectedMin : 0, blocked, dateKey);
      if (nextMin == null) {
        setAvailabilityStatus(i18n('availabilityNone') || 'No availability on this date.', true);
        return;
      }
      if (selectedMin == null || selectedMin !== nextMin) {
        setTimeInputMinutes(nextMin);
        const slot = pad2(Math.floor(nextMin / 60)) + ':' + pad2(nextMin % 60);
        setAvailabilityStatus(i18n('availabilityNextSlot', { time: slot }) || ('Next available slot: ' + slot));
      } else {
        setAvailabilityStatus(i18n('availabilityAvailable') || 'Time available.');
      }
    } catch(_){
      if (seq !== availabilitySeq) return;
      setAvailabilityStatus(i18n('availabilityError') || 'Could not load calendar availability.', true);
    }
  }
  if (qDate && qTime) {
    try { refreshAvailability(); } catch(_) {}
  }
  function getCargoAdjustment(){
    try {
      const value = qCargo ? String(qCargo.value || 'regular') : 'regular';
      if (value === 'small') return { key: 'small', label: 'Small parcel (shoebox)', rate: -0.15 };
      if (value === 'large') return { key: 'large', label: 'Large or multiple regular', rate: 0.15 };
      return { key: 'regular', label: 'Regular (60x40x30cm)', rate: 0 };
    } catch(_) { return { key: 'regular', label: 'Regular (60x40x30cm)', rate: 0 }; }
  }

  // Structured output helpers
  function setQuoteResultWithDebug(visibleText, debugText, headlineText){
    if (!qOut) return;
    try {
      qOut.innerHTML = '';
      if (headlineText) {
        const headline = document.createElement('h2');
        headline.className = 'quote-headline';
        headline.textContent = headlineText;
        qOut.appendChild(headline);
      }
      if (visibleText) {
        const summary = document.createElement('span');
        summary.className = 'quote-summary';
        summary.style.display = 'block';
        summary.textContent = visibleText;
        qOut.appendChild(summary);
      }
      if (debugText) {
        const hidden = document.createElement('span');
        hidden.className = 'quote-debug';
        hidden.style.display = 'none';
        hidden.textContent = 'DEBUG: ' + debugText;
        qOut.appendChild(hidden);
      }
    } catch(_) {
      try { qOut.textContent = visibleText || ''; } catch(__) {}
    }
  }
  function setBreakdownLines(lines){
    try {
      if (!qOut || !Array.isArray(lines)) return;
      const existing = qOut.querySelector('.quote-breakdown');
      if (existing) existing.remove();
      const box = document.createElement('div');
      box.className = 'quote-breakdown';
      const now = new Date();
      const hh = String(now.getHours()).padStart(2,'0');
      const mm = String(now.getMinutes()).padStart(2,'0');
      const ss = String(now.getSeconds()).padStart(2,'0');
      const blocks = [];
      let current = null;
      (lines || []).forEach(function(line){
        const text = String(line || '');
        const isHeader = /:$/.test(text);
        if (isHeader) {
          current = { title: text.replace(/:$/, ''), lines: [] };
          blocks.push(current);
        } else {
          if (!current) {
            current = { title: '', lines: [] };
            blocks.push(current);
          }
          current.lines.push(text);
        }
      });
      blocks.forEach(function(block){
        const el = document.createElement('div');
        el.className = 'quote-block';
        if (block.title) {
          const t = document.createElement('div');
          t.className = 'quote-block-title';
          t.textContent = block.title;
          el.appendChild(t);
        }
        const linesArr = block.lines || [];
        for (let i = 0; i < linesArr.length; i++) {
          const text = String(linesArr[i] || '');
          const next = (i + 1 < linesArr.length) ? String(linesArr[i + 1] || '') : '';
          const isExpr = /[×=]/.test(text);
          const isLabel = !!text && !/:$/.test(text) && !!next;
          if (isLabel && next && !/:$/.test(next)) {
            const row = document.createElement('div');
            row.className = 'quote-block-row';
            const label = document.createElement('div');
            label.className = 'quote-block-label';
            label.textContent = text;
            const value = document.createElement('div');
            value.className = 'quote-block-value' + (/[×=]/.test(next) ? ' quote-block-line--expr' : '');
            value.textContent = next;
            row.appendChild(label);
            row.appendChild(value);
            el.appendChild(row);
            i++;
            continue;
          }
          const l = document.createElement('div');
          l.className = 'quote-block-line' + (isExpr ? ' quote-block-line--expr' : '');
          l.textContent = text;
          el.appendChild(l);
        }
        box.appendChild(el);
      });
      const meta = document.createElement('div');
      meta.className = 'quote-breakdown-meta';
      const recalculated = i18n('quoteRecalculatedAt', { time: (hh + ':' + mm + ':' + ss) }) || ('Recalculated at ' + hh + ':' + mm + ':' + ss);
      meta.textContent = recalculated;
      box.appendChild(meta);
      qOut.appendChild(box);
      if (window.ScrollTrigger && typeof window.ScrollTrigger.refresh === 'function') {
        window.requestAnimationFrame(function(){
          try { window.ScrollTrigger.refresh(); } catch(_) {}
        });
      }
    } catch(_) {}
  }
  function formatNumberLocalized(value, decimals){
    const num = Number(value || 0) || 0;
    const fixed = num.toFixed(decimals);
    const lang = document.documentElement.lang || 'en';
    return (lang === 'en') ? fixed : fixed.replace('.', ',');
  }
  function formatMoneyLocalized(value, cur){
    return String(cur || '€') + formatNumberLocalized(value, 2);
  }
  function formatMoneySigned(value, cur){
    const num = Number(value || 0) || 0;
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    return sign + formatMoneyLocalized(abs, cur);
  }
  function setPricingUiCopy(ctx){
    try {
      const summaryEl = document.getElementById('pricingUiSummary');
      const breakdownEl = document.getElementById('pricingUiBreakdown');
      const blockEl = document.getElementById('pricingUiBlock');
      if (!summaryEl && !breakdownEl) return;
      const cur = ctx.cur || '€';
      const kmText = formatNumberLocalized(ctx.totalKm || 0, 1);
      const minsText = Math.round(Number(ctx.etaTotalMins || 0) || 0);
      const dropCount = Number(ctx.dropCount || 0) || 0;
      const dropLabel = dropCount === 1
        ? (i18n('summaryDropSingle') || 'drop')
        : (i18n('summaryDropPlural') || 'drops');
      const routeText = kmText + ' km ' + (i18n('summaryRouteSeparator') || '·') + ' ' + minsText + ' min ' + (i18n('summaryRouteSeparator') || '·') + ' ' + dropCount + ' ' + dropLabel;
      const serviceParts = [];
      if (ctx.isWeekendHoliday) serviceParts.push(i18n('summaryServiceWeekend') || 'Weekend service');
      if (ctx.afterHours) serviceParts.push(i18n('summaryServiceAfterHours') || 'After-hours');
      if (ctx.cargoKey === 'large') serviceParts.push(i18n('summaryServiceLargeCargo') || 'Large cargo');
      if (ctx.cargoKey === 'small') serviceParts.push(i18n('summaryServiceSmallCargo') || 'Small cargo');
      const serviceText = serviceParts.length
        ? serviceParts.join(' ' + (i18n('summaryServiceSeparator') || '·') + ' ')
        : (i18n('summaryServiceStandard') || 'Standard service');
      if (summaryEl) {
        const summaryParts = [];
        summaryParts.push('<strong>' + (i18n('summaryTotalLabel') || 'Total') + '</strong><br>' + formatMoneyLocalized(ctx.total || 0, cur));
        summaryParts.push('<strong>' + (i18n('summaryRouteLabel') || 'Route') + '</strong><br>' + routeText);
        summaryParts.push('<strong>' + (i18n('summaryServiceLabel') || 'Service') + '</strong><br>' + serviceText);
        if (ctx.discountAmount) {
          const discountText = i18n('summaryDiscountApplied') || 'Discount applied';
          summaryParts.push('<strong>' + (i18n('summaryDiscountLabel') || 'Discount') + '</strong><br>' + discountText);
        }
        summaryEl.innerHTML = summaryParts.join('<br><br>');
        summaryEl.classList.remove('is-hidden');
      }
      if (breakdownEl) {
        const zoneLabel = i18n('breakdownZoneLabel', { n: ctx.pickupZone }) || ('Zone ' + String(ctx.pickupZone || ''));
        const dropZoneLabel = i18n('breakdownZoneLabel', { n: ctx.dropZone }) || ('Zone ' + String(ctx.dropZone || ''));
        const lines = [];
        lines.push('<strong><u>' + (i18n('breakdownZonesLabel') || 'Zones') + '</u></strong>');
        lines.push('- <strong>' + (i18n('breakdownPickupLabel') || 'Pickup') + ':</strong> ' + zoneLabel);
        lines.push('- <strong>' + (i18n('breakdownDeliveryLabel') || 'Delivery') + ':</strong> ' + dropZoneLabel);
        lines.push('');
        lines.push('<strong><u>' + (i18n('breakdownLineItemsLabel') || 'Line items') + '</u></strong>');
        lines.push('- <strong>' + (i18n('breakdownBaseServiceLabel') || 'Base service') + ':</strong> ' + formatMoneyLocalized(ctx.pickupCharge || 0, cur));
        lines.push('- <strong>' + (i18n('breakdownDistanceLabel') || 'Distance') + ':</strong> ' + formatMoneyLocalized(ctx.distanceTotal || 0, cur));
        if (ctx.addressFeeCount) {
          const perUnitValue = (ctx.addressFeePer != null)
            ? Number(ctx.addressFeePer || 0)
            : (ctx.addressFeeCount ? (Number(ctx.addressFee || 0) / Number(ctx.addressFeeCount || 1)) : 0);
          const perUnit = formatMoneyLocalized(perUnitValue || 0, cur);
          const deliveryLine = (i18n('breakdownDeliveryFeeLine', {
            count: ctx.addressFeeCount,
            unit: perUnit,
            total: formatMoneyLocalized(ctx.addressFee || 0, cur)
          }) || ('Deliveries: ' + ctx.addressFeeCount + ' x ' + perUnit + ' = ' + formatMoneyLocalized(ctx.addressFee || 0, cur)));
          lines.push('- <strong>' + (i18n('breakdownDeliveriesLabel') || 'Deliveries') + ':</strong> ' + deliveryLine);
        }
        if (ctx.cargoKey === 'large' && ctx.cargoAmount) {
          lines.push('- <strong>' + (i18n('breakdownLargeCargoLabel') || 'Large cargo') + ':</strong> ' + formatMoneyLocalized(ctx.cargoAmount || 0, cur));
        }
        if (ctx.cargoKey === 'small' && ctx.cargoAmount) {
          lines.push('- <strong>' + (i18n('breakdownSmallCargoLabel') || 'Small cargo') + ':</strong> ' + formatMoneySigned(ctx.cargoAmount || 0, cur));
        }
        if (ctx.isWeekendHoliday && ctx.weekendSurchargeAmount) {
          lines.push('- <strong>' + (i18n('breakdownSurchargeWeekendLabel') || 'Weekend/holiday surcharge') + ':</strong> ' + formatMoneyLocalized(ctx.weekendSurchargeAmount || 0, cur));
        }
        if (ctx.afterHours && ctx.afterHoursSurchargeAmount) {
          lines.push('- <strong>' + (i18n('breakdownSurchargeAfterLabel') || 'After-hours surcharge') + ':</strong> ' + formatMoneyLocalized(ctx.afterHoursSurchargeAmount || 0, cur));
        }
        const discountItems = Array.isArray(ctx.discountItems) ? ctx.discountItems : [];
        if (discountItems.length) {
          discountItems.forEach(function(item){
            const promoLabel = i18n('breakdownPromoLabel', { code: item.code }) || ('Promo ' + item.code);
            lines.push('- ' + promoLabel + ': ' + formatMoneySigned(-(Math.abs(item.amount || 0)), cur));
          });
          lines.push('- <strong>' + (i18n('breakdownDiscountTotalLabel') || 'Discount total') + ':</strong> ' + formatMoneySigned(-(Math.abs(ctx.discountTotal || 0)), cur));
        }
        lines.push('');
        lines.push('<strong><u>' + (i18n('breakdownTotalLabel') || 'Total') + '</u></strong>');
        lines.push(formatMoneyLocalized(ctx.total || 0, cur));
        breakdownEl.innerHTML = lines.join('<br>');
      }
      if (blockEl) blockEl.classList.remove('is-hidden');
      const breakdownToggle = document.querySelector('.pricing-ui-copy');
      if (breakdownToggle) breakdownToggle.open = false;
    } catch(_) {}
  }
  function buildQuoteTrace(ctx){
    try {
      const cur = ctx.cur || '€';
      const money = (val) => cur + Number(val || 0).toFixed(2);
      const pct = (val) => (Math.round((Number(val || 0) * 100)) + '%');
      const zonePath = Array.isArray(ctx.zonePath) ? ctx.zonePath : [];
      const parts = Array.isArray(ctx.parts) ? ctx.parts : [];
      const legs = Array.isArray(ctx.legs) ? ctx.legs : [];
      const minApplied = !!ctx.minApplied;
      const minTag = minApplied ? ('min→' + money(ctx.minimum)) : 'min:-';

      const flags = [];
      if (ctx.isWeekend) flags.push('Wknd');
      if (ctx.isHoliday) flags.push('Hol');
      if (ctx.afterHours) flags.push('AH');
      const flagText = flags.length ? flags.join(' ') : '-';

      const discount = ctx.discount || null;
      let discText = 'disc:-';
      if (discount && ctx.discountAmount) {
        const type = String(discount.type || '').toLowerCase() || 'unknown';
        const code = String(discount.code || '').trim() || '-';
        const amountLabel = type === 'percent' ? (Number(discount.amount || 0) + '%') : money(discount.amount || 0);
        discText = 'disc:' + code + ':' + type + ':' + amountLabel + ':' + money(ctx.discountAmount);
      }

      const legsText = legs.map(function(_, idx){
        const fromZ = zonePath[idx] != null ? zonePath[idx] : '?';
        const toZ = zonePath[idx + 1] != null ? zonePath[idx + 1] : '?';
        const leg = parts[idx] || {};
        const legPrice = money(leg.price || 0);
        const km = (leg.km != null) ? String(leg.km) : null;
        const eta = (leg.etaMin != null) ? String(leg.etaMin) : null;
        const tail = (km || eta) ? (' (' + (km || '?') + 'km/' + (eta || '?') + 'm)') : '';
        return 'Z' + fromZ + '→Z' + toZ + ' s? m? b?=' + legPrice + tail;
      }).join(';');

      const addressFee = Number(ctx.addressFee || 0) || 0;
      const addressFeeCount = Number(ctx.addressFeeCount || 0) || 0;
      const totalEq = [
        'pz' + ctx.pickupZone + ' perKm=' + Number(ctx.perKm || 0).toFixed(2),
        'basis=max(' + Number(ctx.totalKm || 0).toFixed(2) + ',' + Number(ctx.dropCenterKm || 0).toFixed(2) + ')=' + Number(ctx.distanceBasisKm || 0).toFixed(2),
        'dist=' + money(ctx.distanceTotal),
        'pickup=' + money(ctx.pickupCharge),
        'addr(' + addressFeeCount + ')=' + money(addressFee),
        minTag,
        'cargo=' + pct(ctx.cargoRate) + '/' + money(ctx.cargoAmount),
        'sur=' + pct(ctx.surchargeRate) + '/' + money(ctx.surchargeAmount),
        discText,
        'sub=' + money(ctx.subtotal),
        'surTot=' + money(ctx.surchargeAmount),
        'discTot=' + money(ctx.discountAmount),
        'total=' + money(ctx.total)
      ].join(' ');

      const dateTime = String(ctx.dateKey || '') + ' ' + String(ctx.timeLabel || '');
      const kmEta = Number(ctx.totalKm || 0).toFixed(2) + 'km/' + Math.round(Number(ctx.etaTotalMins || 0)) + 'm';
      return totalEq + ' | legs[' + legsText + '] | ' + dateTime + ' [' + flagText + '] | ' + kmEta;
    } catch(_) {
      return 'Trace unavailable';
    }
  }
  function attachAutocomplete(inputEl){
    try {
      if (!inputEl || !google.maps.places) return;
      // Use classic Places Autocomplete only; avoid experimental PlaceAutocompleteElement
      if (google.maps.places.Autocomplete) {
        const ac = new google.maps.places.Autocomplete(inputEl, {
          types: ['geocode', 'establishment'],
          componentRestrictions: { country: 'es' }
        });
        try {
          const sw = new google.maps.LatLng(41.30, 1.96);
          const ne = new google.maps.LatLng(41.52, 2.30);
          const bcnBounds = new google.maps.LatLngBounds(sw, ne);
          ac.setBounds(bcnBounds);
          ac.setOptions({ strictBounds: true });
        } catch(_) {}
        ac.addListener('place_changed', function(){
          try {
            const place = ac.getPlace();
            const loc = place && place.geometry && place.geometry.location;
            if (loc) {
              inputEl.dataset.lat = String(loc.lat());
              inputEl.dataset.lng = String(loc.lng());
              inputEl.dataset.address = (place.formatted_address || inputEl.value);
              setAddressMarker(inputEl, loc);
              updateAddressMarkers();
              autoEstimateIfReady();
            }
          } catch(_) {}
        });
        return;
      }
    } catch(_) {}
  }
  const enableStopDrag = true;
  // Drag & drop ordering for stop inputs
  function attachStopDragHandlers(el){
    try {
      if (!el) return;
      const input = el.querySelector && el.querySelector('input');
      if (!enableStopDrag) {
        try {
          el.draggable = false;
          if (input) input.draggable = false;
        } catch(_) {}
        return;
      }
      el.draggable = true;
      el.addEventListener('dragstart', function(){
        try { window._draggedStop = el; el.classList.add('dragging'); } catch(_) {}
      });
      el.addEventListener('dragend', function(){
        try { el.classList.remove('dragging'); window._draggedStop = null; } catch(_){ }
      });
      if (input) {
        input.draggable = true;
        input.addEventListener('dragstart', function(){
          try { window._draggedStop = el; el.classList.add('dragging'); } catch(_) {}
        });
        input.addEventListener('dragend', function(){
          try { el.classList.remove('dragging'); window._draggedStop = null; } catch(_){ }
        });
      }
    } catch(_){ }
  }

  function getOrderedInputs(){
    try {
      if (!qStopsWrap) return [];
      return Array.from(qStopsWrap.querySelectorAll('.quote-stop-item'))
        .map(w => w.querySelector('input'))
        .filter(Boolean);
    } catch(_) { return []; }
  }

  function normalizeStopOrder(){
    try {
      if (!qStopsWrap) return;
      const items = Array.from(qStopsWrap.querySelectorAll('.quote-stop-item'));
      if (!items.length) return;
      items.forEach(function(w, idx){
        const role = idx === 0 ? 'pickup' : (idx === items.length - 1 ? 'drop' : 'stop');
        w.dataset.role = role;
        const input = w.querySelector('input');
        if (!input) return;
        const ph = role === 'pickup'
          ? (i18n('quotePickupPlaceholder') || 'Pickup address')
          : role === 'drop'
            ? (i18n('quoteDropoffPlaceholder') || 'Dropoff address')
            : (i18n('quoteStopPlaceholder') || 'Stop address');
        input.placeholder = ph;
        input.setAttribute('aria-label', ph);
        if (role === 'stop') input.classList.add('quote-stop');
        else input.classList.remove('quote-stop');
      });
    } catch(_) {}
  }
  // Create a stop item and return its input element
  function createStopItem(){
    if (!qStopsWrap) return null;
    const w = document.createElement('div');
    w.className = 'quote-stop-item';
    w.draggable = enableStopDrag;
    const h = enableStopDrag ? document.createElement('span') : null;
    if (h) {
      h.className = 'drag-handle';
      h.setAttribute('title', i18n('dragHandleLabel') || 'Drag to reorder');
      h.innerHTML = '<i class="fa fa-bars" aria-hidden="true"></i>';
    }
    const i = document.createElement('input');
    i.type = 'text';
    const ph = i18n('quoteStopPlaceholder') || 'Stop address';
    i.placeholder = ph;
    i.setAttribute('aria-label', ph);
    i.className = 'quote-stop';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'stop-delete';
    del.setAttribute('title', i18n('quoteDeleteStop') || 'Delete stop');
    del.setAttribute('aria-label', i18n('quoteDeleteStop') || 'Delete stop');
    del.textContent = '×';
    del.addEventListener('click', function(){
      try {
        clearAddressMarker(i);
        w.remove();
        normalizeStopOrder();
        if (typeof runEstimate === 'function') runEstimate();
      } catch(_) {}
    });
    if (h) w.appendChild(h);
    w.appendChild(i);
    w.appendChild(del);
    qStopsWrap.appendChild(w);
    attachAutocomplete(i);
    attachStopDragHandlers(w);
    attachAddressInputHandlers(i);
    normalizeStopOrder();
    return i;
  }
  function pickTargetInputForMapClick(){
    const ordered = getOrderedInputs();
    for (let i = 0; i < ordered.length; i++) {
      const val = (ordered[i] && ordered[i].value || '').trim();
      if (!val) return ordered[i];
    }
    return createStopItem();
  }
  function setKnownLocation(inputEl, item){
    try {
      if (!inputEl || !item) return;
      inputEl.value = item.name;
      inputEl.dataset.lat = String(item.lat);
      inputEl.dataset.lng = String(item.lng);
      inputEl.dataset.address = item.name;
      const ll = (google.maps && google.maps.LatLng) ? new google.maps.LatLng(item.lat, item.lng) : { lat: item.lat, lng: item.lng };
      setAddressMarker(inputEl, ll);
      updateAddressMarkers();
      autoEstimateIfReady();
    } catch(_) {}
  }
  // True random Barcelona addresses: random point + reverse geocode
  const RANDOM_BCN_BOUNDS = {
    south: 41.320,
    west: 2.060,
    north: 41.470,
    east: 2.240
  };
  function latLngKey(lat, lng){
    return lat.toFixed(5) + ',' + lng.toFixed(5);
  }
  function randomLatLngInBarcelona(){
    const lat = RANDOM_BCN_BOUNDS.south + (Math.random() * (RANDOM_BCN_BOUNDS.north - RANDOM_BCN_BOUNDS.south));
    const lng = RANDOM_BCN_BOUNDS.west + (Math.random() * (RANDOM_BCN_BOUNDS.east - RANDOM_BCN_BOUNDS.west));
    return (google.maps && google.maps.LatLng) ? new google.maps.LatLng(lat, lng) : { lat, lng };
  }
  function isInServiceLatLng(ll){
    try {
      const z = zoneNumberForLatLng(ll);
      return !!z;
    } catch(_) { return false; }
  }
  async function reverseGeocodeAddress(ll){
    try {
      const resp = await geocoder.geocode({ location: ll });
      if (resp && resp.results && resp.results[0]) return resp.results[0].formatted_address || '';
    } catch(_) {}
    return '';
  }
  async function handleMapClick(ll){
    try {
      if (!ll) return;
      const targetInput = pickTargetInputForMapClick();
      if (!targetInput) return;
      const addr = await reverseGeocodeAddress(ll);
      const lat = (typeof ll.lat === 'function') ? ll.lat() : ll.lat;
      const lng = (typeof ll.lng === 'function') ? ll.lng() : ll.lng;
      const label = addr || ('Dropped pin ' + lat.toFixed(5) + ', ' + lng.toFixed(5));
      targetInput.value = label;
      targetInput.dataset.lat = String(lat);
      targetInput.dataset.lng = String(lng);
      targetInput.dataset.address = label;
      setAddressMarker(targetInput, ll);
      updateAddressMarkers();
      autoEstimateIfReady();
    } catch(_) {}
  }
  async function pickRandomServiceAddress(excludeKeys){
    for (let i = 0; i < 25; i++){
      const ll = randomLatLngInBarcelona();
      if (!isInServiceLatLng(ll)) continue;
      const lat = ll.lat ? ll.lat() : ll.lat;
      const lng = ll.lng ? ll.lng() : ll.lng;
      const key = latLngKey(lat, lng);
      if (excludeKeys && excludeKeys.has(key)) continue;
      const addr = await reverseGeocodeAddress(ll);
      if (!addr) continue;
      return { name: addr, lat, lng };
    }
    return null;
  }
  function collectUsedLocationKeys(){
    const used = new Set();
    const pickupEl = document.getElementById('quotePickup');
    const dropEl = document.getElementById('quoteDropoff');
    [pickupEl, dropEl].forEach(inp => {
      if (!inp || !inp.dataset) return;
      const lat = Number(inp.dataset.lat);
      const lng = Number(inp.dataset.lng);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) used.add(latLngKey(lat, lng));
    });
    if (qStopsWrap) {
      Array.from(qStopsWrap.querySelectorAll('.quote-stop')).forEach(inp => {
        if (!inp || !inp.dataset) return;
        const lat = Number(inp.dataset.lat);
        const lng = Number(inp.dataset.lng);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) used.add(latLngKey(lat, lng));
      });
    }
    return used;
  }
  async function loadRandomScenario(){
    try {
      const pickupEl = document.getElementById('quotePickup');
      const dropEl = document.getElementById('quoteDropoff');
      if (!pickupEl || !dropEl) return;
      // Clear existing stops
      if (qStopsWrap) {
        const items = Array.from(qStopsWrap.querySelectorAll('.quote-stop-item'));
        items.forEach(function(w, idx){
          if (idx !== 0 && idx !== items.length - 1) w.remove();
        });
        normalizeStopOrder();
      }
      const used = collectUsedLocationKeys();
      const recent = Array.isArray(window._recentRandomStops) ? window._recentRandomStops : [];
      recent.forEach(i => used.add(i));
      const pickupItem = await pickRandomServiceAddress(used);
      if (!pickupItem) {
        setQuoteResultWithDebug(i18n('quoteOutsideService') || 'Outside service map — please contact us for a custom quote.', 'Random scenario selection failed to find in-service pickup');
        return;
      }
      used.add(latLngKey(pickupItem.lat, pickupItem.lng));
      const dropItem = await pickRandomServiceAddress(used);
      if (!dropItem) {
        setQuoteResultWithDebug(i18n('quoteOutsideService') || 'Outside service map — please contact us for a custom quote.', 'Random scenario selection failed to find in-service drop');
        return;
      }
      used.add(latLngKey(dropItem.lat, dropItem.lng));
      setKnownLocation(pickupEl, pickupItem);
      setKnownLocation(dropEl, dropItem);
      const stopCount = Math.floor(Math.random() * 4);
      for (let s = 0; s < stopCount; s++){
        const stopItem = await pickRandomServiceAddress(used);
        if (!stopItem) break;
        used.add(latLngKey(stopItem.lat, stopItem.lng));
        const stopInput = createStopItem();
        if (stopInput) setKnownLocation(stopInput, stopItem);
      }
      const nextRecent = recent.concat(Array.from(used));
      while (nextRecent.length > 8) nextRecent.shift();
      window._recentRandomStops = nextRecent;
      try { if (typeof runEstimate === 'function') await runEstimate(); } catch(_){ }
    } catch(_){ }
  }
  function resetBookingFieldsAfterSuccess(){
    try {
      const pickupEl = document.getElementById('quotePickup');
      const dropEl = document.getElementById('quoteDropoff');
      if (pickupEl) { pickupEl.value = ''; clearStoredLocation(pickupEl); }
      if (dropEl) { dropEl.value = ''; clearStoredLocation(dropEl); }
      if (qStopsWrap) {
        Array.from(qStopsWrap.querySelectorAll('.quote-stop-item')).forEach(function(w){
          const role = (w && w.dataset && w.dataset.role) || 'stop';
          if (role === 'stop') w.remove();
        });
      }
      if (qDate) qDate.value = '';
      if (qTime) qTime.value = '';
      if (qOut) qOut.textContent = '';
      if (qRate) qRate.textContent = '';
      window._lastQuoteContext = null;
      clearAllAddressMarkers();
      clearRouteOverlays();
    } catch(_) {}
  }
  function resetEstimator(){
    try {
      const pickupEl = document.getElementById('quotePickup');
      const dropEl = document.getElementById('quoteDropoff');
      if (pickupEl) { pickupEl.value = ''; clearStoredLocation(pickupEl); }
      if (dropEl) { dropEl.value = ''; clearStoredLocation(dropEl); }
      if (qStopsWrap) {
        Array.from(qStopsWrap.querySelectorAll('.quote-stop-item')).forEach(function(w){
          const role = (w && w.dataset && w.dataset.role) || 'stop';
          if (role === 'stop') w.remove();
        });
      }
      // Clear any other estimator inputs (weight, description, toggles)
      const container = document.querySelector('.quote-estimator');
      if (container) {
        Array.from(container.querySelectorAll('input, textarea')).forEach(function(el){
          try {
            if (el.id === 'quotePickup' || el.id === 'quoteDropoff') return;
            if (el.type === 'checkbox' || el.type === 'radio') { el.checked = false; } else { el.value = ''; }
            if (el.dataset) { delete el.dataset.lat; delete el.dataset.lng; delete el.dataset.address; }
          } catch(_) {}
        });
        if (qCargo) qCargo.value = 'regular';
        if (qDiscount) qDiscount.value = DEFAULT_DISCOUNT_CODE;
        activeDiscountCodes = [];
        setDiscountStatus('');
      }
      // Clear outputs and overlays
      if (qOut) qOut.textContent = '';
      const summaryEl = document.getElementById('pricingUiSummary');
      const breakdownEl = document.getElementById('pricingUiBreakdown');
      if (summaryEl) summaryEl.textContent = '';
      if (breakdownEl) breakdownEl.textContent = '';
      const blockEl = document.getElementById('pricingUiBlock');
      if (blockEl) blockEl.classList.add('is-hidden');
      if (qRate) qRate.classList.remove('is-hidden');
      if (qOut) qOut.classList.remove('is-hidden');
      const traceInfo = document.getElementById('quoteTraceInfoIcon');
      if (traceInfo) {
        const infoText = i18n('quoteTraceInfo') || "Submitting a request doesn't charge you automatically, you will receive a payment link once you make your booking.";
        traceInfo.setAttribute('aria-label', infoText);
        traceInfo.setAttribute('title', infoText);
      }
      setBookingStatus('');
      window._lastQuoteContext = null;
      clearAllAddressMarkers();
      clearRouteOverlays();
    } catch(_){}
  }
  if (qLoadRandom) qLoadRandom.addEventListener('click', () => { loadRandomScenario(); });
  if (qRefresh) qRefresh.addEventListener('click', () => { resetEstimator(); });
  // Distance helper (km)
  function haversineKm(a, b){
    try {
      function toCoords(p){
        if (!p) return null;
        if (typeof p.lat === 'function' && typeof p.lng === 'function') return { lat: p.lat(), lng: p.lng() };
        if (typeof p.lat === 'number' && typeof p.lng === 'number') return { lat: p.lat, lng: p.lng };
        if (p.lat != null && p.lng != null) return { lat: Number(p.lat), lng: Number(p.lng) };
        return null;
      }
      const p1 = toCoords(a); const p2 = toCoords(b);
      if (!p1 || !p2) return 0;
      const R = 6371; // km
      const dLat = (p2.lat - p1.lat) * Math.PI/180;
      const dLng = (p2.lng - p1.lng) * Math.PI/180;
      const s1 = Math.sin(dLat/2), s2 = Math.sin(dLng/2);
      const aa = s1*s1 + Math.cos(p1.lat*Math.PI/180) * Math.cos(p2.lat*Math.PI/180) * s2*s2;
      const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1-aa));
      return R * c;
    } catch(_) { return 0; }
  }
  // Optimize stops order for cheapest route (distance-based)
  async function optimizeStopsOrder(){
    try {
      const pickupEl = document.getElementById('quotePickup');
      const dropEl = document.getElementById('quoteDropoff');
      const pickupQ = (pickupEl && pickupEl.value || '').trim();
      const dropQ = (dropEl && dropEl.value || '').trim();
      const pickupLoc = pickupEl ? (getLocationForInput(pickupEl) || await geocodeOne(pickupQ)) : null;
      const dropLoc = dropEl ? (getLocationForInput(dropEl) || await geocodeOne(dropQ)) : null;
      if (!pickupLoc || !dropLoc) return;
      const stopItems = qStopsWrap ? Array.from(qStopsWrap.querySelectorAll('.quote-stop-item')).filter(w => ((w && w.dataset && w.dataset.role) || 'stop') === 'stop') : [];
      const stops = [];
      for (let i = 0; i < stopItems.length; i++){
        const el = stopItems[i].querySelector && stopItems[i].querySelector('.quote-stop');
        const val = (el && el.value || '').trim();
        if (!val) continue;
        const loc = getLocationForInput(el) || await geocodeOne(val);
        if (loc) stops.push({ w: stopItems[i], el, loc });
      }
      if (stops.length <= 1) return;
      function metrics(order){
        const detour = 1.25;
        let prev = pickupLoc; let meters = 0;
        for (let i = 0; i < order.length; i++){
          const km = haversineKm(prev, order[i].loc) * detour;
          meters += km * 1000;
          prev = order[i].loc;
        }
        const kmLast = haversineKm(prev, dropLoc) * detour;
        meters += kmLast * 1000;
        return meters;
      }
      function permute(arr){
        const res = [];
        function backtrack(path, used){
          if (path.length === arr.length) { res.push(path.slice()); return; }
          for (let i = 0; i < arr.length; i++){
            if (used[i]) continue;
            used[i] = true; path.push(arr[i]);
            backtrack(path, used);
            path.pop(); used[i] = false;
          }
        }
        backtrack([], Array(arr.length).fill(false));
        return res;
      }
      let best = null; let bestScore = Number.POSITIVE_INFINITY;
      const MAX_BRUTE = 7;
      if (stops.length <= MAX_BRUTE) {
        const perms = permute(stops);
        for (let p = 0; p < perms.length; p++){
          const s = metrics(perms[p]);
          if (s < bestScore) { bestScore = s; best = perms[p]; }
        }
      } else {
        // Heuristic: nearest-neighbor then 2-opt
        const remaining = stops.slice();
        const route = [];
        let current = pickupLoc;
        while (remaining.length) {
          let bestIdx = 0; let bestDist = Number.POSITIVE_INFINITY;
          for (let i = 0; i < remaining.length; i++){
            const d = haversineKm(current, remaining[i].loc);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
          }
          const next = remaining.splice(bestIdx, 1)[0];
          route.push(next);
          current = next.loc;
        }
        // 2-opt improvement
        let improved = true; let rBest = route; let sBest = metrics(rBest);
        while (improved){
          improved = false;
          for (let i = 0; i < rBest.length - 1; i++){
            for (let j = i+1; j < rBest.length; j++){
              const cand = rBest.slice(0, i).concat(rBest.slice(i, j+1).reverse()).concat(rBest.slice(j+1));
              const s = metrics(cand);
              if (s < sBest) { rBest = cand; sBest = s; improved = true; }
            }
          }
        }
        best = rBest;
      }
      if (!best || !best.length) return;
      // Reorder DOM: insert each best stop before drop wrapper
      const dropWrap = qStopsWrap.querySelector('[data-role="drop"]') || null;
      for (let k = 0; k < best.length; k++){
        const src = best[k].w;
        if (src && dropWrap) qStopsWrap.insertBefore(src, dropWrap);
      }
      try { if (typeof runEstimate === 'function') await runEstimate(); } catch(_){ }
    } catch(_){ }
  }
  if (qOptimize) { qOptimize.addEventListener('click', optimizeStopsOrder); }
  function getStopAfter(container, y){
    try {
      const stops = Array.from(container.querySelectorAll('.quote-stop-item:not(.dragging)'));
      let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
      for (let i = 0; i < stops.length; i++){
        const box = stops[i].getBoundingClientRect();
        const offset = y - (box.top + box.height/2);
        if (offset < 0 && offset > closest.offset) closest = { offset, element: stops[i] };
      }
      return closest.element;
    } catch(_) { return null; }
  }
  if (qStopsWrap && enableStopDrag) {
    qStopsWrap.addEventListener('dragover', function(e){
      e.preventDefault();
      try {
        const after = getStopAfter(qStopsWrap, e.clientY);
        const dragged = window._draggedStop;
        if (!dragged) return;
        if (after == null) qStopsWrap.appendChild(dragged); else qStopsWrap.insertBefore(dragged, after);
      } catch(_){}
    });
    qStopsWrap.addEventListener('drop', async function(){
      try { normalizeStopOrder(); } catch(_) {}
      // Recompute after reorder
      try { if (typeof runEstimate === 'function') await runEstimate(); } catch(_){}
    });
  }
  function getLocationForInput(inputEl){
    try {
      if (inputEl && inputEl.dataset && inputEl.dataset.lat && inputEl.dataset.lng){
        const val = String((inputEl.value || '')).trim();
        const addr = String((inputEl.dataset.address || '')).trim();
        // If the stored address does not match the current input text, ignore cached coords and force geocode
        if (addr && val && addr !== val) return null;
        return new google.maps.LatLng(Number(inputEl.dataset.lat), Number(inputEl.dataset.lng));
      }
      return null;
    } catch(_) { return null; }
  }
  function countReadyLocations(){
    try {
      const inputs = collectAddressInputs();
      let count = 0;
      inputs.forEach(function(el){ if (getLocationForInput(el)) count++; });
      return count;
    } catch(_) { return 0; }
  }
  function updateAddressMarkers(){
    try {
      const inputs = collectAddressInputs();
      const ready = inputs.filter(function(el){ return !!getLocationForInput(el); });
      const keep = new Set(ready);
      addressMarkers.forEach(function(marker, el){
        if (!keep.has(el)) { try { marker.setMap(null); } catch(_){} addressMarkers.delete(el); }
      });
      ready.forEach(function(el){
        const loc = getLocationForInput(el);
        if (loc) setAddressMarker(el, loc);
      });
      if (ready.length === 1) {
        try { map.panTo(getLocationForInput(ready[0])); } catch(_){}
      }
    } catch(_) {}
  }
  function hasReadyPickupDrop(){
    const ordered = getOrderedInputs();
    if (ordered.length < 2) return false;
    return !!(getLocationForInput(ordered[0]) && getLocationForInput(ordered[ordered.length - 1]));
  }
  function autoEstimateIfReady(){
    try {
      updateAddressMarkers();
      const readyCount = countReadyLocations();
      if (readyCount >= 2 && hasReadyPickupDrop()) {
        if (window._quoteAutoTimer) clearTimeout(window._quoteAutoTimer);
        window._quoteAutoTimer = setTimeout(function(){
          try { runEstimate(); } catch(_){}
        }, 80);
      }
    } catch(_) {}
  }
  // attach autocomplete to primary inputs
  attachAutocomplete(qPickup);
  attachAutocomplete(qDrop);
  attachAddressInputHandlers(qPickup);
  attachAddressInputHandlers(qDrop);
  // Include pickup and drop as draggable items within the stops list
  (function ensurePrimaryInStops(){
    try {
      if (!qStopsWrap) return;
      function wrapIfNeeded(inputEl, role){
        if (!inputEl) return;
        var parent = inputEl.parentElement;
        var alreadyWrapped = parent && parent.classList && parent.classList.contains('quote-stop-item');
        if (alreadyWrapped) {
          parent.dataset.role = role;
          attachStopDragHandlers(parent);
          if (!enableStopDrag) {
            const existingHandle = parent.querySelector('.drag-handle');
            if (existingHandle) existingHandle.remove();
          }
          if (!parent.querySelector('.stop-delete')) {
            const delExisting = document.createElement('button');
            delExisting.type = 'button';
            delExisting.className = 'stop-delete';
            delExisting.setAttribute('title', i18n('quoteDeleteStop') || 'Delete stop');
            delExisting.setAttribute('aria-label', i18n('quoteDeleteStop') || 'Delete stop');
            delExisting.textContent = '×';
            delExisting.addEventListener('click', function(){
              try {
                inputEl.value = '';
                clearStoredLocation(inputEl);
                normalizeStopOrder();
                if (typeof runEstimate === 'function') runEstimate();
              } catch(_) {}
            });
            parent.appendChild(delExisting);
          }
          return;
        }
        var w = document.createElement('div');
        w.className = 'quote-stop-item';
        w.draggable = enableStopDrag;
        w.dataset.role = role;
        var h = enableStopDrag ? document.createElement('span') : null;
        if (h) {
          h.className = 'drag-handle';
          h.setAttribute('title', i18n('dragHandleLabel') || 'Drag to reorder');
          h.innerHTML = '<i class="fa fa-bars" aria-hidden="true"></i>';
        }
        if (inputEl.parentElement) inputEl.parentElement.insertBefore(w, inputEl);
        if (h) w.appendChild(h);
        w.appendChild(inputEl);
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'stop-delete';
        del.setAttribute('title', i18n('quoteDeleteStop') || 'Delete stop');
        del.setAttribute('aria-label', i18n('quoteDeleteStop') || 'Delete stop');
        del.textContent = '×';
        del.addEventListener('click', function(){
          try {
            inputEl.value = '';
            clearStoredLocation(inputEl);
            if (typeof runEstimate === 'function') runEstimate();
          } catch(_) {}
        });
        w.appendChild(del);
        if (role === 'pickup') {
          qStopsWrap.insertBefore(w, qStopsWrap.firstChild);
        } else {
          qStopsWrap.appendChild(w);
        }
        attachStopDragHandlers(w);
      }
      wrapIfNeeded(qPickup, 'pickup');
      wrapIfNeeded(qDrop, 'drop');
      normalizeStopOrder();
    } catch(_) {}
  })();
  // Allow clicking the map to add a pinpoint and fill the next field
  try {
    map.addListener('click', function(e){
      try {
        const ll = e && e.latLng;
        if (!ll) return;
        handleMapClick(ll);
      } catch(_) {}
    });
  } catch(_) {}
  if (qAddStop && qStopsWrap) {
    qAddStop.addEventListener('click', function(){
      const w = document.createElement('div');
      w.className = 'quote-stop-item';
      w.draggable = enableStopDrag;
      const h = enableStopDrag ? document.createElement('span') : null;
      if (h) {
        h.className = 'drag-handle';
        h.setAttribute('title', i18n('dragHandleLabel') || 'Drag to reorder');
        h.innerHTML = '<i class="fa fa-bars" aria-hidden="true"></i>';
      }
      const i = document.createElement('input');
      i.type = 'text';
      const ph = i18n('quoteStopPlaceholder') || 'Stop address';
      i.placeholder = ph;
      i.setAttribute('aria-label', ph);
      i.className = 'quote-stop';
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'stop-delete';
      del.setAttribute('title', i18n('quoteDeleteStop') || 'Delete stop');
      del.setAttribute('aria-label', i18n('quoteDeleteStop') || 'Delete stop');
      del.textContent = '×';
      del.addEventListener('click', function(){
        try { clearAddressMarker(i); w.remove(); if (typeof runEstimate === 'function') runEstimate(); } catch(_) {}
      });
      if (h) w.appendChild(h);
      w.appendChild(i);
      w.appendChild(del);
      qStopsWrap.appendChild(w);
      attachAutocomplete(i);
      attachStopDragHandlers(w);
      attachAddressInputHandlers(i);
    });
  }
  // Wrap and attach drag handlers to any pre-existing stop inputs
  if (qStopsWrap) {
    Array.from(qStopsWrap.querySelectorAll('.quote-stop')).forEach(function(i){
      try {
        if (i.parentElement && i.parentElement.classList && i.parentElement.classList.contains('quote-stop-item')) {
          if (!enableStopDrag) {
            const existingHandle = i.parentElement.querySelector('.drag-handle');
            if (existingHandle) existingHandle.remove();
          } else if (!i.parentElement.querySelector('.drag-handle')) {
            const h = document.createElement('span');
            h.className = 'drag-handle';
            h.setAttribute('title', i18n('dragHandleLabel') || 'Drag to reorder');
            h.innerHTML = '<i class="fa fa-bars" aria-hidden="true"></i>';
            i.parentElement.insertBefore(h, i);
          }
          if (!i.parentElement.querySelector('.stop-delete')) {
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'stop-delete';
            del.setAttribute('title', i18n('quoteDeleteStop') || 'Delete stop');
            del.setAttribute('aria-label', i18n('quoteDeleteStop') || 'Delete stop');
            del.textContent = '×';
            del.addEventListener('click', function(){
              try { clearAddressMarker(i); i.parentElement.remove(); if (typeof runEstimate === 'function') runEstimate(); } catch(_) {}
            });
            i.parentElement.appendChild(del);
          }
          if (!i.parentElement.dataset.role) i.parentElement.dataset.role = 'stop';
          attachStopDragHandlers(i.parentElement);
          attachAddressInputHandlers(i);
        } else {
          const w = document.createElement('div');
          w.className = 'quote-stop-item';
          w.draggable = enableStopDrag;
          const h = enableStopDrag ? document.createElement('span') : null;
          if (h) {
            h.className = 'drag-handle';
            h.setAttribute('title', i18n('dragHandleLabel') || 'Drag to reorder');
            h.innerHTML = '<i class="fa fa-bars" aria-hidden="true"></i>';
          }
          i.parentElement ? i.parentElement.insertBefore(w, i) : qStopsWrap.appendChild(w);
          if (h) w.appendChild(h);
          w.appendChild(i);
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'stop-delete';
          del.setAttribute('title', i18n('quoteDeleteStop') || 'Delete stop');
          del.setAttribute('aria-label', i18n('quoteDeleteStop') || 'Delete stop');
          del.textContent = '×';
          del.addEventListener('click', function(){
            try { clearAddressMarker(i); w.remove(); if (typeof runEstimate === 'function') runEstimate(); } catch(_) {}
          });
          w.appendChild(del);
          w.dataset.role = 'stop';
          attachStopDragHandlers(w);
          attachAddressInputHandlers(i);
        }
      } catch(_){}
    });
  }
  // Swap button removed; pickup/drop are now draggable and ordered in the list
  function latLngToObj(ll){
    try {
      if (!ll) return null;
      if (typeof ll.lat === 'function' && typeof ll.lng === 'function') return { lat: ll.lat(), lng: ll.lng() };
      if (typeof ll.lat === 'number' && typeof ll.lng === 'number') return { lat: ll.lat, lng: ll.lng };
      return null;
    } catch(_) { return null; }
  }
  function addressLabelForInput(inputEl){
    try {
      if (!inputEl) return '';
      return String((inputEl.dataset && inputEl.dataset.address) || inputEl.value || '').trim();
    } catch(_) { return ''; }
  }
  function buildBookingPayload(){
    const ctx = window._lastQuoteContext || null;
    if (!ctx) return { error: i18n('quoteEstimateFirst') || 'Please calculate a quote first.' };
    try { defaultDateTimeInputs(); } catch(_) {}
    const name = String((qName && qName.value) || '').trim();
    const email = String((qEmail && qEmail.value) || '').trim();
    const phone = String((qPhone && qPhone.value) || '').trim();
    const notes = String((qNotes && qNotes.value) || '').trim();
    const updatesPreference = String((qUpdates && qUpdates.value) || '').trim();
    const consent = !!(qConsent && qConsent.checked);
    if (!name) return { error: 'Please enter your name.' };
    if (!email && !phone) return { error: 'Please add an email or phone number.' };
    if (!consent) return { error: 'Please confirm you agree to be contacted.' };
    const dateVal = (qDate && qDate.value) ? String(qDate.value) : '';
    const timeVal = (qTime && qTime.value) ? String(qTime.value) : '';
    if (!dateVal || !timeVal) return { error: 'Please choose a date and time.' };
    const mergedQuote = Object.assign({}, ctx, {
      schedule: { date: dateVal, time: timeVal }
    });
    return {
      customer: { name, email, phone },
      notes,
      updatesPreference,
      language: document.documentElement.lang || 'en',
      sourceUrl: location.href,
      quote: mergedQuote
    };
  }
  function buildTrackingUrlFromRef(ref){
    try {
      if (!ref) return '';
      const origin = (location.origin && location.origin !== 'null') ? location.origin : '';
      if (origin) return origin.replace(/\/$/, '') + '/tracking.html?ref=' + encodeURIComponent(ref);
      const clean = location.href.replace(/[#?].*$/, '');
      const base = clean.replace(/\/[a-zA-Z0-9._-]+$/, '');
      return base.replace(/\/$/, '') + '/tracking.html?ref=' + encodeURIComponent(ref);
    } catch(_) {
      return '';
    }
  }
  async function submitBooking(){
    try {
      if (!BOOKING_API_BASE) {
        setBookingStatus('Booking is not configured yet.', true);
        return;
      }
      const payload = buildBookingPayload();
      if (payload.error) {
        setBookingStatus(payload.error, true);
        return;
      }
      const base = BOOKING_API_BASE.replace(/\/$/, '');
      if (qSubmit) qSubmit.disabled = true;
      setBookingStatus('Sending booking request...');
      const form = new URLSearchParams();
      form.set('payload', JSON.stringify(payload));
      const res = await fetch(base, {
        method: 'POST',
        body: form
      });
      if (!res.ok) {
        throw new Error('Booking request failed');
      }
      const json = await res.json();
      if (json && json.error) {
        setBookingStatus(json.error, true);
        return;
      }
      const ref = (json && (json.reference || json.id)) ? String(json.reference || json.id) : '';
      const hasPay = !!(json && json.paymentUrl);
      const paymentUrl = json && json.paymentUrl ? String(json.paymentUrl) : '';
      const whatsappUrl = json && json.whatsappUrl ? String(json.whatsappUrl) : '';
      const trackingUrl = json && json.trackingUrl ? String(json.trackingUrl) : (ref ? buildTrackingUrlFromRef(ref) : '');
      const paymentError = json && json.paymentError ? String(json.paymentError) : '';
      const mail = json && json.mail ? json.mail : null;
      let mailNote = '';
      if (mail && mail.clientSent === false) mailNote = ' Email could not be sent.';
      const parts = [];
      const requestReceived = i18n('bookingRequestReceived') || 'Request received - I\'ll take it from here.';
      const refLine = ref ? (i18n('bookingRefLabel', { ref }) || ('Ref: ' + ref)) : '';
      const payHere = i18n('bookingPayHere') || 'Pay here: ';
      const trackHere = i18n('bookingTrackHere') || 'Track it here: ';
      const paymentLabel = i18n('bookingPaymentLink') || 'Payment link';
      const trackingLabel = i18n('bookingTrackingLink') || 'Tracking link';
      const whatsappLabel = i18n('bookingWhatsAppMe') || 'WhatsApp me';
      const helpNote = i18n('bookingHelpNote') || ' if you need anything :)';

      parts.push(requestReceived);
      parts.push(document.createElement('br'));
      parts.push(document.createElement('br'));
      if (refLine) {
        parts.push(refLine);
        parts.push(document.createElement('br'));
      }
      if (hasPay && paymentUrl) {
        parts.push(payHere);
        parts.push(buildStatusLink(paymentUrl, paymentLabel));
        parts.push(document.createElement('br'));
      } else if (paymentError) {
        parts.push(String(paymentError || 'Payment link could not be created.'));
        parts.push(document.createElement('br'));
      }
      if (trackingUrl) {
        parts.push(trackHere);
        parts.push(buildStatusLink(trackingUrl, trackingLabel));
        parts.push(document.createElement('br'));
      }
      if (whatsappUrl) {
        parts.push(buildStatusLink(whatsappUrl, whatsappLabel));
        parts.push(document.createTextNode(helpNote));
      }
      if (mailNote) parts.push(mailNote);
      setBookingStatusHtml(parts);
      resetBookingFieldsAfterSuccess();
    } catch(e) {
      setBookingStatus('Could not send booking request. Please try again.', true);
    } finally {
      if (qSubmit) qSubmit.disabled = false;
    }
  }
  let estimateSeq = 0;
  function invalidateEstimate(){ estimateSeq++; }
  async function runEstimate(){
    const seq = ++estimateSeq;
    const orderedInputs = getOrderedInputs();
    if (orderedInputs.length < 2) { if (qOut) qOut.textContent = i18n('quoteEnterBoth') || 'Enter pickup and dropoff'; return; }
    const pickupEl = orderedInputs[0];
    const dropEl = orderedInputs[orderedInputs.length - 1];
    const stopInputs = orderedInputs.slice(1, -1);
    const pickupQ = (pickupEl && pickupEl.value || '').trim();
    const dropQ = (dropEl && dropEl.value || '').trim();
    if (!pickupQ || !dropQ) { if (qOut) qOut.textContent = i18n('quoteEnterBoth') || 'Enter pickup and dropoff'; return; }
    try {
      const origin = getZoneCenterLatLng('1');
      const pickupLoc = getLocationForInput(pickupEl) || await geocodeOne(pickupQ);
      if (seq !== estimateSeq) return;
      const dropLoc = getLocationForInput(dropEl) || await geocodeOne(dropQ);
      if (seq !== estimateSeq) return;
      const stopLocs = [];
      const stopAddrs = [];
      for (let idx = 0; idx < stopInputs.length; idx++){
        const el = stopInputs[idx];
        const val = (el && el.value || '').trim();
        if (!val) continue;
        const loc = getLocationForInput(el) || await geocodeOne(val);
        if (seq !== estimateSeq) return;
        if (loc) { stopLocs.push(loc); stopAddrs.push((el && el.dataset && el.dataset.address) || val); }
      }
      if (!pickupLoc || !dropLoc) { if (qOut) qOut.textContent = i18n('quoteAddressNotFound') || 'Address not found'; return; }
      // Out-of-service validation: any point without a zone should block estimation
      const pickupZoneNum = zoneNumberForLatLng(pickupLoc);
      const dropZoneNum = zoneNumberForLatLng(dropLoc);
      const stopZoneNums = stopLocs.map(z => zoneNumberForLatLng(z));
      const outsidePoints = [];
      if (!pickupZoneNum) outsidePoints.push((pickupEl && pickupEl.dataset && pickupEl.dataset.address) || pickupQ || 'Pickup');
      for (let i = 0; i < stopZoneNums.length; i++) { if (!stopZoneNums[i]) outsidePoints.push(stopAddrs[i] || ('Stop ' + (i+1))); }
      if (!dropZoneNum) outsidePoints.push((dropEl && dropEl.dataset && dropEl.dataset.address) || dropQ || 'Dropoff');
      if (outsidePoints.length) {
        clearRouteOverlays();
        const msg = i18n('quoteOutsideService') || 'Outside service map — please contact us for a custom quote.';
        const dbg = 'Out of service: ' + outsidePoints.join(', ');
        setQuoteResultWithDebug(msg, dbg);
        setBreakdownLines(['Stops outside service area: ' + outsidePoints.join(' · ')]);
        return;
      }
      const routeDetails = await computeRouteDetails(origin, [pickupLoc].concat(stopLocs), dropLoc);
      if (seq !== estimateSeq) return;
      // Render route overlays on map
      renderRoute(pickupLoc, stopLocs, dropLoc, routeDetails);
      // Combined pricing: distance dominates + pickup zone base charge
      const cur = window._currencySymbol || '€';
      const dp = window._distancePricing || {};
      const pickupZone = String(pickupZoneNum || '');
      const perKmMap = dp && dp.perKm;
      let perKm = 0;
      if (perKmMap && typeof perKmMap === 'object') {
        perKm = Number(perKmMap[pickupZone]) || 0;
      } else {
        perKm = Number(perKmMap) || 0;
      }
      const minimum = Number(dp && dp.minimum) || 0;
      if (!perKm || perKm <= 0) perKm = 1.5;
      // Exclude approach leg (Base → Pickup) from distance pricing
      const legs = (routeDetails.legs || []).slice(1);
      let totalMeters = 0;
      const parts = [];
      // Build human leg labels using pickup/stops/drop order
      const pointLabels = [];
      (function(){
        const s = i18n('quoteEtaLabelApproach') || 'Base → Pickup';
        const arrow = s.indexOf('→') >= 0 ? '→' : (s.indexOf('>') >= 0 ? '>' : null);
        const pickupLabel = arrow ? s.split(arrow).pop().trim() : 'Pickup';
        pointLabels.push(pickupLabel);
        for (let i = 0; i < stopInputs.length; i++) pointLabels.push(i18n('quoteEtaLabelStop', { n: (i+1) }) || ('Stop ' + (i+1)));
        pointLabels.push(i18n('quoteEtaLabelDropoff') || 'Dropoff');
      })();
      for (let i = 0; i < legs.length; i++) {
        const m = Number(legs[i].meters || 0) || 0;
        totalMeters += m;
        const km = Math.round((m/1000) * 100) / 100;
        const price = Math.round((km * perKm) * 100) / 100;
        const fromLabel = pointLabels[i] || ('Leg ' + (i+1));
        const toLabel = pointLabels[i+1] || '';
        const legEtaMin = Math.round((Number(legs[i].sec||0)||0) / 60);
        const line = {
          from: fromLabel,
          to: toLabel,
          km: km,
          price: price,
          etaMin: legEtaMin
        };
        parts.push(line);
      }
      const totalKm = Math.round((totalMeters/1000) * 100) / 100;
      const dropCenterKm = Math.round(haversineKm(origin, dropLoc) * 100) / 100;
      const distanceBasisKm = Math.max(totalKm, dropCenterKm);
      let distanceTotal = Math.round((distanceBasisKm * perKm) * 100) / 100;
      // Pickup zone full base charge
      const base = basePriceForZone(pickupZone);
      const pickupCharge = Math.round((base) * 100) / 100;
      const addressFeePer = 1.5;
      const addressFeeCount = stopLocs.length + 1; // dropoff + stops (exclude pickup)
      const addressFee = Math.round((addressFeePer * addressFeeCount) * 100) / 100;
      const preMinSubtotal = Math.round((distanceTotal + pickupCharge + addressFee) * 100) / 100;
      let subtotal = Math.round((distanceTotal + pickupCharge + addressFee) * 100) / 100;
      if (minimum && subtotal < minimum) subtotal = minimum;
      const cargoInfo = getCargoAdjustment();
      const cargoAmount = Math.round((subtotal * (cargoInfo.rate || 0)) * 100) / 100;
      subtotal = Math.round((subtotal + cargoAmount) * 100) / 100;
      const surchargeInfo = computeSurchargeInfo();
      const surchargeAmount = Math.round((subtotal * (surchargeInfo.rate || 0)) * 100) / 100;
      const weekendSurchargeAmount = Math.round((subtotal * (surchargeInfo.isWeekendHoliday ? surchargeInfo.weekendRate : 0)) * 100) / 100;
      const afterHoursSurchargeAmount = Math.round((subtotal * (surchargeInfo.afterHours ? surchargeInfo.afterRate : 0)) * 100) / 100;
      let total = Math.round((subtotal + surchargeAmount) * 100) / 100;
      const totalBeforeDiscount = total;
      const discountInfo = resolveDiscountsForEstimate(totalBeforeDiscount, surchargeInfo.dateKey, cur);
      const discountAmount = Math.round((discountInfo.totalDiscount || 0) * 100) / 100;
      const discountItems = Array.isArray(discountInfo.applied) ? discountInfo.applied : [];
      if (discountAmount) total = Math.max(0, Math.round((totalBeforeDiscount - discountAmount) * 100) / 100);
      const travelSecsAfterPickup = legs.reduce((a, l) => a + (Number(l.sec||0)||0), 0);
      const travelMins = Math.round(travelSecsAfterPickup / 60);
      const serviceMins = 5 + (3 * (stopInputs.length + 1));
      const etaTotalMins = travelMins + serviceMins;
      const info = 'Mode=distance · perKm=' + perKm.toFixed(2) + ' (pickup zone ' + pickupZone + ')' + (cargoInfo.rate ? (' · cargo ' + Math.round(cargoInfo.rate * 100) + '%') : '') + (surchargeInfo.rate ? (' · surcharge ' + Math.round(surchargeInfo.rate * 100) + '%') : '') + (discountAmount ? (' · discount ' + cur + discountAmount.toFixed(2)) : '');
      const discountNote = discountAmount ? (i18n('quoteSummaryDiscountNote') || ' (discount applied)') : '';
      const summary = i18n('quoteSummaryDistance', {
        currency: cur,
        total: total.toFixed(2),
        km: totalKm.toFixed(2),
        mins: etaTotalMins,
        discountNote
      }) || ('Order totals: ' + cur + total.toFixed(2) + ' / ' + totalKm.toFixed(2) + ' km / ' + etaTotalMins + ' min' + discountNote);
      const eurPerHour = etaTotalMins > 0 ? (total / (etaTotalMins / 60)) : 0;
      const eurPerHourHeadline = i18n('quoteEurPerHourHeadline', { currency: cur, rate: eurPerHour.toFixed(2) }) || ('EUR/h: ' + cur + eurPerHour.toFixed(2));
      if (qRate) { qRate.textContent = ''; qRate.classList.add('is-hidden'); }
      if (qOut) { qOut.textContent = ''; qOut.classList.add('is-hidden'); }
      const zonePath = [pickupZoneNum].concat(stopZoneNums).concat([dropZoneNum]);
      const trace = buildQuoteTrace({
        cur,
        pickupZone: pickupZone,
        perKm,
        totalKm,
        dropCenterKm,
        distanceBasisKm,
        distanceTotal,
        pickupCharge,
        addressFee,
        addressFeePer,
        addressFeeCount,
        minimum,
        minApplied: (minimum && preMinSubtotal < minimum),
        cargoRate: cargoInfo.rate || 0,
        cargoAmount,
        surchargeRate: surchargeInfo.rate || 0,
        surchargeAmount,
        discounts: discountItems,
        discountTotal: discountAmount,
        subtotal,
        total,
        parts,
        legs,
        zonePath,
        dateKey: surchargeInfo.dateKey,
        timeLabel: surchargeInfo.timeLabel,
        isWeekend: surchargeInfo.isWeekend,
        isHoliday: surchargeInfo.isHoliday,
        afterHours: surchargeInfo.afterHours,
        etaTotalMins
      });
      setPricingUiCopy({
        cur,
        total,
        totalKm,
        etaTotalMins,
        dropCount: stopInputs.length + 1,
        pickupZone,
        dropZone: dropZoneNum,
        pickupCharge,
        distanceTotal,
        addressFee,
        addressFeePer,
        addressFeeCount,
        cargoKey: cargoInfo.key,
        cargoAmount,
        surchargeRate: surchargeInfo.rate || 0,
        surchargeAmount,
        weekendSurchargeAmount,
        afterHoursSurchargeAmount,
        isWeekendHoliday: surchargeInfo.isWeekendHoliday,
        afterHours: surchargeInfo.afterHours,
        discountAmount,
        discountItems,
        discountTotal: discountAmount
      });
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      const recalculated = i18n('quoteRecalculatedAt', { time: (hh + ':' + mm + ':' + ss) }) || ('Recalculated at ' + hh + ':' + mm + ':' + ss);
      const traceInfo = document.getElementById('quoteTraceInfoIcon');
      if (traceInfo) {
        const infoText = i18n('quoteTraceInfo') || "Submitting a request doesn't charge you automatically, you will receive a payment link once you make your booking.";
        traceInfo.setAttribute('aria-label', infoText);
        traceInfo.setAttribute('title', infoText);
      }
      window._lastQuoteContext = {
        createdAt: new Date().toISOString(),
        currency: cur,
        total: total,
        subtotal: subtotal,
        totalKm: totalKm,
        etaMins: etaTotalMins,
        pickupZone: pickupZoneNum,
        dropZone: dropZoneNum,
        cargoKey: cargoInfo.key,
        discountCodes: activeDiscountCodes.slice(),
        discountTotal: discountAmount,
        surchargeRate: surchargeInfo.rate,
        isWeekendHoliday: surchargeInfo.isWeekendHoliday,
        afterHours: surchargeInfo.afterHours,
        dateKey: surchargeInfo.dateKey,
        timeLabel: surchargeInfo.timeLabel,
        schedule: {
          date: (qDate && qDate.value) ? String(qDate.value) : '',
          time: (qTime && qTime.value) ? String(qTime.value) : ''
        },
        route: {
          pickup: {
            address: addressLabelForInput(pickupEl) || pickupQ,
            latLng: latLngToObj(pickupLoc),
            zone: pickupZoneNum
          },
          stops: stopInputs.map(function(el, idx){
            return {
              address: stopAddrs[idx] || addressLabelForInput(el),
              latLng: latLngToObj(stopLocs[idx]),
              zone: stopZoneNums[idx] || ''
            };
          }),
          dropoff: {
            address: addressLabelForInput(dropEl) || dropQ,
            latLng: latLngToObj(dropLoc),
            zone: dropZoneNum
          }
        },
        pricing: {
          pickupCharge: pickupCharge,
          distanceTotal: distanceTotal,
          addressFee: addressFee,
          surchargeAmount: surchargeAmount,
          discountAmount: discountAmount
        }
      };
      return;
    } catch(e){
      if (qOut) {
        qOut.classList.remove('is-hidden');
        setQuoteResultWithDebug(i18n('quoteCouldNotEstimate') || 'Could not estimate route — please check addresses and try again.', 'Error');
      }
    }
  }
  // Trigger computation
  if (qEstimate) { qEstimate.addEventListener('click', runEstimate); }
  if (qSubmit) { qSubmit.addEventListener('click', submitBooking); }
  

  if (editMode && google.maps.drawing) {
    // Storage for locally drawn polygons in the editor
    let drawnPolygons = [];

    // Reveal admin buttons
    if (editBtn) editBtn.style.display = 'inline-block';
    if (exportBtn) exportBtn.style.display = 'inline-block';

    const drawingManager = new google.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: false,
      polygonOptions: {
        strokeColor: '#6b2ca9', strokeWeight: 2, strokeOpacity: 0.9,
        fillColor: '#ff6fa1', fillOpacity: 0.25,
        editable: true
      }
    });
    drawingManager.setMap(map);

    if (editBtn) {
      editBtn.addEventListener('click', () => {
        try {
          // Clear previously loaded zones from the data layer
          const toRemove = [];
          data.forEach(f => toRemove.push(f));
          toRemove.forEach(f => data.remove(f));
          zonesFeatures = [];
          if (hoverInfo) hoverInfo.close();
          infoWindow && infoWindow.close();
        } catch(_) {}
        drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
      });
    }
    if (exportBtn) {
      exportBtn.addEventListener('click', exportZones);
    }

    google.maps.event.addListener(drawingManager, 'polygoncomplete', (polygon) => {
      drawingManager.setDrawingMode(null);
      const name = window.prompt('Zone name?');
      const color = colorForName(name) || palette[(drawnPolygons.length) % palette.length];
      polygon.setOptions({ strokeColor: color, fillColor: color });
      drawnPolygons.push({ name, color, polygon });
      // Adjust vertices manually if needed; snapping removed
    });

    // Editor API: allow importing GeoJSON and re-exporting
    function exportZones(){
      try {
        const features = [];
        for (let i = 0; i < drawnPolygons.length; i++){
          const item = drawnPolygons[i] || {};
          const polygon = item.polygon;
          if (!polygon || typeof polygon.getPaths !== 'function') continue;
          const rings = polygon.getPaths().getArray().map(function(path){
            return path.getArray().map(function(ll){ return [ll.lng(), ll.lat()]; });
          });
          if (!rings.length) continue;
          features.push({
            type: 'Feature',
            properties: { name: item.name || 'Zone', color: item.color || undefined },
            geometry: { type: 'Polygon', coordinates: rings }
          });
        }
        const fc = { type: 'FeatureCollection', features };
        const json = JSON.stringify(fc);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'zones.geojson';
        document.body.appendChild(a);
        a.click();
        setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 100);
        const resEl = document.getElementById('zoneResult');
        if (resEl) resEl.textContent = 'Exported ' + features.length + ' zone(s).';
      } catch(e) {
        const resEl = document.getElementById('zoneResult');
        if (resEl) resEl.textContent = 'Failed to export zones';
      }
    }
    function importGeoJSON(geojson){
      try {
        const features = Array.isArray(geojson.features) ? geojson.features : [];
        let imported = 0;
        features.forEach(f => {
          if (!f || !f.geometry || f.geometry.type !== 'Polygon') return;
          const coords = f.geometry.coordinates; // [ [ [lng,lat], ... ] , ... ] rings
          const paths = (coords || []).map(ring => ring.map(([lng, lat]) => new google.maps.LatLng(lat, lng)));
          const color = (f.properties && f.properties.color) || colorForName((f.properties && f.properties.name) || 'Zone');
          const polygon = new google.maps.Polygon({
            paths,
            strokeColor: color, strokeWeight: 2, strokeOpacity: 0.9,
            fillColor: color, fillOpacity: 0.25,
            editable: true,
            map
          });
          const name = (f.properties && f.properties.name) || 'Zone';
          drawnPolygons.push({ name, color, polygon });
          imported++;
        });
        return imported;
      } catch(e) {
        console.warn('[Maps] Failed to import GeoJSON', e);
        return 0;
      }
    }

    window.ZonesEditor = {
      importGeoJSON: importGeoJSON,
      exportGeoJSON: exportZones
    };
  }
};
