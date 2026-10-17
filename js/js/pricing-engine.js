// Cargoworks pricing — the one calculation behind both the booking page
// (map.js) and the dispatcher's "Get system pricing", so a route prices the
// same in both. computeQuotePrice() is pure arithmetic: callers pass the
// pickup zone, the routed legs and the schedule. The Google helpers below
// (geocoding, bike routing) are shared too, so both pages measure a route
// the same way.
(function(root){
  'use strict';

  var VAT_RATE = 0.21;
  var FALLBACK_PER_KM = 1.5;
  var PER_KM_MARKUP = 1.1;
  var PICKUP_BASE_FACTOR = 0.88;
  var ADDRESS_FEE_PER = 1.25;     // per drop, once a route has 3+ drops
  var ADDRESS_FEE_FROM = 3;
  var AUTO_LARGE_FROM_STOPS = 5;  // intermediate stops that force Heavy/Big
  var BIKE_KMH = 15;              // fallback speed when routing is unavailable
  var DETOUR = 1.25;

  // Same three loads as the booking page's cargo selector.
  var CARGO = {
    small:   { rate: -0.15, label: 'Shoebox size (−15%)' },
    regular: { rate: 0,     label: 'Euronorm box' },
    large:   { rate: 0.2,   label: 'Heavy/Big (+20%)' }
  };

  function r2(n){ return Math.round((Number(n) || 0) * 100) / 100; }

  function perKmFor(prices, zone){
    var dp = (prices && prices.distance) || {};
    var map = dp.perKm;
    var v = (map && typeof map === 'object') ? (Number(map[zone]) || 0) : (Number(map) || 0);
    if (!v || v <= 0) v = FALLBACK_PER_KM;
    return r2(v * PER_KM_MARKUP);
  }

  function pickupChargeFor(prices, zone){
    var z = prices && prices.zones && prices.zones[zone];
    return r2(Number((z && z.base) || 0) * PICKUP_BASE_FACTOR);
  }

  function cargoFor(key, intermediateStops){
    var forced = (Number(intermediateStops) || 0) >= AUTO_LARGE_FROM_STOPS;
    var k = forced ? 'large' : (CARGO[key] ? key : 'regular');
    return { key: k, rate: CARGO[k].rate, label: CARGO[k].label, auto: forced && key !== 'large' };
  }

  function parseHm(str){
    var s = String(str || '').trim();
    if (!s) return null;
    var parts = s.split(':');
    var h = Number(parts[0] || 0);
    var m = Number(parts[1] || 0);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  // Weekend/holiday and after-hours surcharges, including a job that starts
  // in hours but runs past closing (that share of it pays after-hours).
  function surchargeFor(prices, holidays, dateKey, timeLabel, durationMin){
    var sur = (prices && prices.surcharges) || {};
    var bh = (prices && prices.businessHours) || {};
    var hasDate = !!dateKey;
    var dateBase = hasDate ? new Date(String(dateKey) + 'T00:00:00') : null;
    var isHoliday = hasDate && holidays && typeof holidays.has === 'function' ? holidays.has(dateKey) : false;
    var isWeekend = hasDate ? (dateBase.getDay() === 0 || dateBase.getDay() === 6) : false;
    var isWeekendHoliday = isWeekend || isHoliday;
    var hours = isWeekendHoliday
      ? (bh.weekendHoliday || { start: '07:00', end: '14:00' })
      : (bh.weekday || { start: '07:00', end: '17:00' });
    var startMin = parseHm(hours && hours.start); if (startMin == null) startMin = 0;
    var endMin = parseHm(hours && hours.end); if (endMin == null) endMin = 24 * 60;
    var timeMin = parseHm(timeLabel);
    var afterHours = timeMin == null ? false : (timeMin < startMin || timeMin >= endMin);
    var overflowFraction = 0;
    var overflowMinutes = 0;
    if (timeMin != null && durationMin != null) {
      overflowMinutes = Math.max(0, timeMin + durationMin - endMin);
      overflowFraction = durationMin > 0 ? Math.min(1, Math.max(0, overflowMinutes / durationMin)) : 0;
    }
    var weekendRate = Number(sur.weekend_holiday || 0) || 0;
    var afterRate = Number(sur.after_hours || 0) || 0;
    var effectiveAfterRate = afterHours ? afterRate : (overflowFraction * afterRate);
    return {
      isWeekend: isWeekend,
      isHoliday: isHoliday,
      isWeekendHoliday: isWeekendHoliday,
      afterHours: afterHours,
      weekendRate: weekendRate,
      afterRate: afterRate,
      overflowMinutes: Math.round(overflowMinutes),
      overflowFraction: overflowFraction,
      effectiveAfterRate: effectiveAfterRate,
      effectiveRate: (isWeekendHoliday ? weekendRate : 0) + effectiveAfterRate,
      rate: (isWeekendHoliday ? weekendRate : 0) + (afterHours ? afterRate : 0)
    };
  }

  function normalizeCode(code){ return String(code || '').trim().toUpperCase(); }

  // Promo codes from data/discounts.json, same rules as the booking page:
  // active flag, start/end dates, minimum order, fixed or percent, applied
  // to the subtotal before VAT.
  function resolveDiscounts(codes, discountList, totalBeforeDiscount, dateKey){
    var list = Array.isArray(discountList) ? discountList : [];
    var base = Number(totalBeforeDiscount || 0) || 0;
    var applied = [];
    var errors = [];
    (Array.isArray(codes) ? codes : []).forEach(function(code){
      var c = normalizeCode(code);
      if (!c) return;
      var d = null;
      for (var i = 0; i < list.length; i++) { if (normalizeCode(list[i] && list[i].code) === c) { d = list[i]; break; } }
      if (!d) { errors.push({ code: c, reason: 'not_found' }); return; }
      if (d.active === false) { errors.push({ code: c, reason: 'inactive' }); return; }
      var start = String(d.start || '').trim();
      var end = String(d.end || '').trim();
      if (start && dateKey < start) { errors.push({ code: c, reason: 'not_started' }); return; }
      if (end && dateKey > end) { errors.push({ code: c, reason: 'expired' }); return; }
      var minOrder = Number(d.minOrder || 0) || 0;
      if (minOrder && base < minOrder) { errors.push({ code: c, reason: 'min_order', minOrder: minOrder }); return; }
      var type = String(d.type || '').toLowerCase();
      var amt = Number(d.amount || 0) || 0;
      var amount = 0;
      if (type === 'fixed') amount = Math.min(base, Math.max(0, amt));
      else if (type === 'percent') amount = Math.min(base, Math.max(0, base * amt / 100));
      if (amount) applied.push({ code: c, amount: amount, discount: d });
    });
    var totalDiscount = Math.min(base, applied.reduce(function(s, a){ return s + (Number(a.amount || 0) || 0); }, 0));
    return { totalDiscount: totalDiscount, applied: applied, errors: errors };
  }

  // o: { prices, holidays (Set), pickupZone, legs: [{meters, sec}] from pickup
  //      through every stop to the drop-off, dropCenterKm, intermediateStops,
  //      cargoKey, dateKey, timeLabel, durationMin (optional — defaults to
  //      this route's own ETA), etaStopCount (optional), discount (optional
  //      function(subtotalBeforeDiscount) → { totalDiscount, applied }) }
  function computeQuotePrice(o){
    var legs = Array.isArray(o.legs) ? o.legs : [];
    var perKm = perKmFor(o.prices, o.pickupZone);
    var minimum = Number(o.prices && o.prices.distance && o.prices.distance.minimum) || 0;
    var totalMeters = 0;
    var parts = legs.map(function(leg, i){
      var m = Number(leg && leg.meters || 0) || 0;
      totalMeters += m;
      var km = r2(m / 1000);
      return { index: i, km: km, price: r2(km * perKm), etaMin: Math.round((Number(leg && leg.sec || 0) || 0) / 60) };
    });
    var totalKm = r2(totalMeters / 1000);
    var dropCenterKm = r2(o.dropCenterKm || 0);
    var distanceBasisKm = Math.max(totalKm, dropCenterKm);
    var distanceTotal = r2(distanceBasisKm * perKm);
    var pickupCharge = pickupChargeFor(o.prices, o.pickupZone);
    var stops = Math.max(0, Number(o.intermediateStops) || 0);
    var addressFeeCount = stops + 1; // drop-off + stops (pickup excluded)
    var addressFeePer = addressFeeCount >= ADDRESS_FEE_FROM ? ADDRESS_FEE_PER : 0;
    var addressFee = r2(addressFeePer * addressFeeCount);
    var preMinSubtotal = r2(distanceTotal + pickupCharge);
    var subtotal = preMinSubtotal;
    if (minimum && subtotal < minimum) subtotal = minimum;
    var minimumTopUp = r2(subtotal - preMinSubtotal);
    subtotal = r2(subtotal + addressFee);
    var cargo = cargoFor(o.cargoKey, stops);
    var cargoAmount = r2(subtotal * cargo.rate);
    subtotal = r2(subtotal + cargoAmount);

    var travelSec = legs.reduce(function(a, l){ return a + (Number(l && l.sec || 0) || 0); }, 0);
    var etaStops = o.etaStopCount != null ? Math.max(0, Number(o.etaStopCount) || 0) : stops;
    var etaMins = Math.round(travelSec / 60) + 5 + 3 * (etaStops + 1);
    var durationMin = o.durationMin != null ? o.durationMin : etaMins;
    var s = surchargeFor(o.prices, o.holidays, o.dateKey, o.timeLabel, durationMin);
    var surchargeAmount = r2(subtotal * s.effectiveRate);
    var weekendSurchargeAmount = r2(subtotal * (s.isWeekendHoliday ? s.weekendRate : 0));
    var afterHoursSurchargeAmount = r2(subtotal * s.effectiveAfterRate);
    var subtotalBeforeDiscount = r2(subtotal + surchargeAmount);

    var disc = (typeof o.discount === 'function') ? (o.discount(subtotalBeforeDiscount) || {}) : {};
    var discountAmount = r2(disc.totalDiscount || 0);
    var preVatTotal = Math.max(0, r2(subtotalBeforeDiscount - discountAmount));
    var vatAmount = r2(preVatTotal * VAT_RATE);
    var total = r2(preVatTotal + vatAmount);

    return {
      perKm: perKm, minimum: minimum, parts: parts, totalKm: totalKm, dropCenterKm: dropCenterKm,
      distanceBasisKm: distanceBasisKm, distanceTotal: distanceTotal,
      pickupZone: String(o.pickupZone || ''), pickupCharge: pickupCharge,
      preMinSubtotal: preMinSubtotal, minimumTopUp: minimumTopUp, minApplied: minimumTopUp > 0,
      addressFeeCount: addressFeeCount, addressFeePer: addressFeePer, addressFee: addressFee,
      cargo: cargo, cargoAmount: cargoAmount,
      surcharge: s, surchargeAmount: surchargeAmount,
      weekendSurchargeAmount: weekendSurchargeAmount, afterHoursSurchargeAmount: afterHoursSurchargeAmount,
      subtotalBeforeDiscount: subtotalBeforeDiscount,
      discountAmount: discountAmount, discountItems: Array.isArray(disc.applied) ? disc.applied : [],
      preVatTotal: preVatTotal, vatRate: VAT_RATE, vatAmount: vatAmount, total: total,
      etaMins: etaMins
    };
  }

  // The compact, complete breakdown kept with an order (dispatcher card and,
  // later, the account panel). labels[i] names the point legs[i] starts from.
  function pricingDetail(result, labels){
    var names = Array.isArray(labels) ? labels : [];
    return {
      v: 1,
      perKm: result.perKm,
      legs: result.parts.map(function(p, i){ return { from: names[i] || ('Point ' + (i + 1)), to: names[i + 1] || ('Point ' + (i + 2)), km: p.km, price: p.price }; }),
      totalKm: result.totalKm,
      dropCenterKm: result.dropCenterKm,
      distanceBasisKm: result.distanceBasisKm,
      distanceTotal: result.distanceTotal,
      pickupZone: result.pickupZone,
      pickupCharge: result.pickupCharge,
      minimumTopUp: result.minimumTopUp,
      addressFeeCount: result.addressFeeCount,
      addressFeePer: result.addressFeePer,
      addressFee: result.addressFee,
      cargoKey: result.cargo.key,
      cargoLabel: result.cargo.label,
      cargoAmount: result.cargoAmount,
      weekendSurchargeAmount: result.weekendSurchargeAmount,
      afterHoursSurchargeAmount: result.afterHoursSurchargeAmount,
      surchargeAmount: result.surchargeAmount,
      discountCodes: result.discountItems.map(function(d){ return d.code; }),
      discountAmount: result.discountAmount,
      subtotalBeforeDiscount: result.subtotalBeforeDiscount,
      preVatTotal: result.preVatTotal,
      vatRate: result.vatRate,
      vatAmount: result.vatAmount,
      total: result.total,
      etaMins: result.etaMins
    };
  }

  function haversineKm(a, b){
    if (!a || !b) return 0;
    var R = 6371;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLng = (b.lng - a.lng) * Math.PI / 180;
    var s1 = Math.sin(dLat / 2), s2 = Math.sin(dLng / 2);
    var x = s1 * s1 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * s2 * s2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  // Reference point for the drop-off distance floor: the middle of zone 1's
  // bounding box (what the booking page's map uses).
  function zoneOneCenter(geojson){
    var feats = (geojson && geojson.features) || [];
    for (var i = 0; i < feats.length; i++) {
      var f = feats[i];
      var m = String((f.properties && f.properties.name) || '').match(/(\d+)/);
      if (!m || m[1] !== '1' || !f.geometry) continue;
      var g = f.geometry;
      var ring = g.type === 'Polygon' ? (g.coordinates && g.coordinates[0])
        : (g.type === 'MultiPolygon' ? (g.coordinates && g.coordinates[0] && g.coordinates[0][0]) : null);
      if (!ring || !ring.length) continue;
      var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      ring.forEach(function(pt){
        var lng = Number(pt[0]), lat = Number(pt[1]);
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
      });
      return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
    }
    return { lat: 41.3874, lng: 2.1686 };
  }

  // ── Google Maps helpers (need the Maps JavaScript API loaded) ──────────────

  function toLatLngLiteral(p){
    if (!p) return null;
    if (typeof p.lat === 'function') return { lat: p.lat(), lng: p.lng() };
    return { lat: Number(p.lat), lng: Number(p.lng) };
  }

  // Results that pin a door or a place, as opposed to a whole street,
  // neighbourhood or district (whose centre is a guess).
  var EXACT_TYPES = ['street_address', 'premise', 'subpremise', 'establishment', 'point_of_interest', 'airport', 'park', 'transit_station'];

  // Barcelona-biased geocode, retrying with the city appended (booking page
  // rules). precise is false when only an area matched.
  async function geocodeBarcelona(geocoder, q){
    var bounds = null;
    try { bounds = new google.maps.LatLngBounds(new google.maps.LatLng(41.317, 2.052), new google.maps.LatLng(41.468, 2.239)); } catch(_) {}
    var tries = [q, q + ', Barcelona, Spain'];
    for (var i = 0; i < tries.length; i++) {
      try {
        var resp = await geocoder.geocode({ address: tries[i], region: 'ES', bounds: bounds || undefined });
        var r0 = resp && resp.results && resp.results[0];
        if (r0) {
          var lt = r0.geometry && r0.geometry.location_type;
          var types = Array.isArray(r0.types) ? r0.types : [];
          var precise = lt === 'ROOFTOP' || lt === 'RANGE_INTERPOLATED' || types.some(function(t){ return EXACT_TYPES.indexOf(t) >= 0; });
          return { location: r0.geometry.location, label: r0.formatted_address || q, precise: precise };
        }
      } catch(_) {}
    }
    return null;
  }

  function legMeters(leg){ return (leg && leg.distance && Number(leg.distance.value)) || 0; }
  function legSeconds(leg){ return (leg && leg.duration && Number(leg.duration.value)) || 0; }
  function routeMeters(r){ return (r.legs || []).reduce(function(a, l){ return a + legMeters(l); }, 0); }
  function routeSeconds(r){ return (r.legs || []).reduce(function(a, l){ return a + legSeconds(l); }, 0); }
  function polylineKey(r){
    var ov = r && r.overview_polyline;
    if (!ov) return '';
    if (typeof ov === 'string') return ov;
    if (ov.points) return String(ov.points);
    return String(ov.toString ? ov.toString() : '');
  }
  // Shortest of Google's bike route alternatives (then quickest, then a stable tiebreak).
  function shortestBikeRoute(routes){
    var list = (Array.isArray(routes) ? routes : []).filter(function(r){ return r && Array.isArray(r.legs) && r.legs.length; });
    if (!list.length) return null;
    list.sort(function(a, b){
      var d = routeMeters(a) - routeMeters(b); if (d) return d;
      var t = routeSeconds(a) - routeSeconds(b); if (t) return t;
      var ak = polylineKey(a), bk = polylineKey(b);
      return ak < bk ? -1 : (ak > bk ? 1 : 0);
    });
    return list[0];
  }
  function legPath(leg){
    var out = [];
    (leg && leg.steps || []).forEach(function(step){
      if (Array.isArray(step.path) && step.path.length) step.path.forEach(function(p){ out.push(p); });
      else { if (step.start_location) out.push(step.start_location); if (step.end_location) out.push(step.end_location); }
    });
    return out;
  }

  var legCache = new Map();
  function legKey(a, b){
    var p = toLatLngLiteral(a), q = toLatLngLiteral(b);
    return p.lat.toFixed(5) + ',' + p.lng.toFixed(5) + '>' + q.lat.toFixed(5) + ',' + q.lng.toFixed(5);
  }

  async function routeBikeLeg(directions, from, to){
    var key = legKey(from, to);
    if (legCache.has(key)) return legCache.get(key);
    var res = await directions.route({
      origin: from, destination: to,
      travelMode: google.maps.TravelMode.BICYCLING,
      provideRouteAlternatives: true,
      optimizeWaypoints: false
    });
    var route = shortestBikeRoute(res && res.routes);
    var leg = route && route.legs && route.legs[0];
    if (!leg) return null;
    var out = { sec: legSeconds(leg), meters: legMeters(leg), pathPoints: legPath(leg) };
    legCache.set(key, out);
    return out;
  }

  // Straight-line estimate, same as the booking page when routing fails.
  function fallbackLeg(from, to){
    var meters = haversineKm(toLatLngLiteral(from), toLatLngLiteral(to)) * 1000;
    return { sec: Math.round(((meters * DETOUR) / 1000 / BIKE_KMH) * 3600), meters: meters, pathPoints: [], estimated: true };
  }

  // Routes every consecutive pair of points, a few at a time (much faster
  // than one after another on multistop routes) and cached, so recalculating
  // the same route doesn't ask Google again. If any leg can't be routed the
  // whole route falls back to the straight-line estimate, like before.
  async function routeBikeLegs(directions, points, opts){
    var pts = (points || []).filter(Boolean);
    var n = Math.max(0, pts.length - 1);
    var legs = new Array(n);
    var concurrency = (opts && opts.concurrency) || 4;
    var next = 0;
    var failed = false;
    async function worker(){
      while (next < n && !failed) {
        var i = next++;
        try {
          var leg = await routeBikeLeg(directions, pts[i], pts[i + 1]);
          if (!leg) { failed = true; return; }
          legs[i] = leg;
        } catch(_) { failed = true; return; }
      }
    }
    var workers = [];
    for (var w = 0; w < Math.min(concurrency, n); w++) workers.push(worker());
    await Promise.all(workers);
    if (failed) {
      return { legs: pts.slice(0, -1).map(function(p, i){ return fallbackLeg(p, pts[i + 1]); }), estimated: true };
    }
    return { legs: legs, estimated: false };
  }

  var api = {
    VAT_RATE: VAT_RATE,
    CARGO: CARGO,
    r2: r2,
    perKmFor: perKmFor,
    pickupChargeFor: pickupChargeFor,
    cargoFor: cargoFor,
    surchargeFor: surchargeFor,
    resolveDiscounts: resolveDiscounts,
    computeQuotePrice: computeQuotePrice,
    pricingDetail: pricingDetail,
    haversineKm: haversineKm,
    zoneOneCenter: zoneOneCenter,
    geocodeBarcelona: geocodeBarcelona,
    routeBikeLegs: routeBikeLegs,
    shortestBikeRoute: shortestBikeRoute
  };
  root.CargoworksPricing = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
