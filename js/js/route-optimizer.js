// Stop-order optimizer for bike routes (rider page).
//
// bikeTimes():  riding times between stops from Google's Routes API in bike
//               mode. A→B and B→A are asked separately, so one-way streets
//               show up as different times each way. Only each stop's nearest
//               neighbours are asked (that's where the next stop is); other
//               pairs are estimated from the straight line.
// solvePath():  best visiting order with a fixed start and a fixed or open
//               end, for direction-dependent times.
// planRoute():  priority stops first, then the rest from the last priority
//               stop, ending at the dropoff.
(function(root){
  'use strict';

  var ENDPOINT = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
  var CACHE_KEY = 'cwBikeLegCache';
  var CACHE_MAX = 4000;
  var NEIGHBOURS = 8;
  var CONCURRENCY = 4;
  var UNMEASURED_PENALTY = 1.2;   // estimated pairs lose ties to measured ones
  var DEFAULT_SEC_PER_M = 0.3;    // straight-line metre → riding seconds, before calibration
  var DETOUR = 1.3;               // straight line → street metres, when unmeasured

  function haversineM(a, b){
    var R = 6371000, r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  // ── Leg cache (rounded coordinates → [seconds, metres, saved at]) ─────────
  var mem = null;
  function pointKey(p){ return Number(p.lat).toFixed(5) + ',' + Number(p.lng).toFixed(5); }
  function legKey(a, b){ return pointKey(a) + '>' + pointKey(b); }
  function cache(){
    if (mem) return mem;
    mem = {};
    try {
      var raw = root.localStorage && root.localStorage.getItem(CACHE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') mem = parsed;
    } catch (_) {}
    return mem;
  }
  function saveCache(){
    try {
      var keys = Object.keys(mem);
      if (keys.length > CACHE_MAX) {
        keys.sort(function(a, b){ return (mem[a][2] || 0) - (mem[b][2] || 0); });
        keys.slice(0, keys.length - CACHE_MAX).forEach(function(k){ delete mem[k]; });
      }
      if (root.localStorage) root.localStorage.setItem(CACHE_KEY, JSON.stringify(mem));
    } catch (_) {}
  }

  function waypoint(p){ return { waypoint: { location: { latLng: { latitude: Number(p.lat), longitude: Number(p.lng) } } } }; }

  // One origin to several destinations. Throws on a refused/failed request.
  async function fetchRow(origin, dests, apiKey){
    var res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,condition'
      },
      body: JSON.stringify({ origins: [waypoint(origin)], destinations: dests.map(waypoint), travelMode: 'BICYCLE' })
    });
    var data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || !Array.isArray(data)) {
      var msg = data && data.error && data.error.message ? data.error.message : ('HTTP ' + res.status);
      var err = new Error(msg);
      err.refused = res.status === 400 || res.status === 401 || res.status === 403;
      throw err;
    }
    return data;
  }

  // points: [{lat,lng}]. opts.startIndex is never a destination; opts.endIndex
  // (if any) is never an origin. Returns cost(i,j) in seconds, metres(i,j),
  // and how the times were obtained.
  async function bikeTimes(points, opts){
    opts = opts || {};
    var n = points.length;
    var startIndex = opts.startIndex == null ? -1 : opts.startIndex;
    var endIndex = opts.endIndex == null ? -1 : opts.endIndex;
    var apiKey = String(opts.apiKey || root.CARGOWORKS_MAPS_KEY || '').trim();
    var k = Math.min(opts.neighbours || NEIGHBOURS, n - 1);

    var hav = [];
    for (var i = 0; i < n; i++) {
      hav.push([]);
      for (var j = 0; j < n; j++) hav[i].push(i === j ? 0 : haversineM(points[i], points[j]));
    }
    function nearest(i){
      return points.map(function(_, j){ return j; })
        .filter(function(j){ return j !== i; })
        .sort(function(a, b){ return hav[i][a] - hav[i][b]; })
        .slice(0, k);
    }

    // Pairs worth measuring: each origin to its nearest stops, and the end
    // from the stops nearest to it.
    var wanted = points.map(function(){ return {}; });
    for (i = 0; i < n; i++) {
      if (i === endIndex) continue;
      nearest(i).forEach(function(j){ if (j !== startIndex) wanted[i][j] = true; });
    }
    if (endIndex >= 0) nearest(endIndex).forEach(function(j){ wanted[j][endIndex] = true; });

    var c = cache();
    var known = {};   // 'i>j' → [sec, m]
    var rows = [];
    for (i = 0; i < n; i++) {
      var missing = [];
      Object.keys(wanted[i]).forEach(function(js){
        var jj = Number(js);
        if (hav[i][jj] < 1) { known[i + '>' + jj] = [0, 0]; return; }
        var hit = c[legKey(points[i], points[jj])];
        if (hit) known[i + '>' + jj] = [hit[0], hit[1]];
        else missing.push(jj);
      });
      if (missing.length) rows.push({ origin: i, dests: missing });
    }

    var fetched = 0, failures = 0, refused = null;
    if (rows.length && !apiKey) refused = 'Maps key not configured';
    if (rows.length && apiKey && typeof fetch === 'function') {
      var next = 0;
      var worker = async function(){
        while (next < rows.length && !refused) {
          var row = rows[next++];
          try {
            fetched += row.dests.length;
            var els = await fetchRow(points[row.origin], row.dests.map(function(j){ return points[j]; }), apiKey);
            els.forEach(function(el){
              if (!el || el.condition !== 'ROUTE_EXISTS') return;
              var jj = row.dests[el.destinationIndex || 0];
              if (jj == null) return;
              var sec = parseFloat(String(el.duration || '0').replace('s', '')) || 0;
              var m = Number(el.distanceMeters) || 0;
              known[row.origin + '>' + jj] = [sec, m];
              c[legKey(points[row.origin], points[jj])] = [sec, m, Date.now()];
            });
          } catch (err) {
            failures++;
            if (err && err.refused) refused = err.message || 'refused';
          }
        }
      };
      var workers = [];
      for (var w = 0; w < Math.min(CONCURRENCY, rows.length); w++) workers.push(worker());
      await Promise.all(workers);
      saveCache();
    }

    // Calibrate the estimate for unmeasured pairs on the measured ones.
    var ratios = [];
    Object.keys(known).forEach(function(key){
      var p = key.split('>');
      var h = hav[Number(p[0])][Number(p[1])];
      if (h > 50 && known[key][0] > 0) ratios.push(known[key][0] / h);
    });
    ratios.sort(function(a, b){ return a - b; });
    var secPerM = ratios.length ? ratios[Math.floor(ratios.length / 2)] : DEFAULT_SEC_PER_M;

    var measured = Object.keys(known).length;
    function cost(a, b){
      if (a === b) return 0;
      var kv = known[a + '>' + b];
      return kv ? kv[0] : hav[a][b] * secPerM * UNMEASURED_PENALTY;
    }
    function metres(a, b){
      if (a === b) return 0;
      var kv = known[a + '>' + b];
      return kv ? kv[1] : hav[a][b] * DETOUR;
    }
    var source = measured === 0 ? 'straight' : ((refused || failures) ? 'mixed' : 'google');
    return { cost: cost, metres: metres, source: source, fetched: fetched, measured: measured, error: refused || (failures ? failures + ' request(s) failed' : '') };
  }

  // ── Solver ─────────────────────────────────────────────────────────────────
  function rng(seed){
    var s = seed >>> 0;
    return function(){
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // nodes: ids to visit. start: id visited first (not in nodes). end: id
  // visited last, or null for an open end. opts.tail(id): extra cost of
  // finishing at id when the end is open (e.g. distance to what comes next).
  // Returns the nodes in visiting order.
  function solvePath(nodes, cost, start, end, opts){
    opts = opts || {};
    var m = nodes.length;
    if (m <= 1) return nodes.slice();
    var ids = [start].concat(nodes, [end]);
    var L = m + 2, E = L - 1;
    var M = new Float64Array(L * L);
    for (var a = 0; a < L; a++) {
      for (var b = 0; b < L; b++) {
        var v;
        if (a === b) v = 0;
        else if (b === 0 || a === E) v = 1e12;          // never back to start / out of the end
        else if (b === E) v = end == null ? (opts.tail ? opts.tail(ids[a]) : 0) : cost(ids[a], end);
        else v = cost(ids[a], ids[b]);
        M[a * L + b] = v;
      }
    }
    function c(x, y){ return M[x * L + y]; }
    function total(p){ var s = 0; for (var i = 0; i < p.length - 1; i++) s += c(p[i], p[i + 1]); return s; }

    // Short routes: the exact best order (every subset, Held–Karp).
    var exactLimit = opts.exactLimit == null ? 11 : opts.exactLimit;
    if (m <= exactLimit) {
      var S = 1 << m, dp = new Float64Array(S * m).fill(Infinity), from = new Int8Array(S * m).fill(-1);
      for (var f = 0; f < m; f++) dp[(1 << f) * m + f] = c(0, f + 1);
      for (var mask = 1; mask < S; mask++) {
        for (var last = 0; last < m; last++) {
          var here = dp[mask * m + last];
          if (!(mask & (1 << last)) || here === Infinity) continue;
          for (var nx = 0; nx < m; nx++) {
            if (mask & (1 << nx)) continue;
            var nm = mask | (1 << nx), val = here + c(last + 1, nx + 1);
            if (val < dp[nm * m + nx]) { dp[nm * m + nx] = val; from[nm * m + nx] = last; }
          }
        }
      }
      var full = S - 1, endAt = 0, bestEnd = Infinity;
      for (var z = 0; z < m; z++) { var tot = dp[full * m + z] + c(z + 1, E); if (tot < bestEnd) { bestEnd = tot; endAt = z; } }
      var seq = [], mk = full, at0 = endAt;
      while (at0 >= 0) { seq.push(ids[at0 + 1]); var pv = from[mk * m + at0]; mk &= ~(1 << at0); at0 = pv; }
      return seq.reverse();
    }

    // Two first drafts: nearest next, and cheapest insertion.
    var left = [], i, j;
    for (i = 1; i <= m; i++) left.push(i);
    var nn = [0], cur = 0;
    var pool = left.slice();
    while (pool.length) {
      var bi = 0;
      for (i = 1; i < pool.length; i++) if (c(cur, pool[i]) < c(cur, pool[bi])) bi = i;
      cur = pool.splice(bi, 1)[0];
      nn.push(cur);
    }
    nn.push(E);
    var ins = [0, E];
    pool = left.slice();
    while (pool.length) {
      var best = Infinity, bn = 0, bp = 1;
      for (i = 0; i < pool.length; i++) {
        for (j = 0; j < ins.length - 1; j++) {
          var d = c(ins[j], pool[i]) + c(pool[i], ins[j + 1]) - c(ins[j], ins[j + 1]);
          if (d < best) { best = d; bn = i; bp = j + 1; }
        }
      }
      ins.splice(bp, 0, pool.splice(bn, 1)[0]);
    }

    function localSearch(p){
      var n = p.length, improved = true, guard = 0;
      var F = new Float64Array(n), R = new Float64Array(n);
      function prefix(){
        F[0] = 0; R[0] = 0;
        for (var t = 1; t < n; t++) { F[t] = F[t - 1] + c(p[t - 1], p[t]); R[t] = R[t - 1] + c(p[t], p[t - 1]); }
      }
      while (improved && guard++ < 1000) {
        improved = false;
        prefix();
        // Reverse p[i..j]
        for (var x = 1; x < n - 2 && !improved; x++) {
          for (var y = x + 1; y < n - 1; y++) {
            var delta = c(p[x - 1], p[y]) + c(p[x], p[y + 1]) - c(p[x - 1], p[x]) - c(p[y], p[y + 1]) +
              (R[y] - R[x]) - (F[y] - F[x]);
            if (delta < -1e-7) {
              var seg = p.slice(x, y + 1).reverse();
              for (var q = 0; q < seg.length; q++) p[x + q] = seg[q];
              improved = true;
              break;
            }
          }
        }
        if (improved) continue;
        // Move a run of 1–3 stops elsewhere (as is, or reversed)
        for (var len = 1; len <= 3 && !improved; len++) {
          for (var s = 1; s + len - 1 <= n - 2 && !improved; s++) {
            var e = s + len - 1;
            var removeGain = c(p[s - 1], p[e + 1]) - c(p[s - 1], p[s]) - c(p[e], p[e + 1]);
            var inner = F[e] - F[s], innerRev = R[e] - R[s];
            for (var t = 0; t <= n - 2; t++) {
              if (t >= s - 1 && t <= e) continue;
              var A = p[t], B = p[t + 1];
              var keep = removeGain + c(A, p[s]) + c(p[e], B) - c(A, B);
              var flip = len > 1 ? removeGain + c(A, p[e]) + c(p[s], B) - c(A, B) + innerRev - inner : Infinity;
              if (keep < -1e-7 || flip < -1e-7) {
                var run = p.splice(s, len);
                if (flip < keep) run.reverse();
                var at = t < s ? t + 1 : t + 1 - len;
                Array.prototype.splice.apply(p, [at, 0].concat(run));
                improved = true;
                break;
              }
            }
          }
        }
      }
      return p;
    }

    var bestPath = localSearch(total(nn) <= total(ins) ? nn : ins);
    var bestCost = total(bestPath);
    if (m >= 4) {
      // Shake up the best route and improve again (fixed seed: same input,
      // same answer every time).
      var rand = rng(opts.seed || 20261022);
      var iterations = opts.iterations || (m <= 20 ? 250 : 400);
      var deadline = Date.now() + (opts.maxMs || 2000);
      for (var it = 0; it < iterations && Date.now() < deadline; it++) {
        var cand = bestPath.slice();
        var inside = cand.slice(1, -1);
        var cuts = [];
        while (cuts.length < 3) {
          var cut = 1 + Math.floor(rand() * (inside.length - 1));
          if (cuts.indexOf(cut) < 0) cuts.push(cut);
        }
        cuts.sort(function(x, y){ return x - y; });
        var A1 = inside.slice(0, cuts[0]), B1 = inside.slice(cuts[0], cuts[1]),
          C1 = inside.slice(cuts[1], cuts[2]), D1 = inside.slice(cuts[2]);
        cand = [0].concat(A1, C1, B1, D1, [E]);
        cand = localSearch(cand);
        var cc = total(cand);
        if (cc < bestCost - 1e-7) { bestCost = cc; bestPath = cand; }
      }
    }
    return bestPath.slice(1, -1).map(function(x){ return ids[x]; });
  }

  // start: {lat,lng}; end: {lat,lng} or null; stops: [{lat,lng,priority}] in
  // their current order (all located). Returns the new order (indexes into
  // stops) and riding time before/after on the same times.
  async function planRoute(input){
    var stops = input.stops || [];
    var points = [input.start].concat(stops);
    var endIndex = -1;
    if (input.end) { points.push(input.end); endIndex = points.length - 1; }
    var times = await (input.bikeTimes || bikeTimes)(points, { startIndex: 0, endIndex: endIndex, apiKey: input.apiKey });

    var stopIds = stops.map(function(_, i){ return i + 1; });
    var prio = stopIds.filter(function(id){ return stops[id - 1].priority; });
    var rest = stopIds.filter(function(id){ return !stops[id - 1].priority; });
    var order = [];
    var from = 0;
    if (prio.length) {
      // Finish the priority run near where the rest of the route begins.
      var tail = rest.length ? function(id){
        var best = Infinity;
        rest.forEach(function(r){ best = Math.min(best, times.cost(id, r)); });
        return best;
      } : null;
      order = solvePath(prio, times.cost, 0, rest.length ? null : (endIndex >= 0 ? endIndex : null), { tail: tail });
      from = order[order.length - 1];
    }
    order = order.concat(solvePath(rest, times.cost, from, endIndex >= 0 ? endIndex : null));

    function measure(seq){
      var full = [0].concat(seq, endIndex >= 0 ? [endIndex] : []);
      var sec = 0, m = 0;
      for (var i = 0; i < full.length - 1; i++) { sec += times.cost(full[i], full[i + 1]); m += times.metres(full[i], full[i + 1]); }
      return { sec: sec, m: m };
    }
    var before = measure(stopIds), after = measure(order);
    // Never hand back something worse than what was there.
    if (after.sec > before.sec + 1e-7 && !prio.length) { order = stopIds; after = before; }
    return {
      order: order.map(function(id){ return id - 1; }),
      beforeSec: before.sec, afterSec: after.sec, afterMeters: after.m,
      source: times.source, fetched: times.fetched, error: times.error
    };
  }

  var api = { haversineM: haversineM, bikeTimes: bikeTimes, solvePath: solvePath, planRoute: planRoute,
    _resetCache: function(){ mem = null; } };
  root.CargoworksRouteOptimizer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
