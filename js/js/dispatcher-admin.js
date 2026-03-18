(function(){
  const API_BASE = (window.CARGOWORKS_BOOKING_API || '').replace(/\/$/, '');
  const tokenKey = 'cwDispatcherToken';
  const operatorKey = 'cwDispatcherOperator';

  const ORDER_STATUS_VALUES = [
    'Confirmed',
    'Assigned',
    'Picked up',
    'In transit',
    'Delivered',
    'Failed',
    'Canceled',
    'Delivery rejected'
  ];
  const PAYMENT_STATUS_VALUES = ['Pending', 'Paid', 'Failed'];

  const gate = document.getElementById('dispatcherGate');
  const tokenInput = document.getElementById('dispatcherTokenInput');
  const tokenButton = document.getElementById('dispatcherTokenButton');
  const gateStatus = document.getElementById('dispatcherGateStatus');

  const dateInput = document.getElementById('dispatcherDate');
  const operatorInput = document.getElementById('dispatcherOperator');
  const loadBtn = document.getElementById('dispatcherLoad');
  const loadAllBtn = document.getElementById('dispatcherLoadAll');
  const todayBtn = document.getElementById('dispatcherToday');
  const searchInput = document.getElementById('dispatcherSearchInput');
  const searchBtn = document.getElementById('dispatcherSearchButton');
  const logSheetBtn = document.getElementById('dispatcherLogSheet');
  const newOrderBtn = document.getElementById('dispatcherNewOrder');

  const keywordInput = document.getElementById('dispatcherKeyword');
  const filterStatus = document.getElementById('dispatcherFilterStatus');
  const filterUpdates = document.getElementById('dispatcherFilterUpdates');
  const filterPayment = document.getElementById('dispatcherFilterPayment');
  const filterFromDate = document.getElementById('dispatcherFromDate');
  const filterToDate = document.getElementById('dispatcherToDate');
  const sortSelect = document.getElementById('dispatcherSort');
  const applyFiltersBtn = document.getElementById('dispatcherApplyFilters');
  const clearFiltersBtn = document.getElementById('dispatcherClearFilters');

  const statusEl = document.getElementById('dispatcherStatus');
  const summaryEl = document.getElementById('dispatcherSummary');
  const ordersWrap = document.getElementById('dispatcherOrders');

  const editorModal = document.getElementById('dispatcherEditorModal');
  const editorTitle = document.getElementById('dispatcherEditorTitle');
  const editorSubtitle = document.getElementById('dispatcherEditorSubtitle');
  const editorClose = document.getElementById('dispatcherEditorClose');
  const editorCloseBottom = document.getElementById('dispatcherEditorCloseBottom');
  const editorSave = document.getElementById('dispatcherEditorSave');
  const editorCancelOrderBtn = document.getElementById('dispatcherEditorCancelOrder');
  const editorFeedback = document.getElementById('dispatcherEditorFeedback');
  const priceNotice = document.getElementById('dispatcherPriceNotice');

  const cancelModal = document.getElementById('dispatcherCancelModal');
  const cancelClose = document.getElementById('dispatcherCancelClose');
  const cancelAbort = document.getElementById('dispatcherCancelAbort');
  const cancelConfirm = document.getElementById('dispatcherCancelConfirm');
  const cancelReason = document.getElementById('dispatcherCancelReason');
  const cancelFeedback = document.getElementById('dispatcherCancelFeedback');

  const editCustomerName = document.getElementById('editCustomerName');
  const editCustomerEmail = document.getElementById('editCustomerEmail');
  const editCustomerPhone = document.getElementById('editCustomerPhone');
  const editUpdatesPreference = document.getElementById('editUpdatesPreference');
  const editPickupAddress = document.getElementById('editPickupAddress');
  const editRouteStops = document.getElementById('editRouteStops');
  const editDropoffAddress = document.getElementById('editDropoffAddress');
  const editNotes = document.getElementById('editNotes');
  const editScheduleDate = document.getElementById('editScheduleDate');
  const editScheduleTime = document.getElementById('editScheduleTime');
  const editEtaMins = document.getElementById('editEtaMins');
  const editTotalKm = document.getElementById('editTotalKm');
  const editCargoType = document.getElementById('editCargoType');
  const editLoadType = document.getElementById('editLoadType');
  const editVehicleType = document.getElementById('editVehicleType');
  const editPackageCount = document.getElementById('editPackageCount');
  const editWeightKg = document.getElementById('editWeightKg');
  const editVolumeM3 = document.getElementById('editVolumeM3');
  const editPriceBase = document.getElementById('editPriceBase');
  const editPriceDistance = document.getElementById('editPriceDistance');
  const editPriceStops = document.getElementById('editPriceStops');
  const editPriceSurcharge = document.getElementById('editPriceSurcharge');
  const editPriceDiscount = document.getElementById('editPriceDiscount');
  const editPriceAdjustment = document.getElementById('editPriceAdjustment');
  const editPriceTotal = document.getElementById('editPriceTotal');
  const editStatus = document.getElementById('editStatus');
  const editPaymentStatus = document.getElementById('editPaymentStatus');
  const editPaymentUrl = document.getElementById('editPaymentUrl');
  const editPodUrl = document.getElementById('editPodUrl');
  const editRiderName = document.getElementById('editRiderName');
  const editRiderPhone = document.getElementById('editRiderPhone');
  const editInternalNotes = document.getElementById('editInternalNotes');
  const editOperator = document.getElementById('editOperator');
  const editSaveNote = document.getElementById('editSaveNote');

  const editorInputs = [
    editCustomerName, editCustomerEmail, editCustomerPhone, editUpdatesPreference,
    editPickupAddress, editRouteStops, editDropoffAddress, editNotes,
    editScheduleDate, editScheduleTime, editEtaMins, editTotalKm,
    editCargoType, editLoadType, editVehicleType, editPackageCount,
    editWeightKg, editVolumeM3,
    editPriceBase, editPriceDistance, editPriceStops, editPriceSurcharge,
    editPriceDiscount, editPriceAdjustment, editPriceTotal,
    editStatus, editPaymentStatus, editPaymentUrl, editRiderName, editRiderPhone,
    editInternalNotes, editOperator, editSaveNote
  ];

  let toastTimer = null;
  let allOrders = [];
  let loadMode = 'none';
  let loadLabel = '';
  let lastReference = '';
  let filterTimer = null;
  let editorState = {
    open: false,
    mode: 'edit',
    order: null,
    sourceEventId: '',
    dirty: false,
    snapshot: ''
  };
  let cancelTargetOrder = null;

  function setStatus(msg, isError){
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('is-error', !!isError);
    if (msg) showToast(msg, !!isError);
  }

  function setSummary(msg){
    if (summaryEl) summaryEl.textContent = msg || '';
  }

  function showToast(msg, isError){
    if (!msg) return;
    let toast = document.querySelector('.dispatcher-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'dispatcher-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.background = isError ? '#7a2730' : '#1f2a3b';
    toast.classList.add('is-visible');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function(){
      toast.classList.remove('is-visible');
    }, 2400);
  }

  function unlockGate(){
    if (gate) gate.classList.add('hidden');
  }

  function saveToken(token){
    try { sessionStorage.setItem(tokenKey, token); } catch(_) {}
  }

  function loadToken(){
    try { return sessionStorage.getItem(tokenKey) || ''; } catch(_) { return ''; }
  }

  function saveOperator(value){
    try { sessionStorage.setItem(operatorKey, String(value || '').trim()); } catch(_) {}
  }

  function loadOperator(){
    try { return sessionStorage.getItem(operatorKey) || ''; } catch(_) { return ''; }
  }

  function currentToken(){
    return String(loadToken() || '').trim();
  }

  function currentOperator(){
    const fallback = 'dispatcher';
    const fromInput = String(operatorInput && operatorInput.value || '').trim();
    if (fromInput) return fromInput;
    const fromStore = String(loadOperator() || '').trim();
    return fromStore || fallback;
  }

  function normalizeReferenceSuffix(value){
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return '';
    return raw.startsWith('CW-') ? raw.slice(3) : raw;
  }

  function buildReferenceFromSuffix(value){
    const suffix = normalizeReferenceSuffix(value);
    return suffix ? ('CW-' + suffix) : '';
  }

  function isValidDateKeyParts(y, m, d){
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if ([year, month, day].some(Number.isNaN)) return false;
    if (year < 2000 || year > 2100) return false;
    const test = new Date(year, month - 1, day);
    return test.getFullYear() === year && (test.getMonth() + 1) === month && test.getDate() === day;
  }

  function normalizeDateKey(value){
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const parts = raw.split('-');
      return isValidDateKeyParts(parts[0], parts[1], parts[2]) ? raw : '';
    }
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 8) return '';

    const dd = digits.slice(0, 2);
    const mm = digits.slice(2, 4);
    const yyyy = digits.slice(4, 8);
    if (isValidDateKeyParts(yyyy, mm, dd)) return yyyy + '-' + mm + '-' + dd;

    const legacyY = digits.slice(0, 4);
    const legacyM = digits.slice(4, 6);
    const legacyD = digits.slice(6, 8);
    if (isValidDateKeyParts(legacyY, legacyM, legacyD)) return legacyY + '-' + legacyM + '-' + legacyD;

    return '';
  }

  function formatDateForUi(value){
    const normalized = normalizeDateKey(value);
    if (!normalized) return '';
    const parts = normalized.split('-');
    return parts[2] + parts[1] + parts[0];
  }

  function formatDateKey(date){
    const d = date instanceof Date ? date : new Date(date);
    const y = String(d.getFullYear());
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function dateKeyFromReference(ref){
    const match = String(ref || '').toUpperCase().match(/^CW-(\d{8})-/);
    if (!match) return '';
    return normalizeDateKey(match[1]);
  }

  function safeNumber(value, fallback){
    const n = Number(value);
    return Number.isFinite(n) ? n : (Number(fallback) || 0);
  }

  function money(value){
    return safeNumber(value, 0).toFixed(2);
  }

  function normalizeText(value){
    return String(value || '').trim();
  }

  function normalizeStops(stops){
    const list = Array.isArray(stops) ? stops : [];
    return list.map(function(stop){
      return normalizeText(stop && stop.address);
    }).filter(Boolean);
  }

  function stopTextFromRoute(route){
    if (!route || !Array.isArray(route.stops)) return '';
    return normalizeStops(route.stops).join('\n');
  }

  function routeStopsFromText(value){
    return String(value || '').split('\n').map(function(line){
      return normalizeText(line);
    }).filter(Boolean).map(function(address){
      return { address: address };
    });
  }

  async function postAdmin(payload){
    const token = currentToken();
    if (!token) throw new Error('Missing admin token.');
    if (!API_BASE) throw new Error('Booking API is not configured.');

    const bodyPayload = Object.assign({}, payload || {}, { token: token });
    const form = new URLSearchParams();
    form.set('payload', JSON.stringify(bodyPayload));

    const res = await fetch(API_BASE, {
      method: 'POST',
      body: form
    });
    const json = await res.json();
    if (!res.ok || (json && json.error)) {
      throw new Error((json && json.error) || 'Request failed');
    }
    return json;
  }

  async function fetchOrders(params){
    const payload = Object.assign({ action: 'adminList' }, params || {});
    const json = await postAdmin(payload);
    return Array.isArray(json.orders) ? json.orders : [];
  }

  async function fetchLogSheetInfo(){
    return await postAdmin({ action: 'adminSheetInfo' });
  }

  function orderDateKey(order){
    return normalizeText(order && order.schedule && order.schedule.date);
  }

  function orderTimeLabel(order){
    return normalizeText(order && order.schedule && order.schedule.time);
  }

  function orderDateTimeMs(order){
    const iso = normalizeText(order && order.schedule && order.schedule.startIso);
    if (iso) {
      const ms = Date.parse(iso);
      if (!Number.isNaN(ms)) return ms;
    }
    const dateKey = orderDateKey(order);
    const time = orderTimeLabel(order) || '00:00';
    const ms = Date.parse(dateKey + 'T' + time + ':00');
    return Number.isNaN(ms) ? 0 : ms;
  }

  function compareByString(a, b){
    return String(a || '').localeCompare(String(b || ''));
  }

  function sortOrders(orders, mode){
    const list = orders.slice();
    if (mode === 'oldest') {
      list.sort(function(a, b){ return orderDateTimeMs(a) - orderDateTimeMs(b); });
      return list;
    }
    if (mode === 'time-asc') {
      list.sort(function(a, b){ return compareByString(orderTimeLabel(a), orderTimeLabel(b)); });
      return list;
    }
    if (mode === 'time-desc') {
      list.sort(function(a, b){ return compareByString(orderTimeLabel(b), orderTimeLabel(a)); });
      return list;
    }
    if (mode === 'status') {
      list.sort(function(a, b){ return compareByString(a.status, b.status); });
      return list;
    }
    if (mode === 'customer') {
      list.sort(function(a, b){
        return compareByString(a && a.customer && a.customer.name, b && b.customer && b.customer.name);
      });
      return list;
    }
    if (mode === 'reference') {
      list.sort(function(a, b){ return compareByString(a.reference, b.reference); });
      return list;
    }
    list.sort(function(a, b){ return orderDateTimeMs(b) - orderDateTimeMs(a); });
    return list;
  }

  function orderSearchText(order){
    const bits = [];
    bits.push(order.reference || '');
    bits.push(order.title || '');
    bits.push(order.status || '');
    bits.push(order.paymentStatus || '');
    bits.push(order.updatesPreference || '');
    bits.push(order.notes || '');
    bits.push(order.internalNotes || '');
    bits.push(order.riderName || '');
    bits.push(order.riderPhone || '');
    bits.push(orderDateKey(order));
    bits.push(orderTimeLabel(order));

    const customer = order.customer || {};
    bits.push(customer.name || '');
    bits.push(customer.email || '');
    bits.push(customer.phone || '');

    const route = order.route || {};
    if (route.pickup && route.pickup.address) bits.push(route.pickup.address);
    if (route.dropoff && route.dropoff.address) bits.push(route.dropoff.address);
    if (Array.isArray(route.stops)) {
      route.stops.forEach(function(stop){
        if (stop && stop.address) bits.push(stop.address);
      });
    }

    if (Array.isArray(order.timeline)) {
      order.timeline.forEach(function(item){
        bits.push(item && item.status ? String(item.status) : '');
        bits.push(item && item.message ? String(item.message) : '');
      });
    }

    return bits.join(' | ').toLowerCase();
  }

  function filterOrders(){
    const keyword = normalizeText(keywordInput && keywordInput.value).toLowerCase();
    const status = normalizeText(filterStatus && filterStatus.value);
    const updates = normalizeText(filterUpdates && filterUpdates.value);
    const payment = normalizeText(filterPayment && filterPayment.value);
    const fromDateRaw = normalizeText(filterFromDate && filterFromDate.value);
    const toDateRaw = normalizeText(filterToDate && filterToDate.value);
    const fromDate = normalizeDateKey(fromDateRaw);
    const toDate = normalizeDateKey(toDateRaw);
    const sortMode = normalizeText(sortSelect && sortSelect.value) || 'newest';

    const filtered = allOrders.filter(function(order){
      if (status && normalizeText(order.status) !== status) return false;
      if (updates && normalizeText(order.updatesPreference) !== updates) return false;
      if (payment && normalizeText(order.paymentStatus) !== payment) return false;
      const dateKey = orderDateKey(order);
      if (fromDate && dateKey && dateKey < fromDate) return false;
      if (toDate && dateKey && dateKey > toDate) return false;
      if (keyword) {
        const hay = orderSearchText(order);
        if (hay.indexOf(keyword) === -1) return false;
      }
      return true;
    });

    return sortOrders(filtered, sortMode);
  }

  function setSelectOptions(selectEl, values, defaultLabel){
    if (!selectEl) return;
    const prev = String(selectEl.value || '');
    selectEl.innerHTML = '';
    const head = document.createElement('option');
    head.value = '';
    head.textContent = defaultLabel;
    selectEl.appendChild(head);

    values.forEach(function(value){
      const clean = normalizeText(value);
      if (!clean) return;
      const opt = document.createElement('option');
      opt.value = clean;
      opt.textContent = clean;
      selectEl.appendChild(opt);
    });

    if (prev && Array.from(selectEl.options).some(function(o){ return o.value === prev; })) {
      selectEl.value = prev;
    }
  }

  function refreshFilterOptions(){
    const statuses = Array.from(new Set(allOrders.map(function(order){ return normalizeText(order && order.status); }).filter(Boolean))).sort();
    const updates = Array.from(new Set(allOrders.map(function(order){ return normalizeText(order && order.updatesPreference); }).filter(Boolean))).sort();
    setSelectOptions(filterStatus, statuses, 'Any status');
    setSelectOptions(filterUpdates, updates, 'Any updates');
  }

  function statusChip(text, className){
    const chip = document.createElement('span');
    chip.className = 'dispatcher-chip' + (className ? (' ' + className) : '');
    chip.textContent = text;
    return chip;
  }

  function renderTimeline(items){
    if (!Array.isArray(items) || !items.length) {
      const empty = document.createElement('div');
      empty.className = 'dispatcher-status';
      empty.textContent = 'No updates yet.';
      return empty;
    }
    const ul = document.createElement('ul');
    const sorted = items.slice().sort(function(a, b){
      const aTs = Date.parse(String(a && a.ts || ''));
      const bTs = Date.parse(String(b && b.ts || ''));
      const aSafe = Number.isNaN(aTs) ? Number.MAX_SAFE_INTEGER : aTs;
      const bSafe = Number.isNaN(bTs) ? Number.MAX_SAFE_INTEGER : bTs;
      return aSafe - bSafe;
    });

    sorted.slice(-7).forEach(function(item){
      const li = document.createElement('li');
      const ts = normalizeText(item && item.ts).replace('T', ' ').replace('Z', '');
      const status = normalizeText(item && item.status);
      const msg = normalizeText(item && item.message);
      li.textContent = (ts ? (ts + ' - ') : '') + (status ? (status + ': ') : '') + msg;
      ul.appendChild(li);
    });
    return ul;
  }

  function renderPricing(order){
    const quote = order && order.quote ? order.quote : {};
    const breakdown = quote && quote.breakdown ? quote.breakdown : {};
    const currency = normalizeText(quote.currency || 'EUR');

    const base = safeNumber(breakdown.base, 0);
    const distance = safeNumber(breakdown.distance, 0);
    const stops = safeNumber(breakdown.stops, 0);
    const surcharge = safeNumber(breakdown.surcharge, 0);
    const discount = safeNumber(breakdown.discount, 0);
    const adjustment = safeNumber(breakdown.adjustment, 0);
    const total = safeNumber(quote.total, base + distance + stops + surcharge - discount + adjustment);

    const wrap = document.createElement('div');
    wrap.className = 'dispatcher-pricing';

    const title = document.createElement('div');
    title.className = 'dispatcher-block-title';
    title.textContent = 'Pricing Breakdown';
    wrap.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'dispatcher-pricing-grid';

    function row(label, value){
      const item = document.createElement('div');
      const l = document.createElement('span');
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'value';
      v.textContent = currency + ' ' + money(value);
      item.appendChild(l);
      item.appendChild(v);
      grid.appendChild(item);
    }

    row('Base', base);
    row('Distance', distance);
    row('Stops', stops);
    row('Surcharge', surcharge);
    row('Discount', -discount);
    row('Adjustment', adjustment);
    row('Final total', total);

    const extra = document.createElement('div');
    const eta = safeNumber(quote.etaMins, 0);
    const km = safeNumber(quote.totalKm, 0);
    extra.innerHTML = '<span>ETA</span><span class="value">' + eta + ' min</span>';
    grid.appendChild(extra);

    const extra2 = document.createElement('div');
    extra2.innerHTML = '<span>Distance</span><span class="value">' + km.toFixed(1) + ' km</span>';
    grid.appendChild(extra2);

    wrap.appendChild(grid);
    return wrap;
  }

  function buildLink(url, label){
    if (!url) return document.createTextNode('-');
    const a = document.createElement('a');
    a.href = url;
    a.textContent = label || url;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  }

  function setLink(anchor, url){
    if (!anchor) return;
    const clean = normalizeText(url);
    if (!clean) {
      anchor.href = '#';
      anchor.style.pointerEvents = 'none';
      anchor.style.opacity = '0.5';
      return;
    }
    anchor.href = clean;
    anchor.style.pointerEvents = 'auto';
    anchor.style.opacity = '1';
  }

  function applyFilters(){
    const visible = filterOrders();
    renderOrders(visible);

    const scope = loadMode === 'day'
      ? ('for ' + loadLabel)
      : (loadMode === 'all'
        ? 'from all loaded orders'
        : (loadMode === 'reference' || loadMode === 'reference-fallback'
          ? ('for reference ' + (loadLabel || 'search'))
          : ''));

    setSummary('Showing ' + visible.length + ' of ' + allOrders.length + ' order(s)' + (scope ? (' ' + scope) : '') + '.');
  }

  function upsertOrderInState(order, prepend){
    if (!order || !order.eventId) return;
    const idx = allOrders.findIndex(function(item){ return item && item.eventId === order.eventId; });
    if (idx >= 0) {
      allOrders[idx] = order;
    } else if (prepend) {
      allOrders.unshift(order);
    } else {
      allOrders.push(order);
    }
    refreshFilterOptions();
    applyFilters();
  }

  async function refreshCurrentLoad(){
    if (loadMode === 'day') {
      await loadDay(dateInput && dateInput.value ? dateInput.value : formatDateKey(new Date()), true);
      return;
    }
    if (loadMode === 'all') {
      await loadAll(true);
      return;
    }
    if (loadMode === 'reference' || loadMode === 'reference-fallback') {
      if (lastReference) {
        await loadByReference(lastReference, true);
      }
    }
  }

  async function loadDay(dateKey, quiet){
    const normalizedDate = normalizeDateKey(dateKey);
    if (!normalizedDate) {
      setStatus('Choose a valid date.', true);
      return;
    }

    try {
      if (!quiet) setStatus('Loading day...');
      const orders = await fetchOrders({ date: normalizedDate });
      allOrders = orders;
      loadMode = 'day';
      loadLabel = formatDateForUi(normalizedDate);
      if (dateInput) dateInput.value = normalizedDate;
      refreshFilterOptions();
      applyFilters();
      if (!quiet) setStatus('Loaded ' + orders.length + ' order(s).');
    } catch (err) {
      allOrders = [];
      renderOrders([]);
      setSummary('No data yet.');
      setStatus(err && err.message ? err.message : 'Could not load orders.', true);
    }
  }

  async function loadAll(quiet){
    const fromRaw = normalizeText(filterFromDate && filterFromDate.value);
    const toRaw = normalizeText(filterToDate && filterToDate.value);
    const from = normalizeDateKey(fromRaw);
    const to = normalizeDateKey(toRaw);
    if ((fromRaw && !from) || (toRaw && !to)) {
      setStatus('Choose valid From/To dates.', true);
      return;
    }

    try {
      if (!quiet) setStatus('Loading all orders...');
      const orders = await fetchOrders({ scope: 'all', from: from, to: to });
      allOrders = orders;
      loadMode = 'all';
      loadLabel = from || to
        ? ((from ? formatDateForUi(from) : '') + ' .. ' + (to ? formatDateForUi(to) : ''))
        : 'all';
      refreshFilterOptions();
      applyFilters();
      if (!quiet) setStatus('Loaded ' + orders.length + ' total order(s).');
    } catch (err) {
      allOrders = [];
      renderOrders([]);
      setSummary('No data yet.');
      setStatus(err && err.message ? err.message : 'Could not load all orders.', true);
    }
  }

  async function loadByReference(ref, quiet){
    const cleanRef = normalizeText(ref).toUpperCase();
    if (!cleanRef) {
      setStatus('Enter a reference.', true);
      return;
    }
    lastReference = cleanRef;

    const dateKey = dateKeyFromReference(cleanRef);
    try {
      if (!quiet) setStatus('Searching...');
      let orders = [];
      if (dateKey) {
        orders = await fetchOrders({ date: dateKey, ref: cleanRef });
      }
      if (!orders.length) {
        orders = await fetchOrders({ scope: 'all', ref: cleanRef });
        loadMode = 'reference-fallback';
      } else {
        loadMode = 'reference';
      }
      allOrders = orders;
      loadLabel = cleanRef;
      refreshFilterOptions();
      applyFilters();
      if (dateInput && dateKey) dateInput.value = dateKey;
      if (!quiet) setStatus(allOrders.length ? 'Search complete.' : 'No matches.');
    } catch (err) {
      allOrders = [];
      renderOrders([]);
      setSummary('No data yet.');
      setStatus(err && err.message ? err.message : 'Search failed.', true);
    }
  }

  async function openLogSheet(){
    try {
      setStatus('Loading log sheet...');
      const info = await fetchLogSheetInfo();
      const url = normalizeText(info && info.url);
      if (!url) throw new Error('Log sheet URL is unavailable');
      window.open(url, '_blank');
      setStatus('Log sheet opened.');
    } catch (err) {
      setStatus(err && err.message ? err.message : 'Could not open log sheet.', true);
    }
  }

  function clearFilters(){
    if (keywordInput) keywordInput.value = '';
    if (filterStatus) filterStatus.value = '';
    if (filterUpdates) filterUpdates.value = '';
    if (filterPayment) filterPayment.value = '';
    if (filterFromDate) filterFromDate.value = '';
    if (filterToDate) filterToDate.value = '';
    if (sortSelect) sortSelect.value = 'newest';
    applyFilters();
  }

  function editorModelSnapshot(){
    return JSON.stringify({
      customerName: normalizeText(editCustomerName && editCustomerName.value),
      customerEmail: normalizeText(editCustomerEmail && editCustomerEmail.value),
      customerPhone: normalizeText(editCustomerPhone && editCustomerPhone.value),
      updatesPreference: normalizeText(editUpdatesPreference && editUpdatesPreference.value),
      pickup: normalizeText(editPickupAddress && editPickupAddress.value),
      stops: normalizeText(editRouteStops && editRouteStops.value),
      dropoff: normalizeText(editDropoffAddress && editDropoffAddress.value),
      notes: normalizeText(editNotes && editNotes.value),
      date: normalizeText(editScheduleDate && editScheduleDate.value),
      time: normalizeText(editScheduleTime && editScheduleTime.value),
      etaMins: normalizeText(editEtaMins && editEtaMins.value),
      totalKm: normalizeText(editTotalKm && editTotalKm.value),
      cargoType: normalizeText(editCargoType && editCargoType.value),
      loadType: normalizeText(editLoadType && editLoadType.value),
      vehicleType: normalizeText(editVehicleType && editVehicleType.value),
      packageCount: normalizeText(editPackageCount && editPackageCount.value),
      weightKg: normalizeText(editWeightKg && editWeightKg.value),
      volumeM3: normalizeText(editVolumeM3 && editVolumeM3.value),
      priceBase: normalizeText(editPriceBase && editPriceBase.value),
      priceDistance: normalizeText(editPriceDistance && editPriceDistance.value),
      priceStops: normalizeText(editPriceStops && editPriceStops.value),
      priceSurcharge: normalizeText(editPriceSurcharge && editPriceSurcharge.value),
      priceDiscount: normalizeText(editPriceDiscount && editPriceDiscount.value),
      priceAdjustment: normalizeText(editPriceAdjustment && editPriceAdjustment.value),
      priceTotal: normalizeText(editPriceTotal && editPriceTotal.value),
      status: normalizeText(editStatus && editStatus.value),
      paymentStatus: normalizeText(editPaymentStatus && editPaymentStatus.value),
      paymentUrl: normalizeText(editPaymentUrl && editPaymentUrl.value),
      riderName: normalizeText(editRiderName && editRiderName.value),
      riderPhone: normalizeText(editRiderPhone && editRiderPhone.value),
      internalNotes: normalizeText(editInternalNotes && editInternalNotes.value),
      operator: normalizeText(editOperator && editOperator.value),
      saveNote: normalizeText(editSaveNote && editSaveNote.value)
    });
  }

  function setEditorDirty(next){
    editorState.dirty = !!next;
  }

  function updateEditorDirtyFromForm(){
    if (!editorState.open) return;
    const now = editorModelSnapshot();
    setEditorDirty(now !== editorState.snapshot);
  }

  function setEditorFeedback(msg, isError){
    if (!editorFeedback) return;
    editorFeedback.textContent = msg || '';
    editorFeedback.classList.toggle('is-error', !!isError);
  }

  function setCancelFeedback(msg, isError){
    if (!cancelFeedback) return;
    cancelFeedback.textContent = msg || '';
    cancelFeedback.classList.toggle('is-error', !!isError);
  }

  function togglePriceNotice(visible, text){
    if (!priceNotice) return;
    priceNotice.textContent = text || 'This change affects pricing. Quote will be recalculated on save.';
    priceNotice.classList.toggle('is-visible', !!visible);
  }

  function recalculatePriceTotal(){
    const base = safeNumber(editPriceBase && editPriceBase.value, 0);
    const distance = safeNumber(editPriceDistance && editPriceDistance.value, 0);
    const stops = safeNumber(editPriceStops && editPriceStops.value, 0);
    const surcharge = safeNumber(editPriceSurcharge && editPriceSurcharge.value, 0);
    const discount = safeNumber(editPriceDiscount && editPriceDiscount.value, 0);
    const adjustment = safeNumber(editPriceAdjustment && editPriceAdjustment.value, 0);
    const total = base + distance + stops + surcharge - discount + adjustment;
    if (editPriceTotal) editPriceTotal.value = total.toFixed(2);
    togglePriceNotice(true, 'Pricing breakdown changed. Final total recalculated to ' + total.toFixed(2) + '.');
  }

  function closeEditor(force){
    if (!editorModal) return;
    if (!force && editorState.dirty) {
      const ok = window.confirm('Discard unsaved changes?');
      if (!ok) return;
    }
    editorModal.classList.remove('is-open');
    editorModal.setAttribute('aria-hidden', 'true');
    editorState.open = false;
    editorState.order = null;
    editorState.sourceEventId = '';
    setEditorDirty(false);
    setEditorFeedback('');
    togglePriceNotice(false);
  }

  function openEditor(mode, order){
    if (!editorModal) return;

    const normalizedMode = mode || 'edit';
    const source = order || null;
    const quote = source && source.quote ? source.quote : {};
    const route = source && source.route ? source.route : (quote.route || {});
    const customer = source && source.customer ? source.customer : {};
    const breakdown = quote && quote.breakdown ? quote.breakdown : {};

    if (editorTitle) {
      editorTitle.textContent = normalizedMode === 'create'
        ? 'Create new order'
        : (normalizedMode === 'duplicate' ? 'Duplicate order' : 'Edit order');
    }
    if (editorSubtitle) {
      editorSubtitle.textContent = normalizedMode === 'create'
        ? 'Create a clean operational order for phone, WhatsApp, or exception workflows.'
        : (normalizedMode === 'duplicate'
          ? 'Review copied details, adjust scheduling, and save as a new order.'
          : 'Update customer, route, timing, pricing, and operational metadata.');
    }

    const modeCreate = normalizedMode === 'create';
    const modeDuplicate = normalizedMode === 'duplicate';

    if (editCustomerName) editCustomerName.value = modeCreate ? '' : normalizeText(customer.name);
    if (editCustomerEmail) editCustomerEmail.value = modeCreate ? '' : normalizeText(customer.email);
    if (editCustomerPhone) editCustomerPhone.value = modeCreate ? '' : normalizeText(customer.phone);
    if (editUpdatesPreference) editUpdatesPreference.value = modeCreate ? '' : normalizeText(source && source.updatesPreference);

    if (editPickupAddress) editPickupAddress.value = modeCreate ? '' : normalizeText(route && route.pickup && route.pickup.address);
    if (editRouteStops) editRouteStops.value = modeCreate ? '' : stopTextFromRoute(route);
    if (editDropoffAddress) editDropoffAddress.value = modeCreate ? '' : normalizeText(route && route.dropoff && route.dropoff.address);
    if (editNotes) editNotes.value = modeCreate ? '' : normalizeText(source && source.notes);

    if (editScheduleDate) editScheduleDate.value = modeCreate ? (dateInput && dateInput.value ? dateInput.value : formatDateKey(new Date())) : normalizeText(source && source.schedule && source.schedule.date);
    if (editScheduleTime) editScheduleTime.value = modeCreate ? '09:00' : normalizeText(source && source.schedule && source.schedule.time || '09:00');
    if (editEtaMins) editEtaMins.value = String(safeNumber(quote && quote.etaMins, 60));
    if (editTotalKm) editTotalKm.value = String(safeNumber(quote && quote.totalKm, 0));

    if (editCargoType) editCargoType.value = normalizeText(quote && quote.cargoType);
    if (editLoadType) editLoadType.value = normalizeText(quote && quote.loadType);
    if (editVehicleType) editVehicleType.value = normalizeText(quote && quote.vehicleType);
    if (editPackageCount) editPackageCount.value = String(safeNumber(quote && quote.packageCount, 0));
    if (editWeightKg) editWeightKg.value = String(safeNumber(quote && quote.weightKg, 0));
    if (editVolumeM3) editVolumeM3.value = String(safeNumber(quote && quote.volumeM3, 0));

    if (editPriceBase) editPriceBase.value = String(safeNumber(breakdown.base, 0));
    if (editPriceDistance) editPriceDistance.value = String(safeNumber(breakdown.distance, 0));
    if (editPriceStops) editPriceStops.value = String(safeNumber(breakdown.stops, 0));
    if (editPriceSurcharge) editPriceSurcharge.value = String(safeNumber(breakdown.surcharge, 0));
    if (editPriceDiscount) editPriceDiscount.value = String(safeNumber(breakdown.discount, 0));
    if (editPriceAdjustment) editPriceAdjustment.value = String(safeNumber(breakdown.adjustment, 0));
    if (editPriceTotal) editPriceTotal.value = String(safeNumber(quote && quote.total, 0));

    if (editStatus) editStatus.value = modeCreate || modeDuplicate ? 'Confirmed' : normalizeText(source && source.status || 'Confirmed');
    if (editPaymentStatus) editPaymentStatus.value = modeCreate || modeDuplicate ? 'Pending' : normalizeText(source && source.paymentStatus || 'Pending');
    if (editPaymentUrl) editPaymentUrl.value = modeCreate || modeDuplicate ? '' : normalizeText(source && source.paymentUrl);
    if (editPodUrl) editPodUrl.value = modeCreate || modeDuplicate ? '' : normalizeText(source && source.podUrl);

    if (editRiderName) editRiderName.value = modeCreate ? '' : normalizeText(source && source.riderName);
    if (editRiderPhone) editRiderPhone.value = modeCreate ? '' : normalizeText(source && source.riderPhone);
    if (editInternalNotes) editInternalNotes.value = modeCreate ? '' : normalizeText(source && source.internalNotes);
    if (editOperator) editOperator.value = currentOperator();
    if (editSaveNote) {
      editSaveNote.value = modeDuplicate
        ? ('Duplicated from ' + normalizeText(source && source.reference))
        : (modeCreate ? 'Manual booking created by dispatcher' : '');
    }

    if (editorCancelOrderBtn) {
      editorCancelOrderBtn.style.display = modeCreate ? 'none' : 'inline-flex';
      editorCancelOrderBtn.disabled = modeDuplicate;
    }

    togglePriceNotice(false);
    setEditorFeedback('');

    editorState.open = true;
    editorState.mode = normalizedMode;
    editorState.order = source;
    editorState.sourceEventId = normalizeText(source && source.eventId);
    editorState.snapshot = editorModelSnapshot();
    setEditorDirty(false);

    editorModal.classList.add('is-open');
    editorModal.setAttribute('aria-hidden', 'false');
  }

  function collectEditorOrderData(){
    const breakdown = {
      base: safeNumber(editPriceBase && editPriceBase.value, 0),
      distance: safeNumber(editPriceDistance && editPriceDistance.value, 0),
      stops: safeNumber(editPriceStops && editPriceStops.value, 0),
      surcharge: safeNumber(editPriceSurcharge && editPriceSurcharge.value, 0),
      discount: safeNumber(editPriceDiscount && editPriceDiscount.value, 0),
      adjustment: safeNumber(editPriceAdjustment && editPriceAdjustment.value, 0)
    };

    const total = safeNumber(editPriceTotal && editPriceTotal.value, 0);

    return {
      customer: {
        name: normalizeText(editCustomerName && editCustomerName.value),
        email: normalizeText(editCustomerEmail && editCustomerEmail.value),
        phone: normalizeText(editCustomerPhone && editCustomerPhone.value)
      },
      quote: {
        schedule: {
          date: normalizeText(editScheduleDate && editScheduleDate.value),
          time: normalizeText(editScheduleTime && editScheduleTime.value)
        },
        route: {
          pickup: { address: normalizeText(editPickupAddress && editPickupAddress.value) },
          stops: routeStopsFromText(editRouteStops && editRouteStops.value),
          dropoff: { address: normalizeText(editDropoffAddress && editDropoffAddress.value) }
        },
        total: total,
        etaMins: Math.max(15, safeNumber(editEtaMins && editEtaMins.value, 60)),
        totalKm: safeNumber(editTotalKm && editTotalKm.value, 0),
        currency: 'EUR',
        cargoType: normalizeText(editCargoType && editCargoType.value),
        loadType: normalizeText(editLoadType && editLoadType.value),
        vehicleType: normalizeText(editVehicleType && editVehicleType.value),
        packageCount: safeNumber(editPackageCount && editPackageCount.value, 0),
        weightKg: safeNumber(editWeightKg && editWeightKg.value, 0),
        volumeM3: safeNumber(editVolumeM3 && editVolumeM3.value, 0),
        breakdown: Object.assign({}, breakdown, { total: total })
      },
      notes: normalizeText(editNotes && editNotes.value),
      updatesPreference: normalizeText(editUpdatesPreference && editUpdatesPreference.value),
      language: 'en',
      sourceUrl: window.location.href
    };
  }

  function validateEditorData(orderData){
    const customerName = normalizeText(orderData && orderData.customer && orderData.customer.name);
    const pickup = normalizeText(orderData && orderData.quote && orderData.quote.route && orderData.quote.route.pickup && orderData.quote.route.pickup.address);
    const dropoff = normalizeText(orderData && orderData.quote && orderData.quote.route && orderData.quote.route.dropoff && orderData.quote.route.dropoff.address);
    const date = normalizeDateKey(orderData && orderData.quote && orderData.quote.schedule && orderData.quote.schedule.date);
    const time = normalizeText(orderData && orderData.quote && orderData.quote.schedule && orderData.quote.schedule.time);

    if (!customerName) return 'Customer name is required.';
    if (!pickup || !dropoff) return 'Pickup and dropoff are required.';
    if (!date || !time) return 'Date and time are required.';
    return '';
  }

  async function saveEditor(){
    if (!editorState.open) return;

    const orderData = collectEditorOrderData();
    const validation = validateEditorData(orderData);
    if (validation) {
      setEditorFeedback(validation, true);
      return;
    }

    const common = {
      operator: normalizeText(editOperator && editOperator.value) || currentOperator(),
      status: normalizeText(editStatus && editStatus.value) || 'Confirmed',
      paymentStatus: normalizeText(editPaymentStatus && editPaymentStatus.value) || 'Pending',
      paymentUrl: normalizeText(editPaymentUrl && editPaymentUrl.value),
      riderName: normalizeText(editRiderName && editRiderName.value),
      riderPhone: normalizeText(editRiderPhone && editRiderPhone.value),
      internalNotes: normalizeText(editInternalNotes && editInternalNotes.value),
      message: normalizeText(editSaveNote && editSaveNote.value)
    };

    try {
      setEditorFeedback('Saving...');
      let res = null;

      if (editorState.mode === 'create') {
        res = await postAdmin(Object.assign({}, common, {
          action: 'adminCreateOrder',
          order: orderData
        }));
      } else if (editorState.mode === 'duplicate') {
        const sourceEventId = normalizeText(editorState.sourceEventId);
        if (!sourceEventId) throw new Error('Missing source order.');
        res = await postAdmin(Object.assign({}, common, {
          action: 'adminDuplicateOrder',
          eventId: sourceEventId,
          order: orderData
        }));
      } else {
        const eventId = normalizeText(editorState.sourceEventId);
        if (!eventId) throw new Error('Missing eventId.');
        res = await postAdmin(Object.assign({}, common, {
          action: 'adminEditOrder',
          eventId: eventId,
          order: orderData
        }));
      }

      const order = res && res.order ? res.order : null;
      if (order) upsertOrderInState(order, true);
      closeEditor(true);
      setStatus(editorState.mode === 'create' ? 'Order created.' : (editorState.mode === 'duplicate' ? 'Order duplicated.' : 'Order saved.'));
    } catch (err) {
      setEditorFeedback(err && err.message ? err.message : 'Save failed.', true);
    }
  }

  function openCancelModal(order){
    if (!cancelModal || !order || !order.eventId) return;
    cancelTargetOrder = order;
    if (cancelReason) cancelReason.value = '';
    setCancelFeedback('');
    cancelModal.classList.add('is-open');
    cancelModal.setAttribute('aria-hidden', 'false');
  }

  function closeCancelModal(){
    if (!cancelModal) return;
    cancelModal.classList.remove('is-open');
    cancelModal.setAttribute('aria-hidden', 'true');
    cancelTargetOrder = null;
    setCancelFeedback('');
  }

  async function confirmCancellation(){
    if (!cancelTargetOrder || !cancelTargetOrder.eventId) return;

    try {
      setCancelFeedback('Canceling order...');
      const operator = currentOperator();
      const reason = normalizeText(cancelReason && cancelReason.value) || 'Canceled by dispatcher';
      const res = await postAdmin({
        action: 'adminCancelOrder',
        eventId: cancelTargetOrder.eventId,
        reason: reason,
        operator: operator
      });
      const order = res && res.order ? res.order : null;
      if (order) upsertOrderInState(order, false);
      closeCancelModal();
      if (editorState.open && editorState.sourceEventId === cancelTargetOrder.eventId) {
        closeEditor(true);
      }
      setStatus('Order canceled.');
    } catch (err) {
      setCancelFeedback(err && err.message ? err.message : 'Cancellation failed.', true);
    }
  }

  async function quickUpdate(order, controls, sendChannels){
    try {
      const note = normalizeText(controls.note && controls.note.value);
      if (sendChannels && !note) {
        setStatus('Add a note before sending an update.', true);
        return;
      }

      setStatus(sendChannels ? 'Sending update...' : 'Saving quick changes...');
      const payload = {
        action: 'adminUpdate',
        eventId: order.eventId,
        status: normalizeText(controls.status && controls.status.value) || normalizeText(order.status),
        paymentStatus: normalizeText(controls.payment && controls.payment.value) || normalizeText(order.paymentStatus),
        riderName: normalizeText(controls.riderName && controls.riderName.value),
        riderPhone: normalizeText(controls.riderPhone && controls.riderPhone.value),
        internalNotes: normalizeText(controls.internalNotes && controls.internalNotes.value),
        scheduleDate: normalizeText(controls.date && controls.date.value),
        scheduleTime: normalizeText(controls.time && controls.time.value),
        etaMins: normalizeText(controls.eta && controls.eta.value),
        message: note,
        operator: currentOperator()
      };

      if (sendChannels) {
        payload.send = { email: true, whatsapp: true };
      }

      const res = await postAdmin(payload);
      if (sendChannels && res && res.send && res.send.whatsappUrl) {
        try { window.open(res.send.whatsappUrl, '_blank'); } catch(_) {}
      }
      if (controls.note) controls.note.value = '';
      await refreshCurrentLoad();
      setStatus(sendChannels ? 'Update sent.' : 'Order updated.');
    } catch (err) {
      setStatus(err && err.message ? err.message : 'Update failed.', true);
    }
  }

  function bindPodUpload(order, controls){
    const podInput = controls.podInput;
    const podUpload = controls.podUpload;
    const podName = controls.podName;
    const podLink = controls.podLink;

    if (!podInput || !podUpload || !podName) return;

    podInput.addEventListener('change', function(){
      const file = podInput.files && podInput.files[0];
      if (!file) {
        podUpload.disabled = true;
        podName.textContent = 'No file selected';
        return;
      }
      podUpload.disabled = false;
      podName.textContent = file.name;
    });

    podUpload.addEventListener('click', function(){
      const file = podInput.files && podInput.files[0];
      if (!file) {
        setStatus('Choose a POD photo first.', true);
        return;
      }

      const reader = new FileReader();
      reader.onload = async function(){
        try {
          setStatus('Uploading POD...');
          const res = await postAdmin({
            action: 'adminPod',
            eventId: order.eventId,
            fileName: file.name,
            contentType: file.type,
            data: String(reader.result || '')
          });
          if (res && res.podUrl) {
            setLink(podLink, res.podUrl);
          }
          await refreshCurrentLoad();
          setStatus('POD uploaded.');
        } catch (err) {
          setStatus(err && err.message ? err.message : 'POD upload failed.', true);
        } finally {
          podInput.value = '';
          podUpload.disabled = true;
          podName.textContent = 'No file selected';
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function renderOrders(orders){
    if (!ordersWrap) return;
    ordersWrap.innerHTML = '';

    if (!orders.length) {
      const empty = document.createElement('div');
      empty.className = 'dispatcher-empty';
      empty.textContent = 'No orders match the current filters.';
      ordersWrap.appendChild(empty);
      return;
    }

    orders.forEach(function(order){
      const card = document.createElement('article');
      card.className = 'dispatcher-card';

      const top = document.createElement('div');
      top.className = 'dispatcher-card-top';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'dispatcher-card-title';
      const title = document.createElement('h3');
      title.textContent = (normalizeText(order.reference) || 'Order') + ' - ' + (normalizeText(order.status) || '');
      titleWrap.appendChild(title);

      const sub = document.createElement('div');
      sub.className = 'dispatcher-subline';
      sub.textContent = 'Date ' + (formatDateForUi(orderDateKey(order)) || '-') + ' at ' + (orderTimeLabel(order) || '-') + ' | ' + (normalizeText(order && order.customer && order.customer.name) || 'No customer');
      titleWrap.appendChild(sub);
      top.appendChild(titleWrap);

      const badges = document.createElement('div');
      badges.className = 'dispatcher-badges';
      badges.appendChild(statusChip(normalizeText(order.status) || 'Unknown', normalizeText(order.status) === 'Canceled' ? 'is-danger' : ''));
      badges.appendChild(statusChip('Payment: ' + (normalizeText(order.paymentStatus) || '-'), normalizeText(order.paymentStatus) === 'Paid' ? 'is-ok' : ''));
      if (normalizeText(order.riderName)) badges.appendChild(statusChip('Rider: ' + normalizeText(order.riderName)));
      if (order && order.isArchived) badges.appendChild(statusChip('Archived', 'is-danger'));
      top.appendChild(badges);

      card.appendChild(top);

      const meta = document.createElement('div');
      meta.className = 'dispatcher-meta';
      meta.innerHTML =
        '<span><strong>Customer:</strong> ' + (normalizeText(order && order.customer && order.customer.name) || '-') + '</span>' +
        '<span><strong>Email:</strong> ' + (normalizeText(order && order.customer && order.customer.email) || '-') + '</span>' +
        '<span><strong>Phone:</strong> ' + (normalizeText(order && order.customer && order.customer.phone) || '-') + '</span>' +
        '<span><strong>Pickup:</strong> ' + (normalizeText(order && order.route && order.route.pickup && order.route.pickup.address) || '-') + '</span>' +
        '<span><strong>Dropoff:</strong> ' + (normalizeText(order && order.route && order.route.dropoff && order.route.dropoff.address) || '-') + '</span>' +
        '<span><strong>Updates:</strong> ' + (normalizeText(order && order.updatesPreference) || 'Default') + '</span>';
      card.appendChild(meta);

      const quick = document.createElement('div');
      quick.className = 'dispatcher-quick';

      function quickField(label, spanClass, control){
        const wrap = document.createElement('div');
        wrap.className = 'dispatcher-field ' + spanClass;
        const lbl = document.createElement('label');
        lbl.textContent = label;
        wrap.appendChild(lbl);
        wrap.appendChild(control);
        quick.appendChild(wrap);
      }

      const quickStatus = document.createElement('select');
      ORDER_STATUS_VALUES.forEach(function(value){
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        if (normalizeText(order.status) === value) option.selected = true;
        quickStatus.appendChild(option);
      });

      const quickPayment = document.createElement('select');
      PAYMENT_STATUS_VALUES.forEach(function(value){
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        if (normalizeText(order.paymentStatus) === value) option.selected = true;
        quickPayment.appendChild(option);
      });

      const quickRiderName = document.createElement('input');
      quickRiderName.type = 'text';
      quickRiderName.value = normalizeText(order.riderName);

      const quickRiderPhone = document.createElement('input');
      quickRiderPhone.type = 'text';
      quickRiderPhone.value = normalizeText(order.riderPhone);

      const quickDate = document.createElement('input');
      quickDate.type = 'date';
      quickDate.value = normalizeText(order && order.schedule && order.schedule.date);

      const quickTime = document.createElement('input');
      quickTime.type = 'time';
      quickTime.value = normalizeText(order && order.schedule && order.schedule.time);

      const quickEta = document.createElement('input');
      quickEta.type = 'number';
      quickEta.min = '15';
      quickEta.step = '5';
      quickEta.value = String(safeNumber(order && order.quote && order.quote.etaMins, 60));

      const quickInternalNotes = document.createElement('input');
      quickInternalNotes.type = 'text';
      quickInternalNotes.value = normalizeText(order.internalNotes);

      const quickNote = document.createElement('textarea');
      quickNote.placeholder = 'Add dispatcher note or customer update...';

      quickField('Status', 'span-2', quickStatus);
      quickField('Payment', 'span-2', quickPayment);
      quickField('Rider name', 'span-2', quickRiderName);
      quickField('Rider phone', 'span-2', quickRiderPhone);
      quickField('Date', 'span-2', quickDate);
      quickField('Time', 'span-2', quickTime);
      quickField('ETA min', 'span-2', quickEta);
      quickField('Internal note', 'span-4', quickInternalNotes);
      quickField('Quick note', 'span-8', quickNote);

      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'dispatcher-inline-actions span-12';

      const quickSaveBtn = document.createElement('button');
      quickSaveBtn.type = 'button';
      quickSaveBtn.className = 'btn btn--ghost';
      quickSaveBtn.textContent = 'Save quick';

      const quickSendBtn = document.createElement('button');
      quickSendBtn.type = 'button';
      quickSendBtn.className = 'btn';
      quickSendBtn.textContent = 'Send update';

      const fullEditBtn = document.createElement('button');
      fullEditBtn.type = 'button';
      fullEditBtn.className = 'btn btn--ghost';
      fullEditBtn.textContent = 'Full edit';

      const duplicateBtn = document.createElement('button');
      duplicateBtn.type = 'button';
      duplicateBtn.className = 'btn btn--ghost';
      duplicateBtn.textContent = 'Duplicate';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn--ghost';
      cancelBtn.textContent = 'Cancel';

      actionsWrap.appendChild(quickSaveBtn);
      actionsWrap.appendChild(quickSendBtn);
      actionsWrap.appendChild(fullEditBtn);
      actionsWrap.appendChild(duplicateBtn);
      actionsWrap.appendChild(cancelBtn);

      const podLink = document.createElement('a');
      podLink.className = 'btn btn--ghost';
      podLink.target = '_blank';
      podLink.rel = 'noopener';
      podLink.textContent = 'POD';
      setLink(podLink, normalizeText(order.podUrl));

      const podChoose = document.createElement('button');
      podChoose.type = 'button';
      podChoose.className = 'btn btn--ghost';
      podChoose.textContent = 'Choose POD';

      const podUpload = document.createElement('button');
      podUpload.type = 'button';
      podUpload.className = 'btn btn--ghost';
      podUpload.textContent = 'Upload POD';
      podUpload.disabled = true;

      const podName = document.createElement('span');
      podName.className = 'dispatcher-status';
      podName.textContent = 'No file selected';

      const podInput = document.createElement('input');
      podInput.type = 'file';
      podInput.accept = 'image/*';
      podInput.style.display = 'none';

      podChoose.addEventListener('click', function(){
        try { podInput.click(); } catch(_) {}
      });

      actionsWrap.appendChild(podLink);
      actionsWrap.appendChild(podChoose);
      actionsWrap.appendChild(podUpload);
      actionsWrap.appendChild(podName);
      actionsWrap.appendChild(podInput);
      quick.appendChild(actionsWrap);

      const quickControls = {
        status: quickStatus,
        payment: quickPayment,
        riderName: quickRiderName,
        riderPhone: quickRiderPhone,
        date: quickDate,
        time: quickTime,
        eta: quickEta,
        internalNotes: quickInternalNotes,
        note: quickNote,
        podInput: podInput,
        podUpload: podUpload,
        podName: podName,
        podLink: podLink
      };

      quickSaveBtn.addEventListener('click', function(){
        quickUpdate(order, quickControls, false);
      });

      quickSendBtn.addEventListener('click', function(){
        quickUpdate(order, quickControls, true);
      });

      fullEditBtn.addEventListener('click', function(){
        openEditor('edit', order);
      });

      duplicateBtn.addEventListener('click', function(){
        openEditor('duplicate', order);
      });

      cancelBtn.addEventListener('click', function(){
        openCancelModal(order);
      });

      bindPodUpload(order, quickControls);

      card.appendChild(quick);
      card.appendChild(renderPricing(order));

      const notesBox = document.createElement('div');
      notesBox.className = 'dispatcher-notes';
      const notesTitle = document.createElement('div');
      notesTitle.className = 'dispatcher-block-title';
      notesTitle.textContent = 'Notes';
      notesBox.appendChild(notesTitle);

      const customerNotes = normalizeText(order.notes);
      const internalNotes = normalizeText(order.internalNotes);
      const cancelReasonText = normalizeText(order.canceledReason);
      notesBox.appendChild(document.createTextNode('Customer: ' + (customerNotes || '-')));
      notesBox.appendChild(document.createElement('br'));
      notesBox.appendChild(document.createTextNode('Internal: ' + (internalNotes || '-')));
      if (cancelReasonText) {
        notesBox.appendChild(document.createElement('br'));
        notesBox.appendChild(document.createTextNode('Cancel reason: ' + cancelReasonText));
      }
      card.appendChild(notesBox);

      const history = document.createElement('div');
      history.className = 'dispatcher-history';
      const hTitle = document.createElement('div');
      hTitle.className = 'dispatcher-block-title';
      hTitle.textContent = 'Timeline';
      history.appendChild(hTitle);
      history.appendChild(renderTimeline(order.timeline || []));
      card.appendChild(history);

      ordersWrap.appendChild(card);
    });
  }

  function handleGate(){
    const token = normalizeText(tokenInput && tokenInput.value);
    if (!token) {
      if (gateStatus) gateStatus.textContent = 'Enter a token.';
      return;
    }
    saveToken(token);
    saveOperator(currentOperator());
    if (gateStatus) gateStatus.textContent = '';
    unlockGate();
    setStatus('Workspace unlocked.');
  }

  async function handleNewOrder(){
    if (!currentToken()) {
      setStatus('Unlock with admin token first.', true);
      return;
    }
    openEditor('create', null);
  }

  function onControlChange(){
    if (filterTimer) window.clearTimeout(filterTimer);
    filterTimer = window.setTimeout(applyFilters, 140);
  }

  if (tokenButton) tokenButton.addEventListener('click', handleGate);
  if (tokenInput) tokenInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter') {
      e.preventDefault();
      handleGate();
    }
  });

  if (operatorInput) {
    operatorInput.addEventListener('input', function(){
      saveOperator(operatorInput.value);
    });
  }

  if (loadBtn) loadBtn.addEventListener('click', function(){
    const value = dateInput && dateInput.value ? dateInput.value : formatDateKey(new Date());
    loadDay(value, false);
  });
  if (loadAllBtn) loadAllBtn.addEventListener('click', function(){ loadAll(false); });
  if (todayBtn) todayBtn.addEventListener('click', function(){
    const today = formatDateKey(new Date());
    if (dateInput) dateInput.value = today;
    loadDay(today, false);
  });
  if (searchBtn) searchBtn.addEventListener('click', function(){
    const ref = buildReferenceFromSuffix(searchInput && searchInput.value);
    loadByReference(ref, false);
  });
  if (searchInput) searchInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter') {
      e.preventDefault();
      const ref = buildReferenceFromSuffix(searchInput.value);
      loadByReference(ref, false);
    }
  });

  if (logSheetBtn) logSheetBtn.addEventListener('click', openLogSheet);
  if (newOrderBtn) newOrderBtn.addEventListener('click', handleNewOrder);
  if (applyFiltersBtn) applyFiltersBtn.addEventListener('click', applyFilters);
  if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', clearFilters);

  [keywordInput, filterStatus, filterUpdates, filterPayment, filterFromDate, filterToDate, sortSelect]
    .forEach(function(control){
      if (!control) return;
      const eventName = control.tagName === 'INPUT' ? 'input' : 'change';
      control.addEventListener(eventName, onControlChange);
    });

  [editorClose, editorCloseBottom].forEach(function(btn){
    if (!btn) return;
    btn.addEventListener('click', function(){ closeEditor(false); });
  });

  if (editorSave) editorSave.addEventListener('click', saveEditor);
  if (editorCancelOrderBtn) {
    editorCancelOrderBtn.addEventListener('click', function(){
      if (!editorState.order || !editorState.order.eventId) return;
      openCancelModal(editorState.order);
    });
  }

  if (cancelClose) cancelClose.addEventListener('click', closeCancelModal);
  if (cancelAbort) cancelAbort.addEventListener('click', closeCancelModal);
  if (cancelConfirm) cancelConfirm.addEventListener('click', confirmCancellation);

  if (editorModal) {
    editorModal.addEventListener('click', function(e){
      if (e.target === editorModal) closeEditor(false);
    });
  }

  if (cancelModal) {
    cancelModal.addEventListener('click', function(e){
      if (e.target === cancelModal) closeCancelModal();
    });
  }

  [editPriceBase, editPriceDistance, editPriceStops, editPriceSurcharge, editPriceDiscount, editPriceAdjustment]
    .forEach(function(input){
      if (!input) return;
      input.addEventListener('input', function(){
        recalculatePriceTotal();
        updateEditorDirtyFromForm();
      });
    });

  editorInputs.forEach(function(input){
    if (!input) return;
    input.addEventListener('input', updateEditorDirtyFromForm);
    input.addEventListener('change', updateEditorDirtyFromForm);
  });

  window.addEventListener('beforeunload', function(e){
    if (!editorState.open || !editorState.dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  (function init(){
    const token = loadToken();
    const operator = loadOperator();
    if (token) unlockGate();
    if (operatorInput) operatorInput.value = operator || 'dispatcher';
    const today = formatDateKey(new Date());
    if (dateInput) dateInput.value = today;
  })();
})();
