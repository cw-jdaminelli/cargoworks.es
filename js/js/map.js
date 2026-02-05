// Zones map with Google Maps, Snazzy style, geocoding, and optional zone editing
window.initZonesMap = function initZonesMap(){
  if (window._zonesMapInitialized) { try { console.log('[Maps] initZonesMap: already initialized'); } catch(_) {} return; }
  try { console.log('[Maps] initZonesMap start'); } catch(e) {}
  const STYLE_VERSION = '2026-01-24-1';
  const ZONES_VERSION = '2026-01-24-1';
  const PRICES_VERSION = '2026-01-24-1';
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
    zoom: 12,
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
    try { if (!editMode) handleMapClick(e && e.latLng); } catch(_) {}
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
        if (!bounds.isEmpty()) map.fitBounds(bounds);
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
        const curr = (json && json.currency) || 'EUR';
        function symbolForCurrency(code){
          switch(String(code||'').toUpperCase()){ case 'EUR': return '€'; case 'USD': return '$'; case 'GBP': return '£'; default: return '€'; }
        }
        window._currencySymbol = symbolForCurrency(curr);
      })
      .catch(() => { window._zonePrices = {}; });
  })();

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
  function isAddressInput(el){
    return !!(el && el.tagName === 'INPUT' && (el.id === 'quotePickup' || el.id === 'quoteDropoff' || el.classList.contains('quote-stop')));
  }
  document.addEventListener('focusin', function(e){
    const el = e && e.target;
    if (isAddressInput(el)) lastAddressInput = el;
  });
  function collectAddressInputs(){
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
    } catch(_) {}
  }
  function attachAddressInputHandlers(inputEl){
    try {
      if (!inputEl) return;
      inputEl.addEventListener('input', function(){
        const val = String(inputEl.value || '').trim();
        const stored = String((inputEl.dataset && inputEl.dataset.address) || '').trim();
        if (!stored) { clearAddressMarker(inputEl); return; }
        if (val !== stored) {
          clearStoredLocation(inputEl);
          clearRouteOverlays();
          updateAddressMarkers();
        }
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
  // Note: Removed helper that converted destination into the first stop.
  const qEstimate = document.getElementById('quoteEstimate');
  const qOptimize = document.getElementById('quoteOptimize');
  const qOut = document.getElementById('quoteResult');
  const qRate = document.getElementById('quoteRate');
  const qAddRandomStop = document.getElementById('quoteAddRandomStop');
  const qLoadRandom = document.getElementById('quoteLoadRandom');
  const qRefresh = document.getElementById('quoteRefresh');
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
      meta.textContent = 'Recalculated at ' + hh + ':' + mm + ':' + ss;
      box.appendChild(meta);
      qOut.appendChild(box);
    } catch(_) {}
  }
  function attachAutocomplete(inputEl){
    try {
      if (!inputEl || !google.maps.places) return;
      // Use classic Places Autocomplete only; avoid experimental PlaceAutocompleteElement
      if (google.maps.places.Autocomplete) {
        const ac = new google.maps.places.Autocomplete(inputEl);
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
  // Drag & drop ordering for stop inputs
  function attachStopDragHandlers(el){
    try {
      if (!el) return;
      el.draggable = true;
      function swapInputValues(a, b){
        try {
          if (!a || !b) return;
          const tmpVal = a.value;
          const tmpLat = a.dataset.lat; const tmpLng = a.dataset.lng; const tmpAddr = a.dataset.address;
          a.value = b.value;
          a.dataset.lat = b.dataset.lat || '';
          a.dataset.lng = b.dataset.lng || '';
          a.dataset.address = b.dataset.address || '';
          b.value = tmpVal;
          if (tmpLat != null) b.dataset.lat = tmpLat; else delete b.dataset.lat;
          if (tmpLng != null) b.dataset.lng = tmpLng; else delete b.dataset.lng;
          if (tmpAddr != null) b.dataset.address = tmpAddr; else delete b.dataset.address;
        } catch(_) {}
      }
      // Allow dropping directly on an item to swap positions
      el.addEventListener('dragover', function(e){ try { e.preventDefault(); } catch(_){} });
      el.addEventListener('drop', function(e){
        try {
          e.preventDefault();
          e.stopPropagation();
          const dragged = window._draggedStop;
          if (!dragged || dragged === el) return;
          const parent = el.parentElement;
          if (!parent || parent !== dragged.parentElement) return;
          const roleDragged = (dragged && dragged.dataset && dragged.dataset.role) || 'stop';
          const roleTarget = (el && el.dataset && el.dataset.role) || 'stop';
          const inA = dragged.querySelector && dragged.querySelector('.quote-stop');
          const inB = el.querySelector && el.querySelector('.quote-stop');
          if (roleDragged !== 'stop' || roleTarget !== 'stop') {
            // If either side is pickup/drop, swap input values/coords instead of DOM position
            swapInputValues(inA, inB);
          } else {
            // Swap nodes using placeholders to avoid DOM reflow issues
            const phA = document.createElement('div');
            const phB = document.createElement('div');
            parent.replaceChild(phA, dragged);
            parent.replaceChild(phB, el);
            parent.replaceChild(dragged, phB);
            parent.replaceChild(el, phA);
          }
          // Recompute after swap
          try { if (typeof runEstimate === 'function') runEstimate(); } catch(_){ }
        } catch(_){ }
      });
      el.addEventListener('dragstart', function(){
        try { window._draggedStop = el; el.classList.add('dragging'); } catch(_) {}
      });
      el.addEventListener('dragend', function(){
        try { el.classList.remove('dragging'); window._draggedStop = null; } catch(_){ }
      });
      // Make inner input draggable too, so all stops (pre-existing or added) can be dragged by grabbing the input
      const input = el.querySelector && el.querySelector('.quote-stop');
      if (input) {
        input.draggable = true;
        input.addEventListener('dragstart', function(){
          try { window._draggedStop = el; el.classList.add('dragging'); } catch(_) {}
        });
        input.addEventListener('dragend', function(){
          try { el.classList.remove('dragging'); window._draggedStop = null; } catch(_){ }
        });
        // Support swapping when dropping directly onto the input element
        input.addEventListener('dragover', function(e){ try { e.preventDefault(); } catch(_){} });
        input.addEventListener('drop', function(e){
          try {
            e.preventDefault();
            e.stopPropagation();
            const dragged = window._draggedStop;
            if (!dragged || dragged === el) return;
            const parent = el.parentElement;
            if (!parent || parent !== dragged.parentElement) return;
            const roleDragged = (dragged && dragged.dataset && dragged.dataset.role) || 'stop';
            const roleTarget = (el && el.dataset && el.dataset.role) || 'stop';
            const inA = dragged.querySelector && dragged.querySelector('.quote-stop');
            const inB = el.querySelector && el.querySelector('.quote-stop');
            if (roleDragged !== 'stop' || roleTarget !== 'stop') {
              swapInputValues(inA, inB);
            } else {
              const phA = document.createElement('div');
              const phB = document.createElement('div');
              parent.replaceChild(phA, dragged);
              parent.replaceChild(phB, el);
              parent.replaceChild(dragged, phB);
              parent.replaceChild(el, phA);
            }
            try { if (typeof runEstimate === 'function') runEstimate(); } catch(_){ }
          } catch(_){ }
        });
      }
    } catch(_){ }
  }
  // Create a stop item and return its input element
  function createStopItem(){
    if (!qStopsWrap) return null;
    const w = document.createElement('div');
    w.className = 'quote-stop-item';
    w.draggable = true;
    const h = document.createElement('span');
    h.className = 'drag-handle';
    h.setAttribute('title', i18n('dragHandleLabel') || 'Drag to reorder');
    h.innerHTML = '<i class="fa fa-bars" aria-hidden="true"></i>';
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
    w.appendChild(h);
    w.appendChild(i);
    w.appendChild(del);
    qStopsWrap.appendChild(w);
    attachAutocomplete(i);
    attachStopDragHandlers(w);
    attachAddressInputHandlers(i);
    return i;
  }
  function pickTargetInputForMapClick(){
    const pickupEl = document.getElementById('quotePickup');
    const dropEl = document.getElementById('quoteDropoff');
    const stopInputs = qStopsWrap
      ? Array.from(qStopsWrap.querySelectorAll('.quote-stop-item')).filter(function(w){
          return ((w && w.dataset && w.dataset.role) || 'stop') === 'stop';
        }).map(function(w){ return w.querySelector && w.querySelector('.quote-stop'); }).filter(Boolean)
      : [];
    const ordered = [pickupEl, dropEl].concat(stopInputs).filter(Boolean);
    const empty = ordered.find(function(inp){ return !(inp && (inp.value || '').trim()); }) || null;
    return empty || createStopItem();
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
  async function addRandomStopAndEstimate(){
    try {
      if (window._addingRandomStop) return; window._addingRandomStop = true;
      const pickupEl = document.getElementById('quotePickup');
      const dropEl = document.getElementById('quoteDropoff');
      const used = collectUsedLocationKeys();
      const stopItems = qStopsWrap
        ? Array.from(qStopsWrap.querySelectorAll('.quote-stop-item')).filter(function(w){
            return ((w && w.dataset && w.dataset.role) || 'stop') === 'stop';
          })
        : [];
      const stopInputs = stopItems.map(function(w){
        return w.querySelector && w.querySelector('.quote-stop');
      }).filter(Boolean);
      const randomItem = await pickRandomServiceAddress(used);
      if (!randomItem) { try { setQuoteResultWithDebug(i18n('quoteOutsideService') || 'Outside service map — please contact us for a custom quote.', 'Random address generation failed within service area'); } catch(_) {} return; }
      const orderedInputs = [pickupEl, dropEl].concat(stopInputs).filter(Boolean);
      const focusedInput = (lastAddressInput && document.contains(lastAddressInput) && isAddressInput(lastAddressInput))
        ? lastAddressInput
        : null;
      const emptyInput = orderedInputs.find(function(inp){
        return inp && !(inp.value || '').trim();
      }) || null;
      const targetInput = focusedInput || emptyInput || createStopItem();
      if (targetInput) setKnownLocation(targetInput, randomItem);
      if (focusedInput) lastAddressInput = null;
      try { if (typeof runEstimate === 'function') runEstimate(); } catch(_){ }
    } catch(_){
    } finally { try { window._addingRandomStop = false; } catch(__){} }
  }
  async function loadRandomScenario(){
    try {
      const pickupEl = document.getElementById('quotePickup');
      const dropEl = document.getElementById('quoteDropoff');
      if (!pickupEl || !dropEl) return;
      // Clear existing stops
      if (qStopsWrap) {
        Array.from(qStopsWrap.querySelectorAll('.quote-stop-item')).forEach(function(w){
          const role = (w && w.dataset && w.dataset.role) || 'stop';
          if (role === 'stop') w.remove();
        });
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
  function resetEstimator(){
    try {
      const pickupEl = document.getElementById('quotePickup');
      const dropEl = document.getElementById('quoteDropoff');
      if (pickupEl) { pickupEl.value = ''; delete pickupEl.dataset.lat; delete pickupEl.dataset.lng; delete pickupEl.dataset.address; }
      if (dropEl) { dropEl.value = ''; delete dropEl.dataset.lat; delete dropEl.dataset.lng; delete dropEl.dataset.address; }
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
      }
      // Clear outputs and overlays
      if (qOut) qOut.textContent = '';
      clearRouteOverlays();
    } catch(_){}
  }
  if (qAddRandomStop) qAddRandomStop.addEventListener('click', addRandomStopAndEstimate);
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
  if (qStopsWrap) {
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
    return !!(qPickup && qDrop && getLocationForInput(qPickup) && getLocationForInput(qDrop));
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
                if (typeof runEstimate === 'function') runEstimate();
              } catch(_) {}
            });
            parent.appendChild(delExisting);
          }
          return;
        }
        var w = document.createElement('div');
        w.className = 'quote-stop-item';
        w.draggable = true;
        w.dataset.role = role;
        var h = document.createElement('span');
        h.className = 'drag-handle';
        h.setAttribute('title', i18n('dragHandleLabel') || 'Drag to reorder');
        h.innerHTML = '<i class="fa fa-bars" aria-hidden="true"></i>';
        if (inputEl.parentElement) inputEl.parentElement.insertBefore(w, inputEl);
        w.appendChild(h);
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
    } catch(_) {}
  })();
  // Allow clicking the map to add a pinpoint and fill the next field
  try {
    map.addListener('click', function(e){
      try {
        if (editMode) return;
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
      w.draggable = true;
      const h = document.createElement('span');
      h.className = 'drag-handle';
      h.setAttribute('title', i18n('dragHandleLabel') || 'Drag to reorder');
      h.innerHTML = '<i class="fa fa-bars" aria-hidden="true"></i>';
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
      del.innerHTML = '<i class="fa fa-trash" aria-hidden="true"></i>';
      del.addEventListener('click', function(){
        try { clearAddressMarker(i); w.remove(); if (typeof runEstimate === 'function') runEstimate(); } catch(_) {}
      });
      w.appendChild(h);
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
          if (!i.parentElement.querySelector('.drag-handle')) {
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
          w.draggable = true;
          const h = document.createElement('span');
          h.className = 'drag-handle';
          h.setAttribute('title', i18n('dragHandleLabel') || 'Drag to reorder');
          h.innerHTML = '<i class="fa fa-bars" aria-hidden="true"></i>';
          i.parentElement ? i.parentElement.insertBefore(w, i) : qStopsWrap.appendChild(w);
          w.appendChild(h);
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
  async function runEstimate(){
    const pickupEl = document.getElementById('quotePickup');
    const dropEl = document.getElementById('quoteDropoff');
    const pickupQ = (pickupEl && pickupEl.value || '').trim();
    const dropQ = (dropEl && dropEl.value || '').trim();
    if (!pickupQ || !dropQ) { if (qOut) qOut.textContent = i18n('quoteEnterBoth') || 'Enter pickup and dropoff'; return; }
    const stopInputs = qStopsWrap ? Array.from(qStopsWrap.querySelectorAll('.quote-stop-item')).filter(function(w){ return ((w && w.dataset && w.dataset.role) || 'stop') === 'stop'; }).map(function(w){ return w.querySelector('.quote-stop'); }) : [];
    try {
      const origin = getZoneCenterLatLng('1');
      const pickupLoc = getLocationForInput(pickupEl) || await geocodeOne(pickupQ);
      const dropLoc = getLocationForInput(dropEl) || await geocodeOne(dropQ);
      const stopLocs = [];
      const stopAddrs = [];
      for (let idx = 0; idx < stopInputs.length; idx++){
        const el = stopInputs[idx];
        const val = (el && el.value || '').trim();
        if (!val) continue;
        const loc = getLocationForInput(el) || await geocodeOne(val);
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
      let distanceTotal = Math.round((totalKm * perKm) * 100) / 100;
      // Pickup zone full base charge
      const base = basePriceForZone(pickupZone);
      const pickupCharge = Math.round((base) * 100) / 100;
      let total = Math.round((distanceTotal + pickupCharge) * 100) / 100;
      if (minimum && total < minimum) total = minimum;
      const travelSecsAfterPickup = legs.reduce((a, l) => a + (Number(l.sec||0)||0), 0);
      const travelMins = Math.round(travelSecsAfterPickup / 60);
      const serviceMins = 5 + (3 * (stopInputs.length + 1));
      const etaTotalMins = travelMins + serviceMins;
      const info = 'Mode=distance · perKm=' + perKm.toFixed(2) + ' (pickup zone ' + pickupZone + ')';
      const summary = 'Order totals: ' + cur + total.toFixed(2) + ' / ' + totalKm.toFixed(2) + ' km / ' + etaTotalMins + ' min';
      // Build structured rundown per requested format (Address, Zone, Distances)
      const pickupAddr = (pickupEl && pickupEl.dataset && pickupEl.dataset.address) || pickupQ;
      const dropAddr = (dropEl && dropEl.dataset && dropEl.dataset.address) || dropQ;
      const z1Center = origin; // center of zone 1
      function km(a,b){ return Math.round(haversineKm(a,b) * 100) / 100; }
      const breakdownLines = [];
      const eurPerKm = totalKm > 0 ? (total / totalKm) : 0;
      const eurPerMin = etaTotalMins > 0 ? (total / etaTotalMins) : 0;
      const eurPerHour = etaTotalMins > 0 ? (total / (etaTotalMins / 60)) : 0;
      const eurPerHourHeadline = 'EUR/h: ' + cur + eurPerHour.toFixed(2);
      setQuoteResultWithDebug(summary, info, eurPerHourHeadline);
      breakdownLines.push('Order totals:');
      breakdownLines.push('EUR/km');
      breakdownLines.push(cur + eurPerKm.toFixed(2));
      breakdownLines.push('EUR/min');
      breakdownLines.push(cur + eurPerMin.toFixed(2));
      breakdownLines.push('EUR/h');
      breakdownLines.push(cur + eurPerHour.toFixed(2));
      // Pickup block
      breakdownLines.push('Pickup:');
      breakdownLines.push('Address');
      breakdownLines.push(String(pickupAddr||''));
      breakdownLines.push('Zone');
      breakdownLines.push(String(pickupZone||''));
      breakdownLines.push('Pickup price (EUR)');
      breakdownLines.push(cur + pickupCharge.toFixed(2));
      breakdownLines.push('Distance from center of zone 1');
      breakdownLines.push(km(z1Center, pickupLoc) + ' km');
      // Each Stop
      for (let i = 0; i < stopLocs.length; i++){
        breakdownLines.push('Stop ' + (i+1) + ':');
        breakdownLines.push('Address');
        breakdownLines.push(String(stopAddrs[i]||''));
        breakdownLines.push('Zone');
        breakdownLines.push(String(stopZoneNums[i]||''));
        breakdownLines.push('Distance from previous stop');
        const legMeters = Number(legs[i] && legs[i].meters || 0) || 0; // legs[0] = pickup->stop1
        const legKm = Math.round((legMeters/1000)*100)/100;
        const legPrice = Math.round((legKm * perKm)*100)/100;
        breakdownLines.push(legKm + ' km');
        breakdownLines.push('Price for leg (EUR)');
        breakdownLines.push(cur + legPrice.toFixed(2));
        breakdownLines.push('Raw calculation');
        breakdownLines.push(legKm.toFixed(2) + ' km × ' + cur + perKm.toFixed(2) + '/km = ' + cur + legPrice.toFixed(2));
      }
      // Dropoff block
      breakdownLines.push('Dropoff:');
      breakdownLines.push('Address');
      breakdownLines.push(String(dropAddr||''));
      breakdownLines.push('Zone');
      breakdownLines.push(String(dropZoneNum||''));
      breakdownLines.push('Distance from previous stop');
      const lastLegMeters = Number(legs[legs.length-1] && legs[legs.length-1].meters || 0) || 0;
      const lastKm = Math.round((lastLegMeters/1000)*100)/100;
      const lastPrice = Math.round((lastKm * perKm)*100)/100;
      breakdownLines.push(lastKm + ' km');
      breakdownLines.push('Price for leg (EUR)');
      breakdownLines.push(cur + lastPrice.toFixed(2));
      breakdownLines.push('Raw calculation');
      breakdownLines.push(lastKm.toFixed(2) + ' km × ' + cur + perKm.toFixed(2) + '/km = ' + cur + lastPrice.toFixed(2));
      breakdownLines.push('Distance from center of zone 1');
      breakdownLines.push(km(z1Center, dropLoc) + ' km');
      // Total ETA
      breakdownLines.push('Total ETA: (travel time + service time)');
      breakdownLines.push(travelMins + ' min + ' + serviceMins + ' min');
      setBreakdownLines(breakdownLines.filter(Boolean));
      return;
    } catch(e){
      if (qOut) setQuoteResultWithDebug(i18n('quoteCouldNotEstimate') || 'Could not estimate route — please check addresses and try again.', 'Error');
    }
  }
  // Trigger computation
  if (qEstimate) { qEstimate.addEventListener('click', runEstimate); }
  

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

// Diagnostics removed for simplicity during testing
