// Zones map with Google Maps, Snazzy style, geocoding, and optional zone editing
window.initZonesMap = function initZonesMap(){
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
  const center = { lat: 41.3874, lng: 2.1686 }; // Barcelona
  const map = new google.maps.Map(mapEl, {
    center,
    zoom: 12,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false
  });

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
  const qOut = document.getElementById('quoteResult');
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
  function attachAutocomplete(inputEl){
    try {
      if (!inputEl || !google.maps.places) return;
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
            }
          } catch(_) {}
        });
        return;
      }
      if (google.maps.places.PlaceAutocompleteElement) {
        const pae = new google.maps.places.PlaceAutocompleteElement();
        try {
          pae.inputElement = inputEl;
          if ('placeFields' in pae) pae.placeFields = ['formatted_address', 'geometry.location'];
          pae.addEventListener('place_changed', function(){
            try {
              const place = (typeof pae.getPlace === 'function') ? pae.getPlace() : (pae.place || null);
              const loc = place && place.geometry && place.geometry.location;
              if (loc) {
                inputEl.dataset.lat = String(loc.lat());
                inputEl.dataset.lng = String(loc.lng());
                inputEl.dataset.address = (place.formatted_address || inputEl.value);
              }
            } catch(_) {}
          });
          // Do NOT append the element to DOM to avoid extra black boxes
        } catch(_) {}
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
        } catch(_){}
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
          try { if (typeof runEstimate === 'function') runEstimate(); } catch(_){}
        } catch(_){}
      });
      el.addEventListener('dragstart', function(){
        try { window._draggedStop = el; el.classList.add('dragging'); } catch(_){}
      });
      el.addEventListener('dragend', function(){
        try { el.classList.remove('dragging'); window._draggedStop = null; } catch(_){}
      });
      // Make inner input draggable too, so all stops (pre-existing or added) can be dragged by grabbing the input
      const input = el.querySelector && el.querySelector('.quote-stop');
      if (input) {
        input.draggable = true;
        input.addEventListener('dragstart', function(){
          try { window._draggedStop = el; el.classList.add('dragging'); } catch(_){}}
        );
        input.addEventListener('dragend', function(){
          try { el.classList.remove('dragging'); window._draggedStop = null; } catch(_){}}
        );
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
            try { if (typeof runEstimate === 'function') runEstimate(); } catch(_){}
          } catch(_){}
        });
      }
    } catch(_){}
  }
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
  // attach autocomplete to primary inputs
  attachAutocomplete(qPickup);
  attachAutocomplete(qDrop);
  // Include pickup and drop as draggable items within the stops list
  (function ensurePrimaryInStops(){
    try {
      if (!qStopsWrap) return;
      function wrapIfNeeded(inputEl, role){
        if (!inputEl) return;
        var parent = inputEl.parentElement;
        var alreadyWrapped = parent && parent.classList && parent.classList.contains('quote-stop-item');
        if (alreadyWrapped) { parent.dataset.role = role; attachStopDragHandlers(parent); return; }
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
      w.appendChild(h);
      w.appendChild(i);
      qStopsWrap.appendChild(w);
      attachAutocomplete(i);
      attachStopDragHandlers(w);
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
          attachStopDragHandlers(i.parentElement);
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
          attachStopDragHandlers(w);
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
      for (let idx = 0; idx < stopInputs.length; idx++){
        const el = stopInputs[idx];
        const val = (el && el.value || '').trim();
        if (!val) continue;
        const loc = getLocationForInput(el) || await geocodeOne(val);
        if (loc) stopLocs.push(loc);
      }
      if (!pickupLoc || !dropLoc) { if (qOut) qOut.textContent = i18n('quoteAddressNotFound') || 'Address not found'; return; }
      const routeDetails = await computeRouteDetails(origin, [pickupLoc].concat(stopLocs), dropLoc);
      // Render route overlays on map
      renderRoute(pickupLoc, stopLocs, dropLoc, routeDetails);
      const durationSec = routeDetails.totalSec || 0;
      const isHourly = durationSec > 7200;
      if (isHourly) {
        const routeMins = Math.round(durationSec / 60);
        const over = Math.max(0, routeMins - 60);
        const quarters = Math.ceil(over / 15);
        const firstHour = 25;
        const quarterRate = 6;
        const price = firstHour + quarters * quarterRate;
        const breakdown = i18n('quoteHourlyBreakdown') || 'Includes 1h + 15-min increments';
        const legSecs = (routeDetails.legs||[]).map(l => (l && l.sec) || 0);
        let legMins = legSecs.map(s => Math.round(s/60));
        const sumLegMins = legMins.reduce((a,b) => a+b, 0);
        const diff = routeMins - sumLegMins;
        if (legMins.length && diff !== 0) { legMins[legMins.length - 1] += diff; }
        function fmtLegMins(m){
          const h = Math.floor(m/60);
          const mm = m % 60;
          const uh = i18n('quoteUnitHour') || 'h';
          const um = i18n('quoteUnitMinute') || 'min';
          return (h? (h + uh + ' ') : '') + (mm? (mm + ' ' + um) : '');
        }
        const labels = [];
        labels.push(i18n('quoteEtaLabelApproach') || 'Base → Pickup');
        for (let i = 0; i < stopLocs.length; i++) labels.push((i18n('quoteEtaLabelStop', { n: (i+1) }) || ('Stop ' + (i+1))));
        labels.push(i18n('quoteEtaLabelDropoff') || 'Dropoff');
        const etaParts = [];
        for (let i = 0; i < legMins.length; i++){
          const name = labels[i] || ('Leg '+(i+1));
          etaParts.push(name+': '+fmtLegMins(legMins[i]));
        }
        const etaStr = etaParts.length ? (i18n('quoteEtasPrefix', { list: etaParts.join(' · ') }) || ('ETAs: '+etaParts.join(' · '))) : '';
        if (qOut) {
          const h = Math.floor(routeMins/60);
          const mm = routeMins % 60;
          const routeStr = (h? (h+'h '):'') + (mm? (mm+' min'):'');
          const approachMins = legMins[0] || 0;
          const jobMins = legMins.slice(1).reduce((a,b)=>a+b,0);
          const approachStr = fmtLegMins(approachMins);
          const jobStr = fmtLegMins(jobMins);
          const cur = window._currencySymbol || '€';
          const text = i18n('quoteHourly', { currency: cur, price, route: routeStr, approach: approachStr, job: jobStr, breakdown, etas: (etaStr? (' ' + etaStr) : '') });
          qOut.textContent = text || (cur + price + ' hourly. Total ' + routeStr + ' (approach ' + approachStr + ', job ' + jobStr + '). ' + breakdown + '.' + (etaStr? (' ' + etaStr) : ''));
        }
        return;
      }
      // Combined pricing: distance dominates + half-zone pickup charge
      const cur = window._currencySymbol || '€';
      const dp = window._distancePricing || {};
      let perKm = Number(dp && dp.perKm);
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
        const line = (fromLabel + ' → ' + toLabel + ': ' + km.toFixed(2) + ' km ' + cur + price.toFixed(2));
        parts.push(line);
      }
      const totalKm = Math.round((totalMeters/1000) * 100) / 100;
      let distanceTotal = Math.round((totalKm * perKm) * 100) / 100;
      // Pickup zone half-charge
      const pickupZone = zoneNumberForLatLng(pickupLoc);
      const pickupBase = basePriceForZone(pickupZone);
      const pickupCharge = Math.round((pickupBase * 0.5) * 100) / 100;
      let total = Math.round((distanceTotal + pickupCharge) * 100) / 100;
      if (minimum && total < minimum) total = minimum;
      const totalLine = 'Total ' + cur + total.toFixed(2) + ' (distance ' + totalKm.toFixed(2) + ' km)';
      const pickupLine = pickupZone ? ('Pickup zone ' + pickupZone + ': ' + cur + pickupCharge.toFixed(2)) : '';
      const breakdown = [pickupLine].concat(parts).filter(Boolean).join(' · ');
      qOut.textContent = totalLine + (breakdown ? (' ' + (i18n('quotePerStopPrefix', { list: breakdown }) || ('Breakdown: ' + breakdown))) : '');
      return;
    } catch(e){
      if (qOut) qOut.textContent = i18n('quoteCouldNotEstimate') || 'Could not estimate route — please check addresses and try again.';
    }
  }
  // Trigger computation
  if (qEstimate) { qEstimate.addEventListener('click', runEstimate); }
  

  if (editMode && google.maps.drawing) {
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

// Fallback diagnostic if Maps API fails to load and callback never fires
(function setupMapsLoadFallback(){
  try {
    window.addEventListener('load', function(){
      setTimeout(function(){
        var mapEl = document.getElementById('zonesMap');
        if (!mapEl) return;
        if (!window.google || !google.maps) {
          var diag = document.getElementById('zoneResult') || document.createElement('div');
          diag.id = diag.id || 'zoneResult';
          diag.className = 'zones-result';
          try {
            const translations = window.CARGOWORKS_TRANSLATIONS || {};
            const lang = document.documentElement.lang || 'en';
            const dict = Object.assign({}, translations.en||{}, translations[lang]||{});
            diag.textContent = dict.mapFailedLoad || 'Map failed to load. Check API key/referrer settings.';
          } catch(_) {
            diag.textContent = 'Map failed to load. Check API key/referrer settings.';
          }
          if (!document.getElementById('zoneResult')) {
            var controls = document.querySelector('.zones-controls');
            if (controls) controls.appendChild(diag);
          }
          try { console.error('[Maps] google.maps not available. Verify API key, enabled APIs, billing, and allowed referrers.'); } catch(e) {}
        }
      }, 3000);
    });
  } catch(e) {}
})();

// Global auth failure handler: shows a translated diagnostic if the API key/referrer blocks Maps
window.gm_authFailure = function(){
  try {
    const el = document.getElementById('zoneResult') || document.createElement('div');
    el.id = el.id || 'zoneResult';
    el.className = 'zones-result';
    const translations = window.CARGOWORKS_TRANSLATIONS || {};
    const lang = document.documentElement.lang || 'en';
    const dict = Object.assign({}, translations.en||{}, translations[lang]||{});
    el.textContent = dict.mapAuthFailure || 'Maps authentication failed — verify API key, enabled APIs (Maps JavaScript, Places), billing, and allowed website referrers.';
    if (!document.getElementById('zoneResult')) {
      const controls = document.querySelector('.zones-controls');
      if (controls) controls.appendChild(el);
    }
    console.error('[Maps] gm_authFailure fired: Authentication failed.');
  } catch(_) {
    try { console.error('[Maps] gm_authFailure fired.'); } catch(__) {}
  }
};

// Leaflet fallback disabled to verify Google Maps behavior
