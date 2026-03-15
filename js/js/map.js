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
  const AVAILABILITY_BUFFER_MINUTES = 5;
  const AVAILABILITY_DEFAULT_DURATION_MINUTES = 60;
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
        try { refreshAvailability(); updateDeliverySummary(); } catch(_) {}
      })
      .catch(() => {
        window._holidaysSet = new Set();
        try { refreshAvailability(); updateDeliverySummary(); } catch(_) {}
      });
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
  function legDistanceMeters(leg){
    return (leg && leg.distance && Number(leg.distance.value)) || 0;
  }
  function legDurationSeconds(leg){
    return (leg && leg.duration && Number(leg.duration.value)) || 0;
  }
  function routeDistanceMeters(route){
    const legs = route && Array.isArray(route.legs) ? route.legs : [];
    let total = 0;
    for (let i = 0; i < legs.length; i++) total += legDistanceMeters(legs[i]);
    return total;
  }
  function routeDurationSeconds(route){
    const legs = route && Array.isArray(route.legs) ? route.legs : [];
    let total = 0;
    for (let i = 0; i < legs.length; i++) total += legDurationSeconds(legs[i]);
    return total;
  }
  function routePolylineKey(route){
    const ov = route && route.overview_polyline;
    if (!ov) return '';
    if (typeof ov === 'string') return ov;
    if (ov.points) return String(ov.points);
    if (typeof ov.toString === 'function') return String(ov.toString());
    return '';
  }
  function pickShortestLegalBikeRoute(routes){
    const list = Array.isArray(routes) ? routes.filter(function(route){
      return route && Array.isArray(route.legs) && route.legs.length;
    }) : [];
    if (!list.length) return null;
    list.sort(function(a, b){
      const distDiff = routeDistanceMeters(a) - routeDistanceMeters(b);
      if (distDiff !== 0) return distDiff;
      const durDiff = routeDurationSeconds(a) - routeDurationSeconds(b);
      if (durDiff !== 0) return durDiff;
      const aKey = routePolylineKey(a);
      const bKey = routePolylineKey(b);
      if (aKey < bKey) return -1;
      if (aKey > bKey) return 1;
      return 0;
    });
    return list[0];
  }
  function collectLegPathPoints(leg){
    const out = [];
    if (!leg || !Array.isArray(leg.steps)) return out;
    for (let s = 0; s < leg.steps.length; s++) {
      const step = leg.steps[s];
      const path = step && step.path;
      if (Array.isArray(path) && path.length) {
        for (let k = 0; k < path.length; k++) out.push(path[k]);
      } else {
        if (step && step.start_location) out.push(step.start_location);
        if (step && step.end_location) out.push(step.end_location);
      }
    }
    return out;
  }
  async function requestBikeLegRoute(from, to){
    const req = {
      origin: from,
      destination: to,
      travelMode: google.maps.TravelMode.BICYCLING,
      provideRouteAlternatives: true,
      optimizeWaypoints: false
    };
    const res = await directions.route(req);
    const route = pickShortestLegalBikeRoute(res && res.routes);
    if (!route || !Array.isArray(route.legs) || !route.legs.length) return null;
    const leg = route.legs[0];
    if (!leg) return null;
    return {
      sec: legDurationSeconds(leg),
      meters: legDistanceMeters(leg),
      pathPoints: collectLegPathPoints(leg)
    };
  }
  async function computeRouteDuration(origin, waypoints, destination){
    // Prefer routed bike legs everywhere; fallback only on API failures.
    try {
      const pts = [origin].concat(waypoints||[]).concat([destination]).filter(Boolean);
      if (pts.length < 2) return 0;
      let total = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const leg = await requestBikeLegRoute(pts[i], pts[i + 1]);
        if (!leg) return estimateDurationFallback(origin, waypoints, destination);
        total += Number(leg.sec || 0) || 0;
      }
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
    try {
      let totalSec = 0;
      const pathPoints = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const leg = await requestBikeLegRoute(pts[i], pts[i + 1]);
        if (!leg) throw new Error('Leg routing unavailable');
        const sec = Number(leg.sec || 0) || 0;
        const meters = Number(leg.meters || 0) || 0;
        totalSec += sec;
        legs.push({ sec, meters, from: pts[i], to: pts[i + 1] });
        // Exclude base->pickup leg path (index 0) to keep rendered route focused on service leg.
        if (i >= 1 && Array.isArray(leg.pathPoints) && leg.pathPoints.length) {
          for (let k = 0; k < leg.pathPoints.length; k++) pathPoints.push(leg.pathPoints[k]);
        }
      }
      return { totalSec, legs, pathPoints };
    } catch(_) {}
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
    return Number(p||0) * 0.88;
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
        const currentVal = String(inputEl.value || '').trim();
        setInputLocationData(inputEl, loc, currentVal || val);
        updateAddressMarkers();
        autoEstimateIfReady();
        updateDeliverySummary();
      });
    } catch(_) {}
  }
  function attachAddressInputHandlers(inputEl){
    try {
      if (!inputEl) return;
      let geocodeTimer = null;
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
        if (geocodeTimer) clearTimeout(geocodeTimer);
        geocodeTimer = setTimeout(function(){
          requestGeocodeForInput(inputEl);
        }, 250);
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
  const qDateDisplay = document.getElementById('quoteDateDisplay');
  const qTime = document.getElementById('quoteTime');
  const qCargo = document.getElementById('quoteCargo');
  const qCargoOptionChips = Array.from(document.querySelectorAll('.cargo-option-chip[data-cargo-option]'));
  const qLoadRandom = document.getElementById('quoteLoadRandom');
  const qRefresh = document.getElementById('quoteRefresh');
  const qDiscount = document.getElementById('quoteDiscount');
  const qDiscountApply = document.getElementById('quoteDiscountApply');
  const qDiscountStatus = document.getElementById('quoteDiscountStatus');
  const qTimeStatus = document.getElementById('quoteTimeStatus');
  const qName = document.getElementById('quoteName');
  const qEmail = document.getElementById('quoteEmail');
  const qEmailConfirm = document.getElementById('quoteEmailConfirm');
  const qPhoneCountry = document.getElementById('quotePhoneCountry');
  const qPhoneCountryOptions = document.getElementById('quotePhoneCountryOptions');
  const qPhone = document.getElementById('quotePhone');
  const qNotes = document.getElementById('quoteNotes');
  const qUpdates = document.getElementById('quoteUpdates');
  const qConsent = document.getElementById('quoteConsent');
  const qSubmit = document.getElementById('quoteSubmit');
  const qProceedBooking = document.getElementById('quoteProceedBooking');
  const qBookingSection = document.getElementById('quoteBookingSection');
  const qAddressesSection = document.querySelector('.config-section--addresses');
  const qDateTimeSection = document.querySelector('.config-section--datetime');
  const qCargoSection = document.querySelector('.config-section--cargo');
  const qPayNow = document.getElementById('quotePayNow');
  const qPaymentMount = document.getElementById('quotePaymentMount');
  const qTraceInfoIcon = document.getElementById('quoteTraceInfoIcon');
  const qDeliverySummary = document.getElementById('quoteDeliverySummary');
  const qBookingStatus = document.getElementById('quoteBookingStatus');
  const qSummaryCard = document.querySelector('.quote-summary-card');
  const qSummaryHeading = document.querySelector('.quote-summary-heading');
  const DEFAULT_DISCOUNT_CODE = 'SELF5';
  const VAT_RATE = 0.21;
  let bookingDetailsRevealed = false;
  let paymentFrameVisible = false;
  let quoteSummaryAutoScrolled = false;
  let cargoExplicitlyConfirmed = false;
  let guidedScrolledToDateTime = false;
  let guidedScrolledToCargo = false;
  let activeEmbeddedCheckout = null;
  let lastEmbeddedMountError = '';
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
  function formatDateDisplayValue(isoDate){
    const v = String(isoDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
    const parts = v.split('-');
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }
  function syncDateDisplay(){
    try {
      if (!qDateDisplay) return;
      const iso = qDate && qDate.value ? String(qDate.value) : '';
      qDateDisplay.value = formatDateDisplayValue(iso);
    } catch(_) {}
  }
  function openNativeDatePicker(){
    try {
      if (!qDate) return;
      if (typeof qDate.showPicker === 'function') {
        qDate.showPicker();
      } else {
        qDate.focus();
        qDate.click();
      }
    } catch(_) {}
  }
  function defaultDateTimeInputs(){
    try {
      const now = new Date();
      if (qDate && !qDate.value) {
        qDate.value = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
      }
      if (qTime && !qTime.value) {
        qTime.value = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
      }
      syncDateDisplay();
    } catch(_) {}
  }
  if (qDiscount && !qDiscount.value) qDiscount.value = DEFAULT_DISCOUNT_CODE;
  function onDateTimeSelectionChange(){
    try {
      // Do not show datetime errors immediately while user is still choosing date/time.
      autoEstimateIfReady({ source: 'datetime', highlightErrors: false });
      refreshAvailability();
      updateDeliverySummary();
    } catch(_) {}
  }
  if (qDate) qDate.addEventListener('change', function(){
    syncDateDisplay();
    onDateTimeSelectionChange();
  });
  if (qDate) qDate.addEventListener('input', function(){
    syncDateDisplay();
    onDateTimeSelectionChange();
  });
  if (qDateDisplay) {
    qDateDisplay.addEventListener('click', openNativeDatePicker);
    qDateDisplay.addEventListener('focus', openNativeDatePicker);
    qDateDisplay.addEventListener('keydown', function(e){
      if (!e) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        openNativeDatePicker();
      }
    });
  }
  syncDateDisplay();
  if (qTime) qTime.addEventListener('change', onDateTimeSelectionChange);
  if (qTime) qTime.addEventListener('input', onDateTimeSelectionChange);
  if (qCargo) qCargo.addEventListener('change', function(){
    try {
      cargoExplicitlyConfirmed = true;
      autoEstimateIfReady({ source: 'cargo', highlightErrors: true, immediate: true });
      updateDeliverySummary();
      syncCargoOptionChips();
    } catch(_) {}
  });
  if (qCargoOptionChips && qCargoOptionChips.length && qCargo) {
    qCargoOptionChips.forEach(function(chip){
      chip.addEventListener('click', function(){
        const value = String((chip && chip.dataset && chip.dataset.cargoOption) || '').trim();
        if (!value) return;
        cargoExplicitlyConfirmed = true;
        if (qCargo.value !== value) {
          qCargo.value = value;
          try {
            qCargo.dispatchEvent(new Event('change', { bubbles: true }));
          } catch(_) {
            cargoExplicitlyConfirmed = true;
            autoEstimateIfReady({ source: 'cargo', highlightErrors: true, immediate: true });
            updateDeliverySummary();
          }
        } else {
          autoEstimateIfReady({ source: 'cargo', highlightErrors: true, immediate: true });
          updateDeliverySummary();
        }
        syncCargoOptionChips();
      });
    });
    syncCargoOptionChips();
  }
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
  function getEstimatorPanel(){
    return document.querySelector('.zones-home-panel');
  }
  function shouldLockEstimatorPanel(){
    try {
      if (window.matchMedia) return window.matchMedia('(min-width: 721px)').matches;
    } catch(_) {}
    return window.innerWidth > 720;
  }
  function canFitIntakeSections(panel){
    try {
      if (!panel || !qCargoSection) return false;
      const prevTop = panel.scrollTop;
      panel.scrollTop = 0;
      const panelRect = panel.getBoundingClientRect();
      const cargoRect = qCargoSection.getBoundingClientRect();
      panel.scrollTop = prevTop;
      return cargoRect.bottom <= (panelRect.bottom - 6);
    } catch(_) {}
    return false;
  }
  function syncEstimatorPanelMode(hasQuote){
    try {
      const panel = getEstimatorPanel();
      if (!panel) return;
      const shouldLock = !hasQuote && shouldLockEstimatorPanel() && canFitIntakeSections(panel);
      panel.classList.toggle('is-intake-locked', shouldLock);
      panel.classList.toggle('is-quote-ready', !shouldLock);
      if (shouldLock) panel.scrollTop = 0;
    } catch(_) {}
  }
  function scrollPanelToCenter(targetEl){
    try {
      if (!targetEl) return;
      const panel = getEstimatorPanel();
      if (!panel) return;
      const panelRect = panel.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const delta = (targetRect.top - panelRect.top) - ((panelRect.height - targetRect.height) / 2);
      const nextTop = Math.max(0, panel.scrollTop + delta);
      panel.scrollTo({ top: nextTop, behavior: 'smooth' });
    } catch(_) {}
  }
  function scrollPanelToTop(targetEl, topPadding){
    try {
      if (!targetEl) return;
      const panel = getEstimatorPanel();
      if (!panel) return;
      const panelRect = panel.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const pad = Math.max(0, Number(topPadding || 0) || 0);
      const delta = (targetRect.top - panelRect.top) - pad;
      const nextTop = Math.max(0, panel.scrollTop + delta);
      panel.scrollTo({ top: nextTop, behavior: 'smooth' });
    } catch(_) {}
  }
  function sectionByKey(sectionKey){
    if (sectionKey === 'addresses') return qAddressesSection;
    if (sectionKey === 'datetime') return qDateTimeSection;
    if (sectionKey === 'cargo') return qCargoSection;
    if (sectionKey === 'booking') return qBookingSection;
    return null;
  }
  function setSectionInvalidState(sectionKey, isInvalid){
    const sectionEl = sectionByKey(sectionKey);
    if (!sectionEl) return;
    sectionEl.classList.toggle('is-invalid', !!isInvalid);
  }
  function setSectionErrorMessage(sectionKey, msg){
    const sectionEl = sectionByKey(sectionKey);
    if (!sectionEl) return;
    const summaryEl = sectionEl.querySelector('.config-summary');
    if (!summaryEl) return;
    let hintEl = summaryEl.querySelector('.config-error-hint');
    const text = String(msg || '').trim();
    if (!text) {
      if (hintEl) hintEl.remove();
      return;
    }
    if (!hintEl) {
      hintEl = document.createElement('span');
      hintEl.className = 'config-error-hint';
      summaryEl.appendChild(hintEl);
    }
    hintEl.textContent = text;
  }
  function setSectionValidationState(sectionKey, errorMsg){
    const msg = String(errorMsg || '').trim();
    setSectionInvalidState(sectionKey, !!msg);
    setSectionErrorMessage(sectionKey, msg);
  }
  function clearAllSectionInvalidStates(){
    setSectionValidationState('addresses', '');
    setSectionValidationState('datetime', '');
    setSectionValidationState('cargo', '');
    setSectionValidationState('booking', '');
  }
  function hasDateTimeSelection(){
    const hasDate = !!(qDate && qDate.value);
    const hasTime = !!(qTime && qTime.value);
    return hasDate && hasTime;
  }
  function getAddressValidationError(){
    const orderedInputs = getOrderedInputs();
    if (!orderedInputs || orderedInputs.length < 2) {
      return i18n('quoteEnterBoth') || 'Enter pickup and dropoff';
    }
    const pickupEl = orderedInputs[0];
    const dropEl = orderedInputs[orderedInputs.length - 1];
    const pickupText = String((pickupEl && pickupEl.value) || '').trim();
    const dropText = String((dropEl && dropEl.value) || '').trim();
    if (!pickupText || !dropText) {
      return i18n('quoteEnterBoth') || 'Enter pickup and dropoff';
    }
    if (!getLocationForInput(pickupEl) || !getLocationForInput(dropEl)) {
      return i18n('quoteAddressNotFound') || 'Address not found';
    }
    for (let i = 1; i < orderedInputs.length - 1; i++) {
      const stopInput = orderedInputs[i];
      const stopText = String((stopInput && stopInput.value) || '').trim();
      if (!stopText) continue;
      if (!getLocationForInput(stopInput)) {
        return i18n('quoteAddressNotFound') || 'Address not found';
      }
    }
    return '';
  }
  function getDateTimeValidationError(){
    if (hasDateTimeSelection()) return '';
    return i18n('quoteDateTimeRequired') || 'Please choose a date and time.';
  }
  function getCargoValidationError(){
    const cargoValue = String((qCargo && qCargo.value) || '').trim();
    if (!cargoValue) return i18n('quoteCargoRequired') || 'Please choose a cargo type.';
    if (!cargoExplicitlyConfirmed) {
      return i18n('quoteCargoConfirmRequired') || 'Please choose a cargo type to continue.';
    }
    return '';
  }
  function resetGuidedFlowState(resetCargoChoice){
    guidedScrolledToDateTime = false;
    guidedScrolledToCargo = false;
    if (resetCargoChoice) cargoExplicitlyConfirmed = false;
    clearAllSectionInvalidStates();
  }
  function ensureBookingSectionPlacement(){
    try {
      if (!qBookingSection || !qSummaryCard) return;
      const anchor = qSummaryCard.querySelector('.quote-booking-row');
      if (!anchor) return;
      if (qBookingSection.parentElement !== qSummaryCard) {
        qSummaryCard.insertBefore(qBookingSection, anchor);
      }
    } catch(_) {}
  }
  function updatePayButtonLabel(){
    if (!qPayNow) return;
    const ctx = window._lastQuoteContext || null;
    const currency = String((ctx && ctx.currency) || '€');
    const amount = Number((ctx && ctx.total) || 0) || 0;
    const label = (i18n('quotePayToConfirm', { amount: formatMoneyLocalized(amount, currency) }) || ('Pay ' + formatMoneyLocalized(amount, currency) + ' to confirm booking'));
    qPayNow.textContent = label;
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
  function isValidEmail(value){
    const v = String(value || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }
  function isValidPhone(value){
    const v = String(value || '').trim();
    if (!/^\+\d{6,15}$/.test(v)) return false;
    const spain = v.startsWith('+34');
    if (spain) {
      const rest = v.slice(3).replace(/\D/g, '');
      return rest.length === 9;
    }
    return true;
  }
  function composePhoneWithCountry(countryCode, localPhone){
    const rawLocal = String(localPhone || '').trim();
    if (!rawLocal) return '';
    const compactLocal = rawLocal.replace(/\s+/g, '');
    if (compactLocal.startsWith('+')) return compactLocal;

    const source = String(countryCode || '').trim();
    const plusMatch = source.match(/\+(\d{1,4})/);
    const ccDigits = plusMatch ? String(plusMatch[1]) : String(source || '+34').replace(/[^\d]/g, '');
    const localDigits = compactLocal.replace(/[^\d]/g, '');
    if (!ccDigits || !localDigits) return '';

    const localNoPrefixZero = localDigits.replace(/^0+/, '') || localDigits;
    return '+' + ccDigits + localNoPrefixZero;
  }
  function dialCodeFromCountryValue(value){
    const source = String(value || '').trim();
    if (!source) return '';
    const plusMatch = source.match(/\+(\d{1,4})/);
    if (plusMatch) return '+' + plusMatch[1];
    const digits = source.replace(/[^\d]/g, '');
    return digits ? ('+' + digits) : '';
  }
  function countryNameFromCountryValue(value){
    return String(value || '').replace(/\s*\(\+\d{1,4}\)\s*$/, '').trim();
  }
  function normalizePhoneCountryInput(strictMode){
    try {
      if (!qPhoneCountry || !qPhoneCountryOptions) return;
      const raw = String(qPhoneCountry.value || '').trim();
      if (!raw) return;
      const options = Array.from(qPhoneCountryOptions.options || []).map(function(opt){
        return String((opt && opt.value) || '').trim();
      }).filter(Boolean);

      const isCodeInput = /^\+?\d+$/.test(raw);
      if (isCodeInput) {
        const typedDigits = raw.replace(/[^\d]/g, '');
        if (!typedDigits) return;
        const exactCode = '+' + typedDigits;
        const codeMatches = options.filter(function(item){ return dialCodeFromCountryValue(item) === exactCode; });
        if (codeMatches.length) {
          if (exactCode === '+55') {
            const brazil = codeMatches.find(function(item){ return /brasil/i.test(item); });
            qPhoneCountry.value = brazil || codeMatches[0];
          } else {
            qPhoneCountry.value = codeMatches[0];
          }
          return;
        }
        if (strictMode) return;
        const codePrefixMatches = options.filter(function(item){
          return dialCodeFromCountryValue(item).replace(/^\+/, '').startsWith(typedDigits);
        });
        if (codePrefixMatches.length === 1) {
          qPhoneCountry.value = codePrefixMatches[0];
        }
        return;
      }

      const normalizedRaw = raw.toLowerCase();
      const exactLabel = options.find(function(item){ return item.toLowerCase() === normalizedRaw; });
      if (exactLabel) {
        qPhoneCountry.value = exactLabel;
        return;
      }
      if (strictMode) return;

      const startsWithMatches = options.filter(function(item){
        return countryNameFromCountryValue(item).toLowerCase().startsWith(normalizedRaw);
      });
      if (startsWithMatches.length) {
        qPhoneCountry.value = startsWithMatches[0];
        return;
      }

      const containsMatches = options.filter(function(item){
        return countryNameFromCountryValue(item).toLowerCase().includes(normalizedRaw);
      });
      if (containsMatches.length === 1 || normalizedRaw.length >= 4) {
        if (containsMatches.length) qPhoneCountry.value = containsMatches[0];
      }
    } catch(_) {}
  }
  function syncCargoOptionChips(){
    try {
      if (!qCargo || !qCargoOptionChips || !qCargoOptionChips.length) return;
      const selectedValue = String(qCargo.value || 'regular');
      qCargoOptionChips.forEach(function(chip){
        const value = String((chip && chip.dataset && chip.dataset.cargoOption) || '');
        const active = value === selectedValue;
        chip.classList.toggle('is-active', active);
        chip.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    } catch(_) {}
  }
  function abbreviateAddress(label){
    const raw = String(label || '').trim();
    if (!raw) return '';
    let text = raw.replace(/\s+/g, ' ').trim();
    const replacements = [
      [/\bCarrer\b/gi, 'Cr.'],
      [/\bCalle\b/gi, 'C.'],
      [/\bAvinguda\b/gi, 'Av.'],
      [/\bAvenida\b/gi, 'Av.'],
      [/\bPasseig\b/gi, 'Pg.'],
      [/\bPaseo\b/gi, 'Pg.'],
      [/\bPla[çc]a\b/gi, 'Pl.'],
      [/\bPlaza\b/gi, 'Pl.'],
      [/\bRonda\b/gi, 'Rda.'],
      [/\bTravessera\b/gi, 'Trav.'],
      [/\bTraves[ií]a\b/gi, 'Trav.'],
      [/\bCam[ií]\b/gi, 'Cam.'],
      [/\bCamino\b/gi, 'Cam.'],
      [/\bGran\s+Via\b/gi, 'G.V.']
    ];
    replacements.forEach(function(rule){ text = text.replace(rule[0], rule[1]); });
    const parts = text.split(',').map(function(item){ return String(item || '').trim(); }).filter(Boolean);
    let compact = parts[0] || text;
    if (parts.length > 1) {
      const second = parts[1];
      // Keep street number only; suppress neighborhood, postcode/city and country details.
      if (/^(\d+[A-Za-z]?|s\/?n|sn)$/i.test(second)) compact += ', ' + second;
    }
    return compact.length > 52 ? (compact.slice(0, 49) + '…') : compact;
  }
  function escapeHtml(value){
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function formatSummaryDateTime(dateVal, timeVal){
    try {
      if (!dateVal) return '';
      const fullDate = formatDateDisplayValue(String(dateVal)) || String(dateVal);
      const dateText = fullDate.replace(/\/\d{4}$/, '');
      const timeText = timeVal ? String(timeVal) : '';
      return timeText ? (dateText + ' · ' + timeText) : dateText;
    } catch(_) {
      return String(dateVal || '').trim();
    }
  }
  function updateDeliverySummary(){
    if (!qDeliverySummary) return;
    const ctx = window._lastQuoteContext || null;
    const pickupReady = !!(qPickup && qPickup.dataset && qPickup.dataset.lat && qPickup.dataset.lng);
    const dropReady = !!(qDrop && qDrop.dataset && qDrop.dataset.lat && qDrop.dataset.lng);
    if (!ctx || !pickupReady || !dropReady) {
      qDeliverySummary.classList.add('is-hidden');
      qDeliverySummary.innerHTML = '';
      return;
    }
    const orderedInputs = getOrderedInputs().filter(function(el){ return !!getLocationForInput(el); });
    const addressList = orderedInputs
      .map(function(el){ return abbreviateAddress(addressLabelForInput(el)); })
      .filter(Boolean);
    const addressCount = addressList.length;
    const dateVal = qDate && qDate.value ? String(qDate.value) : '';
    const timeVal = qTime && qTime.value ? String(qTime.value) : '';
    const dateLine = formatSummaryDateTime(dateVal, timeVal);
    const totalLine = (i18n('summaryTotalLabel') || 'Total') + ' ' + formatMoneyLocalized(ctx.total || 0, ctx.cur || '€');
    const title = i18n('deliverySummaryTitle') || 'Delivery Summary';
    const addressesLabel = i18n('summaryAddressesLabel') || 'Addresses';
    const lines = [];
    lines.push('<div class="summary-title">' + escapeHtml(title) + '</div>');
    if (addressCount) {
      lines.push('<div><strong>' + escapeHtml(addressesLabel) + ' (' + addressCount + '):</strong></div>');
      addressList.forEach(function(item, idx){
        lines.push('<div>' + (idx + 1) + '. ' + escapeHtml(item) + '</div>');
      });
    }
    if (dateLine) lines.push('<div>' + escapeHtml(dateLine) + '</div>');
    lines.push('<div class="summary-total">' + escapeHtml(totalLine) + '</div>');
    qDeliverySummary.innerHTML = lines.join('');
    qDeliverySummary.classList.remove('is-hidden');
  }
  try { window.updateDeliverySummary = updateDeliverySummary; } catch(_) {}
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
        autoEstimateIfReady({ source: 'address' });
      });
    });
  }
  if (qDiscount) {
    qDiscount.addEventListener('input', function(){
      const code = normalizeDiscountCode(qDiscount.value);
      if (!code || !activeDiscountCodes.includes(code)) setDiscountStatus('');
    });
  }

  function getBookingValidationState(){
    const hasQuote = !!(window._lastQuoteContext);
    if (!hasQuote) {
      return {
        error: i18n('quoteEstimateFirst') || 'Please calculate a quote first.',
        section: 'cargo'
      };
    }
    const name = String((qName && qName.value) || '').trim();
    const email = String((qEmail && qEmail.value) || '').trim();
    const emailConfirm = String((qEmailConfirm && qEmailConfirm.value) || '').trim();
    const phoneRaw = String((qPhone && qPhone.value) || '').trim();
    const phone = composePhoneWithCountry((qPhoneCountry && qPhoneCountry.value) || 'Spain (+34)', phoneRaw);
    const consent = !!(qConsent && qConsent.checked);
    const dateVal = (qDate && qDate.value) ? String(qDate.value) : '';
    const timeVal = (qTime && qTime.value) ? String(qTime.value) : '';
    if (!name) return { error: i18n('bookingNameRequired') || 'Please enter your name.', section: 'booking' };
    if (!email) return { error: i18n('bookingEmailRequired') || 'Please enter your email.', section: 'booking' };
    if (!isValidEmail(email)) return { error: i18n('bookingEmailInvalid') || 'Please enter a valid email.', section: 'booking' };
    if (!emailConfirm) return { error: i18n('bookingEmailConfirmRequired') || 'Please confirm your email.', section: 'booking' };
    if (email.toLowerCase() !== emailConfirm.toLowerCase()) return { error: i18n('bookingEmailMismatch') || 'Email confirmation does not match.', section: 'booking' };
    if (!phoneRaw) return { error: i18n('bookingPhoneRequired') || 'Please enter your phone number.', section: 'booking' };
    if (!isValidPhone(phone)) return { error: i18n('bookingPhoneInvalid') || 'Please enter a valid phone number with country code.', section: 'booking' };
    if (!consent) return { error: i18n('bookingConsentRequired') || 'Please confirm you agree to be contacted.', section: 'booking' };
    if (!dateVal || !timeVal) return { error: i18n('quoteDateTimeRequired') || 'Please choose a date and time.', section: 'datetime' };
    return { error: '', section: '' };
  }
  function getBookingValidationError(){
    return getBookingValidationState().error;
  }
  function hidePaymentMount(){
    try {
      if (activeEmbeddedCheckout && typeof activeEmbeddedCheckout.unmount === 'function') {
        activeEmbeddedCheckout.unmount();
      }
      if (activeEmbeddedCheckout && typeof activeEmbeddedCheckout.destroy === 'function') {
        activeEmbeddedCheckout.destroy();
      }
    } catch(_) {}
    activeEmbeddedCheckout = null;
    if (!qPaymentMount) return;
    qPaymentMount.classList.add('is-hidden');
    qPaymentMount.innerHTML = '';
    paymentFrameVisible = false;
  }
  function updateSubmitVisibility(){
    const pickupReady = !!(qPickup && qPickup.dataset && qPickup.dataset.lat && qPickup.dataset.lng);
    const dropReady = !!(qDrop && qDrop.dataset && qDrop.dataset.lat && qDrop.dataset.lng);
    const ready = pickupReady && dropReady;
    const hasQuote = !!(window._lastQuoteContext);
    const hasSummaryContent = !!(
      hasQuote ||
      (qRate && String(qRate.textContent || '').trim()) ||
      (qOut && String(qOut.textContent || '').trim())
    );
    const hasBookingStatus = !!(qBookingStatus && String(qBookingStatus.textContent || '').trim());
    const showSummaryCard = (ready && hasSummaryContent) || hasBookingStatus;
    syncEstimatorPanelMode(hasQuote);
    if (qSummaryCard) qSummaryCard.classList.toggle('is-hidden', !showSummaryCard);
    if (qSummaryHeading) qSummaryHeading.classList.toggle('is-hidden', !showSummaryCard);
    if (qTraceInfoIcon) qTraceInfoIcon.classList.toggle('is-hidden', !ready);
    if (qSubmit) qSubmit.classList.add('is-hidden');

    if (!hasQuote) {
      bookingDetailsRevealed = false;
      hidePaymentMount();
      setSectionValidationState('booking', '');
    }
    if (qProceedBooking) qProceedBooking.classList.toggle('is-hidden', !hasQuote);
    if (qBookingSection) qBookingSection.classList.toggle('is-hidden', !bookingDetailsRevealed);

    const showPay = bookingDetailsRevealed && hasQuote;
    if (qPayNow) {
      qPayNow.classList.toggle('is-hidden', !showPay);
      updatePayButtonLabel();
      qPayNow.disabled = false;
    }
    const bookingValidation = getBookingValidationState();
    if (!bookingValidation.error || bookingValidation.section !== 'booking') {
      setSectionValidationState('booking', '');
    }
    updateDeliverySummary();
  }
  window.addEventListener('resize', function(){
    syncEstimatorPanelMode(!!window._lastQuoteContext);
  });
  if (qPickup) qPickup.addEventListener('input', updateSubmitVisibility);
  if (qDrop) qDrop.addEventListener('input', updateSubmitVisibility);
  if (qStopsWrap) qStopsWrap.addEventListener('input', updateSubmitVisibility);
  if (qName) qName.addEventListener('input', updateSubmitVisibility);
  if (qEmail) qEmail.addEventListener('input', updateSubmitVisibility);
  if (qEmailConfirm) qEmailConfirm.addEventListener('input', updateSubmitVisibility);
  if (qPhone) qPhone.addEventListener('input', updateSubmitVisibility);
  if (qNotes) qNotes.addEventListener('input', updateSubmitVisibility);
  if (qUpdates) qUpdates.addEventListener('change', updateSubmitVisibility);
  if (qPhoneCountry) {
    qPhoneCountry.addEventListener('input', function(){
      normalizePhoneCountryInput(true);
      updateSubmitVisibility();
    });
    qPhoneCountry.addEventListener('change', function(){
      normalizePhoneCountryInput(false);
      updateSubmitVisibility();
    });
    qPhoneCountry.addEventListener('blur', function(){ normalizePhoneCountryInput(false); });
  }
  if (qConsent) qConsent.addEventListener('change', updateSubmitVisibility);
  if (qProceedBooking) {
    qProceedBooking.addEventListener('click', function(){
      if (!window._lastQuoteContext) return;
      ensureBookingSectionPlacement();
      bookingDetailsRevealed = true;
      setSectionValidationState('booking', '');
      setBookingStatus('');
      updateSubmitVisibility();
      if (qBookingSection) scrollPanelToTop(qBookingSection, 8);
    });
  }
  ensureBookingSectionPlacement();
  updateSubmitVisibility();

  function getSectionTopInPanel(sectionEl){
    try {
      if (!sectionEl) return null;
      const panel = getEstimatorPanel();
      if (!panel) return null;
      const panelRect = panel.getBoundingClientRect();
      const sectionRect = sectionEl.getBoundingClientRect();
      return sectionRect.top - panelRect.top;
    } catch(_) { return null; }
  }
  function validateSectionsOnManualScroll(){
    try {
      const threshold = 12;
      const dateTimeTop = getSectionTopInPanel(qDateTimeSection);
      const cargoTop = getSectionTopInPanel(qCargoSection);
      const summaryTop = getSectionTopInPanel(qSummaryCard);

      const addressError = getAddressValidationError();
      const dateTimeError = getDateTimeValidationError();
      const cargoError = getCargoValidationError();

      if (addressError && dateTimeTop != null && dateTimeTop <= threshold) {
        setSectionValidationState('addresses', addressError);
      } else if (!addressError) {
        setSectionValidationState('addresses', '');
      }

      if (dateTimeError && cargoTop != null && cargoTop <= threshold) {
        setSectionValidationState('datetime', dateTimeError);
        setAvailabilityStatus(i18n('quoteDateTimeRequired') || 'Please choose a date and time.', true);
      } else if (!dateTimeError) {
        setSectionValidationState('datetime', '');
      }

      const summaryVisible = !!(qSummaryCard && !qSummaryCard.classList.contains('is-hidden'));
      if (cargoError && summaryVisible && summaryTop != null && summaryTop <= threshold) {
        setSectionValidationState('cargo', cargoError);
      } else if (!cargoError) {
        setSectionValidationState('cargo', '');
      }
    } catch(_) {}
  }
  function bindManualScrollValidation(){
    try {
      const panel = getEstimatorPanel();
      if (!panel || panel.dataset.sectionValidationBound === '1') return;
      panel.dataset.sectionValidationBound = '1';
      let rafId = 0;
      panel.addEventListener('scroll', function(){
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(function(){
          rafId = 0;
          validateSectionsOnManualScroll();
        });
      }, { passive: true });
    } catch(_) {}
  }
  bindManualScrollValidation();

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
  function getEstimatedDurationMinutes(){
    const ctx = window._lastQuoteContext || null;
    const eta = Number(ctx && ctx.etaMins || 0) || 0;
    return eta > 0 ? eta : AVAILABILITY_DEFAULT_DURATION_MINUTES;
  }
  function getAvailabilityFlagMessage(surchargeInfo){
    if (!surchargeInfo) return '';
    const hasWeekendHoliday = !!surchargeInfo.isWeekendHoliday;
    const hasAfterHours = !!surchargeInfo.afterHours;
    if (hasWeekendHoliday && hasAfterHours) {
      return i18n('availabilityFlagWeekendAndAfterHours') || 'Weekend/holiday and after-hours date/time selected. Weekend/holiday and after-hours surcharges apply.';
    }
    if (hasWeekendHoliday) {
      return i18n('availabilityFlagWeekend') || 'Weekend/holiday date/time selected. Weekend/holiday surcharge applies.';
    }
    if (hasAfterHours) {
      return i18n('availabilityFlagAfterHours') || 'After-hours date/time selected. After-hours surcharge applies.';
    }
    return '';
  }
  function isTimeBlocked(min, blocked, duration){
    const endMin = min + Math.max(0, Number(duration || 0) || 0);
    return blocked.some(b => min < b.end && endMin > b.start);
  }
  function extendBlockedWithBuffer(blocked, buffer){
    const bump = Math.max(0, Number(buffer || 0) || 0);
    return (blocked || []).map(function(item){
      const start = Math.max(0, Number(item.start || 0) || 0);
      const end = Math.min(1440, Math.max(start, Number(item.end || 0) || 0) + bump);
      return { start, end };
    });
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
  function findNextAvailableMinute(startMin, blocked, dateKey, durationMin){
    const hours = getBusinessHours(isWeekendHolidayKey(dateKey));
    const startHours = parseTimeToMinutes(hours && hours.start) ?? 0;
    const endHours = parseTimeToMinutes(hours && hours.end) ?? (24 * 60);
    const start = Math.max(startMin, startHours);
    const duration = Math.max(0, Number(durationMin || 0) || 0);
    const lastStart = endHours - duration;
    if (lastStart < start) return null;
    for (let m = start; m <= lastStart; m += AVAILABILITY_SLOT_MINUTES){
      if (!isTimeBlocked(m, blocked, duration)) return m;
    }
    return null;
  }
  async function refreshAvailability(){
    if (!calendarConfigured()) { setAvailabilityStatus(''); return; }
    const hasDate = !!(qDate && qDate.value);
    const hasTime = !!(qTime && qTime.value);
    if (!hasDate && !hasTime) {
      setAvailabilityStatus('');
      return;
    }
    if (!hasDate || !hasTime) {
      setAvailabilityStatus(i18n('quoteDateTimeRequired') || 'Please choose a date and time.', true);
      return;
    }
    const dateKey = String(qDate.value);
    const flagMsg = getAvailabilityFlagMessage(computeSurchargeInfo());
    if (flagMsg) {
      setAvailabilityStatus(flagMsg);
      return;
    }
    const seq = ++availabilitySeq;
    setAvailabilityStatus(i18n('availabilityChecking') || 'Checking availability...');
    try {
      const data = await fetchAvailabilityForDate(dateKey);
      if (seq !== availabilitySeq) return;
      const blockedRaw = (data && data.blocked) || [];
      const blocked = extendBlockedWithBuffer(blockedRaw, AVAILABILITY_BUFFER_MINUTES);
      const selectedMin = parseTimeToMinutes(qTime && qTime.value);
      const durationMin = getEstimatedDurationMinutes() + AVAILABILITY_BUFFER_MINUTES;
      const nextMin = findNextAvailableMinute(selectedMin != null ? selectedMin : 0, blocked, dateKey, durationMin);
      if (nextMin == null) {
        setAvailabilityStatus(i18n('availabilityNone') || 'No availability on this date.', true);
        return;
      }
      if (selectedMin == null || selectedMin !== nextMin) {
        const slot = pad2(Math.floor(nextMin / 60)) + ':' + pad2(nextMin % 60);
        setAvailabilityStatus(
          i18n('availabilityNextSlotSuggested', { time: slot }) || ('Selected time is unavailable. Next available slot: ' + slot),
          true
        );
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
      const stopCount = qStopsWrap
        ? qStopsWrap.querySelectorAll('.quote-stop-item[data-role="stop"]').length
        : 0;
      const autoLarge = stopCount >= 5;
      if (qCargo) {
        const wasAuto = qCargo.dataset && qCargo.dataset.autoLarge === '1';
        if (autoLarge) {
          qCargo.value = 'large';
          qCargo.dataset.autoLarge = '1';
        } else if (wasAuto) {
          qCargo.value = 'regular';
          delete qCargo.dataset.autoLarge;
        }
      }
      const value = autoLarge ? 'large' : (qCargo ? String(qCargo.value || 'regular') : 'regular');
      if (value === 'small') return { key: 'small', label: 'Small parcel (shoebox)', rate: -0.15 };
      if (value === 'large') return { key: 'large', label: 'Large or multiple regular', rate: 0.2 };
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
      try {
        window._lastPricingUiContext = ctx;
        window._refreshPricingUi = function(){
          try { setPricingUiCopy(window._lastPricingUiContext); } catch(_) {}
        };
      } catch(_) {}
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
        const helpPlain = i18n('quoteCalcHelpPlain') || 'How is this calculated? View pricing details or contact us.';
        const helpHtml = i18n('quoteCalcHelp') || '<strong>How is this calculated?</strong> View pricing details or contact us.';
        const helpIcon = '<span class="quote-info" role="img" aria-label="' + helpPlain + '" title="' + helpPlain + '" tabindex="0">?</span>';
        summaryParts.push('<div class="pricing-ui-summary__item"><strong>' + (i18n('summaryTotalLabel') || 'Total') + '</strong><br>' + formatMoneyLocalized(ctx.total || 0, cur) + ' ' + helpIcon + '</div>');
        summaryParts.push('<div class="pricing-ui-summary__item"><strong>' + (i18n('summaryRouteLabel') || 'Route') + '</strong><br>' + routeText + '</div>');
        summaryParts.push('<div class="pricing-ui-summary__item"><strong>' + (i18n('summaryServiceLabel') || 'Service') + '</strong><br>' + serviceText + '</div>');
        if (ctx.discountAmount) {
          const discountText = i18n('summaryDiscountApplied') || 'Discount applied';
          summaryParts.push('<div class="pricing-ui-summary__item"><strong>' + (i18n('summaryDiscountLabel') || 'Discount') + '</strong><br>' + discountText + '</div>');
        }
        summaryEl.innerHTML = summaryParts.join('');
        summaryEl.classList.remove('is-hidden');
      }
      if (breakdownEl) {
        const html = [];
        const pushSectionTitle = function(title){
          html.push('<div class="pricing-ui-breakdown__section-title">' + title + '</div>');
        };
        const pushLine = function(label, value, extraClass){
          const cls = extraClass ? (' pricing-ui-breakdown__line--' + extraClass) : '';
          html.push(
            '<div class="pricing-ui-breakdown__line' + cls + '">' +
              '<span class="pricing-ui-breakdown__line-label">' + label + '</span>' +
              '<span class="pricing-ui-breakdown__line-value">' + value + '</span>' +
            '</div>'
          );
        };
        pushSectionTitle(i18n('breakdownLineItemsLabel') || 'Line items');
        pushLine(i18n('breakdownBaseServiceLabel') || 'Pickup fee', formatMoneyLocalized(ctx.pickupCharge || 0, cur));
        pushLine(i18n('breakdownDistanceLabel') || 'Distance', formatMoneyLocalized(ctx.distanceTotal || 0, cur));
        if (ctx.addressFeeCount) {
          pushSectionTitle(i18n('breakdownDeliveriesLabel') || 'Deliveries');
          const legKms = Array.isArray(ctx.legKms) ? ctx.legKms : [];
          const legPrices = Array.isArray(ctx.legPrices) ? ctx.legPrices : [];
          const stopCount = Math.max(0, Number(ctx.addressFeeCount || 0) - 1);
          for (let i = 0; i < stopCount; i++) {
            const stopLabel = i18n('quoteEtaLabelStop', { n: (i + 1) }) || ('Stop ' + (i + 1));
            const km = Number(legKms[i] || 0) || 0;
            const kmText = formatNumberLocalized(km, 2) + ' km';
            const distPrice = formatMoneyLocalized(Number(legPrices[i] || 0) || 0, cur);
            pushLine(stopLabel, kmText + ' / ' + distPrice);
          }
          const dropLabel = i18n('quoteEtaLabelDropoff') || 'Dropoff';
          const dropKm = Number(legKms[stopCount] || 0) || 0;
          const dropKmText = formatNumberLocalized(dropKm, 2) + ' km';
          const dropPrice = formatMoneyLocalized(Number(legPrices[stopCount] || 0) || 0, cur);
          pushLine(dropLabel, dropKmText + ' / ' + dropPrice);
          if (Number(ctx.addressFeePer || 0) > 0 && ctx.addressFee) {
            pushLine(i18n('breakdownDeliveryFeesLabel') || 'Delivery fees', formatMoneyLocalized(ctx.addressFee || 0, cur));
          }
        }

        const adjustmentLines = [];
        if (ctx.cargoKey === 'large' && ctx.cargoAmount) {
          adjustmentLines.push({
            label: i18n('breakdownLargeCargoLabel') || 'Large cargo',
            value: formatMoneyLocalized(ctx.cargoAmount || 0, cur)
          });
        }
        if (ctx.cargoKey === 'small' && ctx.cargoAmount) {
          adjustmentLines.push({
            label: i18n('breakdownSmallCargoLabel') || 'Small cargo',
            value: formatMoneySigned(ctx.cargoAmount || 0, cur)
          });
        }
        if (ctx.isWeekendHoliday && ctx.weekendSurchargeAmount) {
          adjustmentLines.push({
            label: i18n('breakdownSurchargeWeekendLabel') || 'Weekend/holiday surcharge',
            value: formatMoneyLocalized(ctx.weekendSurchargeAmount || 0, cur)
          });
        }
        if (ctx.afterHours && ctx.afterHoursSurchargeAmount) {
          adjustmentLines.push({
            label: i18n('breakdownSurchargeAfterLabel') || 'After-hours surcharge',
            value: formatMoneyLocalized(ctx.afterHoursSurchargeAmount || 0, cur)
          });
        }
        if (adjustmentLines.length) {
          pushSectionTitle(i18n('breakdownAdjustmentsLabel') || 'Discounts and surcharges');
          adjustmentLines.forEach(function(item){
            pushLine(item.label, item.value);
          });
        }

        const discountItems = Array.isArray(ctx.discountItems) ? ctx.discountItems : [];
        let discountAggregateAmount = 0;
        if (discountItems.length) {
          discountItems.forEach(function(item){
            const promoLabel = i18n('breakdownPromoLabel', { code: item.code }) || ('Promo ' + item.code);
            const amount = Math.abs(Number(item.amount || 0));
            discountAggregateAmount += amount;
            pushLine(promoLabel, formatMoneySigned(-amount, cur));
          });
          if (discountItems.length > 1) {
            pushLine(i18n('breakdownDiscountTotalLabel') || 'Discount total', formatMoneySigned(-discountAggregateAmount, cur));
          }
        }

        pushLine(
          i18n('breakdownSubtotalLabel') || 'Subtotal',
          formatMoneyLocalized(ctx.subtotal || 0, cur),
          'subtotal'
        );

        const vatRatePct = Math.round((Number(ctx.vatRate || 0.21) || 0.21) * 100);
        const vatLabel = i18n('breakdownVatLabel', { rate: vatRatePct }) || ('VAT (' + vatRatePct + '%)');
        pushLine(vatLabel, formatMoneyLocalized(ctx.vatAmount || 0, cur));

        pushLine(
          i18n('breakdownTotalLabel') || 'Total',
          formatMoneyLocalized(ctx.total || 0, cur),
          'total'
        );
        breakdownEl.innerHTML = html.join('');
      }
      if (blockEl) blockEl.classList.remove('is-hidden');
      const breakdownToggle = document.querySelector('.pricing-ui-copy');
      if (breakdownToggle && !breakdownToggle.open) {
        // Keep the breakdown open while editing; do not auto-collapse.
        breakdownToggle.open = true;
      }
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
        'preVat=' + money(ctx.preVatTotal),
        'vat=' + pct(ctx.vatRate) + '/' + money(ctx.vatAmount),
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
              const label = place.formatted_address || inputEl.value;
              if (label) inputEl.value = label;
              setInputLocationData(inputEl, loc, label);
              updateAddressMarkers();
              autoEstimateIfReady();
              updateDeliverySummary();
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
  function handleStopListChange(){
    try {
      normalizeStopOrder();
      updateAddressMarkers();
      updateSubmitVisibility();
      updateDeliverySummary();
      autoEstimateIfReady({ source: 'address', immediate: true });
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
        handleStopListChange();
      } catch(_) {}
    });
    if (h) w.appendChild(h);
    w.appendChild(i);
    w.appendChild(del);
    qStopsWrap.appendChild(w);
    attachAutocomplete(i);
    attachStopDragHandlers(w);
    attachAddressInputHandlers(i);
      handleStopListChange();
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
      if (!isInServiceLatLng(ll)) {
        clearRouteOverlays();
        const msg = i18n('quoteOutsideService') || 'Outside service map — please contact us for a custom quote.';
        const detail = i18n('quoteOutsideServiceDetail') || 'Contact us for orders outside our service area.';
        setQuoteResultWithDebug(msg, 'Map click outside service area');
        setBreakdownLines([detail]);
        return;
      }
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
      autoEstimateIfReady({ source: 'address', immediate: true });
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
      syncDateDisplay();
      if (qTime) qTime.value = '';
      if (qPhoneCountry) qPhoneCountry.value = 'Spain (+34)';
      if (qOut) qOut.textContent = '';
      if (qRate) qRate.textContent = '';
      window._lastQuoteContext = null;
      resetGuidedFlowState(true);
      if (qDeliverySummary) {
        qDeliverySummary.classList.add('is-hidden');
        qDeliverySummary.innerHTML = '';
      }
      updateSubmitVisibility();
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
            if (el.id === 'quotePickup' || el.id === 'quoteDropoff' || el.id === 'quoteDateDisplay') return;
            if (el.type === 'checkbox' || el.type === 'radio') { el.checked = false; } else { el.value = ''; }
            if (el.dataset) { delete el.dataset.lat; delete el.dataset.lng; delete el.dataset.address; }
          } catch(_) {}
        });
        syncDateDisplay();
        if (qCargo) qCargo.value = 'regular';
        if (qPhoneCountry) qPhoneCountry.value = 'Spain (+34)';
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
        const infoText = i18n('quoteTraceInfo') || "Submitting a request does not charge you automatically. You can complete payment securely on this page after confirming your booking details.";
        traceInfo.setAttribute('aria-label', infoText);
        traceInfo.setAttribute('title', infoText);
      }
      setBookingStatus('');
      window._lastQuoteContext = null;
      resetGuidedFlowState(true);
      if (qDeliverySummary) {
        qDeliverySummary.classList.add('is-hidden');
        qDeliverySummary.innerHTML = '';
      }
      updateSubmitVisibility();
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
      autoEstimateIfReady({ source: 'address', immediate: true });
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
  function autoEstimateIfReady(options){
    const opts = options || {};
    const source = String(opts.source || 'address');
    const highlightErrors = !!opts.highlightErrors;
    const immediate = !!opts.immediate;
    const allowGuidedScroll = !shouldLockEstimatorPanel();
    try {
      updateAddressMarkers();
      const addressError = getAddressValidationError();
      if (addressError) {
        guidedScrolledToDateTime = false;
        guidedScrolledToCargo = false;
        if (highlightErrors && (source === 'address' || source === 'datetime' || source === 'cargo')) {
          setSectionValidationState('addresses', addressError);
        }
        return;
      }
      setSectionValidationState('addresses', '');

      if (allowGuidedScroll && !guidedScrolledToDateTime && qDateTimeSection) {
        guidedScrolledToDateTime = true;
        setTimeout(function(){
          scrollPanelToTop(qDateTimeSection, 8);
        }, 0);
      }

      const dateTimeError = getDateTimeValidationError();
      if (dateTimeError) {
        guidedScrolledToCargo = false;
        if (highlightErrors && (source === 'datetime' || source === 'cargo')) {
          setSectionValidationState('datetime', dateTimeError);
        }
        return;
      }
      setSectionValidationState('datetime', '');

      if (allowGuidedScroll && !guidedScrolledToCargo && qCargoSection) {
        guidedScrolledToCargo = true;
        setTimeout(function(){
          scrollPanelToTop(qCargoSection, 8);
        }, 0);
      }

      const cargoError = getCargoValidationError();
      if (cargoError) {
        if (highlightErrors && source === 'cargo') {
          setSectionValidationState('cargo', cargoError);
        }
        return;
      }
      setSectionValidationState('cargo', '');

      if (window._quoteAutoTimer) clearTimeout(window._quoteAutoTimer);
      window._quoteAutoTimer = setTimeout(function(){
        try { runEstimate(); } catch(_){}
      }, immediate ? 0 : 80);
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
                autoEstimateIfReady({ source: 'address', immediate: true });
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
            autoEstimateIfReady({ source: 'address', immediate: true });
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
        try {
          clearAddressMarker(i);
          w.remove();
          autoEstimateIfReady({ source: 'address', immediate: true });
        } catch(_) {}
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
              try {
                clearAddressMarker(i);
                i.parentElement.remove();
                autoEstimateIfReady({ source: 'address', immediate: true });
              } catch(_) {}
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
            try {
              clearAddressMarker(i);
              w.remove();
              autoEstimateIfReady({ source: 'address', immediate: true });
            } catch(_) {}
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
  function setInputLocationData(inputEl, loc, label){
    try {
      if (!inputEl || !loc) return;
      const lat = (typeof loc.lat === 'function') ? loc.lat() : loc.lat;
      const lng = (typeof loc.lng === 'function') ? loc.lng() : loc.lng;
      if (lat == null || lng == null) return;
      inputEl.dataset.lat = String(lat);
      inputEl.dataset.lng = String(lng);
      const addr = String(label || inputEl.value || '').trim();
      if (addr) inputEl.dataset.address = addr;
      const ll = (google.maps && google.maps.LatLng) ? new google.maps.LatLng(lat, lng) : { lat, lng };
      setAddressMarker(inputEl, ll);
      if (typeof updateSubmitVisibility === 'function') updateSubmitVisibility();
    } catch(_) {}
  }
  function buildBookingPayload(){
    const ctx = window._lastQuoteContext || null;
    if (!ctx) {
      return {
        error: i18n('quoteEstimateFirst') || 'Please calculate a quote first.',
        errorSection: 'cargo'
      };
    }
    const validation = getBookingValidationState();
    if (validation.error) {
      return {
        error: validation.error,
        errorSection: validation.section || 'booking'
      };
    }
    const name = String((qName && qName.value) || '').trim();
    const email = String((qEmail && qEmail.value) || '').trim();
    const phoneRaw = String((qPhone && qPhone.value) || '').trim();
    const phone = composePhoneWithCountry((qPhoneCountry && qPhoneCountry.value) || 'Spain (+34)', phoneRaw);
    const notes = String((qNotes && qNotes.value) || '').trim();
    const updatesPreference = String((qUpdates && qUpdates.value) || '').trim();
    const dateVal = (qDate && qDate.value) ? String(qDate.value) : '';
    const timeVal = (qTime && qTime.value) ? String(qTime.value) : '';
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
  function getBookingReturnState(){
    try {
      const params = new URLSearchParams(location.search || '');
      return {
        booking: String(params.get('booking') || '').trim().toLowerCase(),
        ref: String(params.get('ref') || '').trim().toUpperCase()
      };
    } catch(_) {
      return { booking: '', ref: '' };
    }
  }
  function clearBookingReturnParams(){
    try {
      const url = new URL(window.location.href);
      const hasBooking = url.searchParams.has('booking') || url.searchParams.has('ref');
      if (!hasBooking) return;
      url.searchParams.delete('booking');
      url.searchParams.delete('ref');
      const query = url.searchParams.toString();
      const next = url.pathname + (query ? ('?' + query) : '') + (url.hash || '');
      window.history.replaceState({}, document.title, next);
    } catch(_) {}
  }
  async function postBookingAction(payload){
    const base = String(BOOKING_API_BASE || '').replace(/\/$/, '');
    if (!base) throw new Error('Booking API unavailable');
    const form = new URLSearchParams();
    form.set('payload', JSON.stringify(payload || {}));
    const res = await fetch(base, { method: 'POST', body: form });
    const json = await res.json();
    if (!res.ok || (json && json.error)) {
      throw new Error((json && json.error) || 'Booking action failed');
    }
    return json;
  }
  async function syncPaymentReturnStatus(reference, outcome, paymentUrl){
    const ref = String(reference || '').trim().toUpperCase();
    const result = String(outcome || '').trim().toLowerCase();
    if (!ref || !result || !BOOKING_API_BASE) return null;
    try {
      return await postBookingAction({
        action: 'paymentReturn',
        reference: ref,
        outcome: result,
        paymentUrl: String(paymentUrl || '').trim()
      });
    } catch(_) {
      return null;
    }
  }
  function buildSupportWhatsAppUrl(reference){
    const ref = String(reference || '').trim();
    const msg = i18n('bookingSupportWhatsappMessage', { ref }) || ('Hello Cargoworks, I need help with order ' + ref + '.');
    return 'https://wa.me/34608081955?text=' + encodeURIComponent(msg);
  }
  function renderBookingConfirmedMessage(reference, trackingUrl){
    if (!qBookingStatus) return;
    const ref = String(reference || '').trim().toUpperCase();
    const trackHref = trackingUrl || buildTrackingUrlFromRef(ref);

    const wrap = document.createElement('div');
    wrap.className = 'booking-confirmation';

    const title = document.createElement('p');
    title.className = 'booking-confirmation-title';
    title.textContent = i18n('bookingConfirmedTitle') || 'Booking confirmed';
    wrap.appendChild(title);

    const body = document.createElement('p');
    body.className = 'booking-confirmation-text';
    body.textContent = i18n('bookingConfirmedBody') || 'Your delivery has been successfully booked.';
    wrap.appendChild(body);

    const order = document.createElement('p');
    order.className = 'booking-confirmation-order';
    order.textContent = i18n('bookingOrderIdLine', { ref }) || ('Order ID: ' + ref);
    wrap.appendChild(order);

    const realtime = document.createElement('p');
    realtime.className = 'booking-confirmation-text';
    realtime.textContent = i18n('bookingRealtimeTrackNote') || 'You can track the delivery in real time.';
    wrap.appendChild(realtime);

    if (trackHref) {
      const actions = document.createElement('div');
      actions.className = 'booking-confirmation-actions';
      const trackBtn = document.createElement('a');
      trackBtn.className = 'btn';
      trackBtn.href = trackHref;
      trackBtn.target = '_blank';
      trackBtn.rel = 'noopener';
      trackBtn.textContent = i18n('bookingTrackDelivery') || 'Track delivery';
      actions.appendChild(trackBtn);
      wrap.appendChild(actions);
    }

    const support = document.createElement('p');
    support.className = 'booking-confirmation-support';
    support.appendChild(document.createTextNode(i18n('bookingSupportIntro') || 'A confirmation email with the delivery details has been sent to you.'));
    support.appendChild(document.createElement('br'));
    support.appendChild(document.createTextNode(i18n('bookingSupportOrderIdNote') || 'If you need to update anything about this order, please contact support and include your order ID.'));
    support.appendChild(document.createElement('br'));

    const emailLink = document.createElement('a');
    emailLink.href = 'mailto:info@cargoworks.es';
    emailLink.textContent = 'info@cargoworks.es';
    support.appendChild(emailLink);

    support.appendChild(document.createTextNode(' · '));

    const waLink = document.createElement('a');
    waLink.href = buildSupportWhatsAppUrl(ref);
    waLink.target = '_blank';
    waLink.rel = 'noopener';
    waLink.textContent = '+34 608 08 19 55 (WhatsApp)';
    support.appendChild(waLink);

    wrap.appendChild(support);
    setBookingStatusHtml([wrap], false);
  }
  async function handleBookingReturnFromQuery(){
    const state = getBookingReturnState();
    if (!state.booking || !state.ref) return;

    const ref = state.ref;
    const trackingUrl = buildTrackingUrlFromRef(ref);
    const booking = state.booking;
    const outcome = (booking === 'success' || booking === 'return')
      ? 'success'
      : 'failed';

    await syncPaymentReturnStatus(ref, outcome, '');

    if (outcome === 'success') {
      hidePaymentMount();
      resetBookingFieldsAfterSuccess();
      renderBookingConfirmedMessage(ref, trackingUrl);
    } else if (outcome === 'pending') {
      const note = i18n('bookingPaymentPending') || 'Payment is still pending for this order.';
      const trackNote = i18n('bookingTrackPrompt') || 'You can track your order status here:';
      const link = buildStatusLink(trackingUrl, i18n('bookingTrackingLink') || 'Tracking link');
      setBookingStatusHtml([note + ' ' + trackNote + ' ', link], true);
    } else {
      const fail = i18n('bookingPaymentFailed') || 'Payment failed. Please contact support and include your order ID.';
      setBookingStatus((ref ? (fail + ' ' + ref) : fail), true);
    }

    clearBookingReturnParams();
  }
  async function renderEmbeddedPayment(clientSecret, trackingUrl, reference, paymentUrl, publishableKey){
    if (!qPaymentMount) return false;
    const stripePublishableKey = String(publishableKey || window.CARGOWORKS_STRIPE_PUBLISHABLE_KEY || '').trim();
    if (!stripePublishableKey || !window.Stripe || !clientSecret) return false;
    lastEmbeddedMountError = '';

    hidePaymentMount();
    qPaymentMount.innerHTML = '';

    const intro = document.createElement('p');
    intro.className = 'quote-payment-intro';
    intro.textContent = i18n('quotePaymentInlineIntro') || 'Complete your payment below to confirm your booking.';
    qPaymentMount.appendChild(intro);

    const host = document.createElement('div');
    host.className = 'quote-payment-frame';
    host.style.border = '0';
    host.style.background = 'transparent';
    host.style.minHeight = '540px';
    qPaymentMount.appendChild(host);

    const footer = document.createElement('p');
    footer.className = 'quote-payment-fallback';
    if (trackingUrl) {
      footer.appendChild(buildStatusLink(trackingUrl, i18n('bookingTrackingLink') || 'Tracking link'));
    }
    if (reference) {
      const refNode = document.createElement('span');
      refNode.textContent = ' · ' + (i18n('bookingRefLabel', { ref: reference }) || ('Ref: ' + reference));
      footer.appendChild(refNode);
    }
    qPaymentMount.appendChild(footer);

    const stripe = window.Stripe(stripePublishableKey);
    if (!stripe) return false;
    try {
      activeEmbeddedCheckout = await stripe.initEmbeddedCheckout({
        fetchClientSecret: function(){ return Promise.resolve(clientSecret); },
        onComplete: function(){
          try {
            syncPaymentReturnStatus(reference, 'success', paymentUrl);
            hidePaymentMount();
            resetBookingFieldsAfterSuccess();
            renderBookingConfirmedMessage(reference, trackingUrl);
          } catch(_) {}
        }
      });
      activeEmbeddedCheckout.mount(host);
      qPaymentMount.classList.remove('is-hidden');
      paymentFrameVisible = true;
      scrollPanelToCenter(qPaymentMount);
      return true;
    } catch(err) {
      lastEmbeddedMountError = (err && err.message) ? String(err.message) : 'Embedded checkout initialization failed';
      try { console.error('[Cargoworks payment] Embedded mount failed', err); } catch(_) {}
      hidePaymentMount();
      return false;
    }
  }
  async function startInlinePayment(){
    try {
      if (!BOOKING_API_BASE) {
        setBookingStatus(i18n('quoteBookingNotConfigured') || 'Booking is not configured yet.', true);
        return;
      }
      const payload = buildBookingPayload();
      if (payload.error) {
        const errorSection = String(payload.errorSection || '').trim();
        if (errorSection) {
          setSectionValidationState(errorSection, payload.error);
          const targetSection = sectionByKey(errorSection);
          if (targetSection) {
            if (errorSection === 'booking') bookingDetailsRevealed = true;
            updateSubmitVisibility();
            scrollPanelToTop(targetSection, 8);
          }
        }
        setBookingStatus(payload.error, true);
        return;
      }
      setSectionValidationState('booking', '');
      const base = BOOKING_API_BASE.replace(/\/$/, '');
      if (qPayNow) qPayNow.disabled = true;
      if (qSubmit) qSubmit.disabled = true;
      setBookingStatus(i18n('quotePaymentPreparing') || 'Preparing secure payment...');
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
      const paymentUrl = json && json.paymentUrl ? String(json.paymentUrl) : '';
      const paymentClientSecret = json && json.paymentClientSecret ? String(json.paymentClientSecret) : '';
      const paymentMode = json && json.paymentMode ? String(json.paymentMode) : '';
      const responsePublishableKey = json && json.paymentPublishableKey ? String(json.paymentPublishableKey) : '';
      const publishableKey = String(window.CARGOWORKS_STRIPE_PUBLISHABLE_KEY || responsePublishableKey || '').trim();
      const hasPublishableKey = !!publishableKey;
      const trackingUrl = json && json.trackingUrl ? String(json.trackingUrl) : (ref ? buildTrackingUrlFromRef(ref) : '');
      const paymentError = json && json.paymentError ? String(json.paymentError) : '';
      const paymentEmbeddedError = json && json.paymentEmbeddedError ? String(json.paymentEmbeddedError) : '';

      try {
        console.info('[Cargoworks payment]', {
          reference: ref,
          paymentMode: paymentMode || 'unknown',
          hasPaymentUrl: !!paymentUrl,
          hasClientSecret: !!paymentClientSecret,
          hasPublishableKey: hasPublishableKey,
          paymentError: paymentError || '',
          paymentEmbeddedError: paymentEmbeddedError || ''
        });
      } catch(_) {}

      if (paymentClientSecret && !hasPublishableKey) {
        hidePaymentMount();
        setBookingStatus(
          i18n('quotePaymentMissingPublishableKey') || 'Missing Stripe publishable key. Set window.CARGOWORKS_STRIPE_PUBLISHABLE_KEY or STRIPE_PUBLISHABLE in Apps Script properties.',
          true
        );
        return;
      }
      if (paymentMode === 'embedded' && paymentClientSecret) {
        const mounted = await renderEmbeddedPayment(paymentClientSecret, trackingUrl, ref, paymentUrl, publishableKey);
        if (mounted) {
          setBookingStatus(i18n('quotePaymentReady') || 'Payment session ready. Complete payment to confirm your booking.');
          return;
        }
      }
      if (paymentClientSecret && paymentMode !== 'hosted') {
        const mounted = await renderEmbeddedPayment(paymentClientSecret, trackingUrl, ref, paymentUrl, publishableKey);
        if (mounted) {
          setBookingStatus(i18n('quotePaymentReady') || 'Payment session ready. Complete payment to confirm your booking.');
          return;
        }
      }
      const embeddedFailure = paymentEmbeddedError || lastEmbeddedMountError || paymentError;
      if (paymentUrl && !paymentClientSecret) {
        hidePaymentMount();
        setBookingStatus(i18n('quotePaymentOnSiteRequired') || 'On-site payment is required to complete this order. Please try again.', true);
        return;
      }
      if (paymentError || lastEmbeddedMountError) {
        if (ref && embeddedFailure) {
          await syncPaymentReturnStatus(ref, 'failed', paymentUrl);
        }
        const errLabel = embeddedFailure;
        setBookingStatus(errLabel || (i18n('quotePaymentUnavailable') || 'Payment could not be initialized. Please try again.'), true);
      } else {
        setBookingStatus(i18n('quotePaymentOnSiteRequired') || 'On-site payment is required to complete this order. Please try again.', true);
      }
    } catch(e) {
      setBookingStatus(i18n('quotePaymentStartError') || 'Could not start payment. Please try again.', true);
    } finally {
      if (qPayNow) qPayNow.disabled = false;
      if (qSubmit) qSubmit.disabled = false;
    }
  }
  let estimateSeq = 0;
  function invalidateEstimate(){
    estimateSeq++;
    window._lastQuoteContext = null;
    bookingDetailsRevealed = false;
    quoteSummaryAutoScrolled = false;
    setSectionValidationState('booking', '');
    if (!hasReadyPickupDrop()) {
      guidedScrolledToDateTime = false;
      guidedScrolledToCargo = false;
      setSectionValidationState('addresses', '');
    }
    if (!hasDateTimeSelection()) {
      guidedScrolledToCargo = false;
      setSectionValidationState('datetime', '');
    }
    if (!cargoExplicitlyConfirmed) setSectionValidationState('cargo', '');
    hidePaymentMount();
    updateSubmitVisibility();
  }
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
      if (pickupLoc) setInputLocationData(pickupEl, pickupLoc, pickupQ);
      const dropLoc = getLocationForInput(dropEl) || await geocodeOne(dropQ);
      if (seq !== estimateSeq) return;
      if (dropLoc) setInputLocationData(dropEl, dropLoc, dropQ);
      const stopLocs = [];
      const stopAddrs = [];
      for (let idx = 0; idx < stopInputs.length; idx++){
        const el = stopInputs[idx];
        const val = (el && el.value || '').trim();
        if (!val) continue;
        const loc = getLocationForInput(el) || await geocodeOne(val);
        if (seq !== estimateSeq) return;
        if (loc) {
          stopLocs.push(loc);
          stopAddrs.push((el && el.dataset && el.dataset.address) || val);
          setInputLocationData(el, loc, val);
        }
      }
      updateAddressMarkers();
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
      perKm = Math.round((perKm * 1.1) * 100) / 100;
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
      const addressFeeCount = stopLocs.length + 1; // dropoff + stops (exclude pickup)
      const addressFeePer = addressFeeCount >= 3 ? 1.25 : 0;
      const addressFee = Math.round((addressFeePer * addressFeeCount) * 100) / 100;
      const preMinSubtotal = Math.round((distanceTotal + pickupCharge) * 100) / 100;
      let subtotal = Math.round((distanceTotal + pickupCharge) * 100) / 100;
      if (minimum && subtotal < minimum) subtotal = minimum;
      subtotal = Math.round((subtotal + addressFee) * 100) / 100;
      const cargoInfo = getCargoAdjustment();
      const cargoAmount = Math.round((subtotal * (cargoInfo.rate || 0)) * 100) / 100;
      subtotal = Math.round((subtotal + cargoAmount) * 100) / 100;
      const surchargeInfo = computeSurchargeInfo();
      const surchargeAmount = Math.round((subtotal * (surchargeInfo.rate || 0)) * 100) / 100;
      const weekendSurchargeAmount = Math.round((subtotal * (surchargeInfo.isWeekendHoliday ? surchargeInfo.weekendRate : 0)) * 100) / 100;
      const afterHoursSurchargeAmount = Math.round((subtotal * (surchargeInfo.afterHours ? surchargeInfo.afterRate : 0)) * 100) / 100;
      const subtotalBeforeDiscount = Math.round((subtotal + surchargeAmount) * 100) / 100;
      const discountInfo = resolveDiscountsForEstimate(subtotalBeforeDiscount, surchargeInfo.dateKey, cur);
      const discountAmount = Math.round((discountInfo.totalDiscount || 0) * 100) / 100;
      const discountItems = Array.isArray(discountInfo.applied) ? discountInfo.applied : [];
      const preVatTotal = Math.max(0, Math.round((subtotalBeforeDiscount - discountAmount) * 100) / 100);
      const vatAmount = Math.round((preVatTotal * VAT_RATE) * 100) / 100;
      const total = Math.round((preVatTotal + vatAmount) * 100) / 100;
      const vatRatePercent = Math.round(VAT_RATE * 100);
      const travelSecsAfterPickup = legs.reduce((a, l) => a + (Number(l.sec||0)||0), 0);
      const travelMins = Math.round(travelSecsAfterPickup / 60);
      const serviceMins = 5 + (3 * (stopInputs.length + 1));
      const etaTotalMins = travelMins + serviceMins;
      const info = 'Mode=distance · perKm=' + perKm.toFixed(2) + ' (pickup zone ' + pickupZone + ')' + (cargoInfo.rate ? (' · cargo ' + Math.round(cargoInfo.rate * 100) + '%') : '') + (surchargeInfo.rate ? (' · surcharge ' + Math.round(surchargeInfo.rate * 100) + '%') : '') + (discountAmount ? (' · discount ' + cur + discountAmount.toFixed(2)) : '') + (' · VAT ' + vatRatePercent + '% ' + cur + vatAmount.toFixed(2));
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
        subtotal: subtotalBeforeDiscount,
        preVatTotal,
        vatRate: VAT_RATE,
        vatAmount,
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
        subtotal: subtotalBeforeDiscount,
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
        legKms: parts.map(function(part){ return Number(part && part.km || 0) || 0; }),
        legPrices: parts.map(function(part){ return Number(part && part.price || 0) || 0; }),
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
        discountTotal: discountAmount,
        vatRate: VAT_RATE,
        vatAmount
      });
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      const recalculated = i18n('quoteRecalculatedAt', { time: (hh + ':' + mm + ':' + ss) }) || ('Recalculated at ' + hh + ':' + mm + ':' + ss);
      const traceInfo = document.getElementById('quoteTraceInfoIcon');
      if (traceInfo) {
        const infoText = i18n('quoteTraceInfo') || "Submitting a request does not charge you automatically. You can complete payment securely on this page after confirming your booking details.";
        traceInfo.setAttribute('aria-label', infoText);
        traceInfo.setAttribute('title', infoText);
      }
      window._lastQuoteContext = {
        createdAt: new Date().toISOString(),
        cur: cur,
        currency: cur,
        total: total,
        subtotal: subtotalBeforeDiscount,
        preVatTotal: preVatTotal,
        vatRate: VAT_RATE,
        vatAmount: vatAmount,
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
          subtotalBeforeDiscount: subtotalBeforeDiscount,
          preVatTotal: preVatTotal,
          vatRate: VAT_RATE,
          vatAmount: vatAmount,
          pickupCharge: pickupCharge,
          distanceTotal: distanceTotal,
          addressFee: addressFee,
          surchargeAmount: surchargeAmount,
          discountAmount: discountAmount
        }
      };
      updateDeliverySummary();
      updateSubmitVisibility();
      if (!quoteSummaryAutoScrolled) {
        quoteSummaryAutoScrolled = true;
        setTimeout(function(){
          try {
            if (qSummaryCard) scrollPanelToTop(qSummaryCard, 10);
          } catch(_) {}
        }, 0);
      }
      try { refreshAvailability(); } catch(_) {}
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
  if (qPayNow) { qPayNow.addEventListener('click', startInlinePayment); }
  if (qSubmit) { qSubmit.addEventListener('click', startInlinePayment); }
  handleBookingReturnFromQuery();
  

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
