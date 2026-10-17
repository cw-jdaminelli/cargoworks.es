(function(){
  const API_BASE = (window.CARGOWORKS_BOOKING_API || '').replace(/\/$/, '');
  const tokenKey = 'cwDispatcherToken';
  const operatorKey = 'cwDispatcherOperator';

  const ORDER_STATUS_VALUES = [
    'Confirmed',
    'Assigned',
    'OMW',
    'Picked up',
    'In transit',
    'Delivered',
    'Failed',
    'Canceled',
    'Delivery rejected'
  ];
  // 'Account' = business-account order not yet paid. It must be selectable on
  // the card, otherwise a quick save silently flips account orders to 'Pending'.
  const PAYMENT_STATUS_VALUES = ['Pending', 'Paid', 'Failed', 'Account'];
  const UPDATES_PREFERENCE_VALUES = ['email', 'whatsapp', 'none'];
  const knownAccountsKey = 'cwDispatcherKnownAccounts';

  let _ridersCache = []; // { id, name, active }
  let _ridersLoadedAt = 0;

  // Fetched alongside every order load (see fetchOrders) so each card's
  // "Assign rider" list is already filled when the card is drawn, and newly
  // created riders show up within a few minutes without reloading the page.
  function ensureRidersCache() {
    if (_ridersCache.length && Date.now() - _ridersLoadedAt < 5 * 60 * 1000) return Promise.resolve();
    return loadRidersCache();
  }

  async function loadRidersCache() {
    const token = currentToken();
    if (!token || !API_BASE) return;
    try {
      const payload = JSON.stringify({ action: 'adminManageRiders', token: token, op: 'list' });
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'payload=' + encodeURIComponent(payload)
      });
      const json = await res.json();
      if (json.riders) {
        _ridersCache = json.riders.filter(function(r){ return r.active !== false; });
        refreshRiderSuggestions();
        _ridersLoadedAt = Date.now();
      }
    } catch(_) {}
  }

  const gate = document.getElementById('dispatcherGate');
  const tokenInput = document.getElementById('dispatcherTokenInput');
  const tokenButton = document.getElementById('dispatcherTokenButton');
  const gateStatus = document.getElementById('dispatcherGateStatus');

  const dateInput = document.getElementById('dispatcherDate');
  const operatorInput = document.getElementById('dispatcherOperator');
  const loadBtn = document.getElementById('dispatcherLoad');
  const loadAllBtn = document.getElementById('dispatcherLoadAll');
  const todayBtn = document.getElementById('dispatcherToday');
  const yesterdayBtn = document.getElementById('dispatcherYesterday');
  const prevDayBtn = document.getElementById('dispatcherPrevDay');
  const nextDayBtn = document.getElementById('dispatcherNextDay');
  const searchInput = document.getElementById('dispatcherSearchInput');
  const searchBtn = document.getElementById('dispatcherSearchButton');
  const logSheetBtn = document.getElementById('dispatcherLogSheet');
  const newOrderBtn = document.getElementById('dispatcherNewOrder');
  const accountInput = document.getElementById('dispatcherAccountInput');
  const accountList = document.getElementById('dispatcherAccountList');
  const loadAccountBtn = document.getElementById('dispatcherLoadAccount');
  const filterInvoiced = document.getElementById('dispatcherFilterInvoiced');

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
  const editAccountToken = document.getElementById('editAccountToken');
  const editAccountVerifyBtn = document.getElementById('editAccountVerifyBtn');
  const editAccountStatus = document.getElementById('editAccountStatus');
  const editAccountFieldsWrap = document.getElementById('editAccountFieldsWrap');
  const editAccountStaffName = document.getElementById('editAccountStaffName');
  const editAccountPickupTime = document.getElementById('editAccountPickupTime');
  const editAccountDropoffTime = document.getElementById('editAccountDropoffTime');
  const editAccountAttName = document.getElementById('editAccountAttName');
  const editAccountAttContact = document.getElementById('editAccountAttContact');
  const editStopsList = document.getElementById('editStopsList');
  const addStopBtn = document.getElementById('addStopBtn');
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
  const editPriceVatSplit = document.getElementById('editPriceVatSplit');
  const editStatus = document.getElementById('editStatus');
  const editPaymentStatus = document.getElementById('editPaymentStatus');
  const editPaymentUrl = document.getElementById('editPaymentUrl');
  const editRiderName = document.getElementById('editRiderName');
  const editRiderPhone = document.getElementById('editRiderPhone');
  const editInternalNotes = document.getElementById('editInternalNotes');
  const editOperator = document.getElementById('editOperator');
  const editSaveNote = document.getElementById('editSaveNote');

  // Quick Import panel refs
  const importPanel      = document.getElementById('importPanel');
  const importText       = document.getElementById('importText');
  const importDropZone   = document.getElementById('importDropZone');
  const importImageInput = document.getElementById('importImageInput');
  const importImageName  = document.getElementById('importImageName');
  const importDropLabel  = document.getElementById('importDropLabel');
  const importExtractBtn = document.getElementById('importExtractBtn');
  const importClearBtn   = document.getElementById('importClearBtn');
  const importStatus     = document.getElementById('importStatus');
  // Quick Import used to keep a pasted Anthropic key here; it now runs in the
  // backend, so drop any key left over in this browser.
  try { sessionStorage.removeItem('cwAnthropicKey'); } catch(_) {}

  // Stop quick-add refs
  const stopsQuickAddToggle = document.getElementById('stopsQuickAddToggle');
  const stopsQuickPanel     = document.getElementById('stopsQuickPanel');
  const stopsQCamera        = document.getElementById('stopsQCamera');
  const stopsQFile          = document.getElementById('stopsQFile');
  const stopsQType          = document.getElementById('stopsQType');
  const stopsQFileInput     = document.getElementById('stopsQFileInput');
  const stopsQTypeWrap      = document.getElementById('stopsQTypeWrap');
  const stopsQTypeInput     = document.getElementById('stopsQTypeInput');
  const stopsQTypeAddBtn    = document.getElementById('stopsQTypeAddBtn');
  const stopsQConfirmWrap   = document.getElementById('stopsQConfirmWrap');
  const stopsQConfirmInput  = document.getElementById('stopsQConfirmInput');
  const stopsQConfirmBtn    = document.getElementById('stopsQConfirmBtn');
  const stopsQDiscardBtn    = document.getElementById('stopsQDiscardBtn');
  const stopsQStatus        = document.getElementById('stopsQStatus');
  const stopsQListWrap      = document.getElementById('stopsQListWrap');
  const stopsQListItems     = document.getElementById('stopsQListItems');

  // Camera overlay refs
  const stopsQCameraOverlay  = document.getElementById('stopsQCameraOverlay');
  const stopsQCameraVideo    = document.getElementById('stopsQCameraVideo');
  const stopsQCameraCanvas   = document.getElementById('stopsQCameraCanvas');
  const stopsQCameraCapture  = document.getElementById('stopsQCameraCapture');
  const stopsQCameraCancel   = document.getElementById('stopsQCameraCancel');
  const stopsQCameraMsg      = document.getElementById('stopsQCameraMsg');

  var _cameraStream = null; // active MediaStream, if any

  // Maps route link
  const editMapsRouteLink = document.getElementById('editMapsRouteLink');

  // Pricing override
  const editPriceOverride        = document.getElementById('editPriceOverride');
  const editPriceBreakdownFields = document.getElementById('editPriceBreakdownFields');
  const editPriceManualHint      = document.getElementById('editPriceManualHint');

  // Elapsed-time billing (multi-stop B2B accounts)
  const editBillingMode       = document.getElementById('editBillingMode');
  const editElapsedFields     = document.getElementById('editElapsedFields');
  const editHourlyRate        = document.getElementById('editHourlyRate');
  const editRouteStartedAt    = document.getElementById('editRouteStartedAt');
  const editRouteCompletedAt  = document.getElementById('editRouteCompletedAt');
  const editElapsedMinutes    = document.getElementById('editElapsedMinutes');
  const editElapsedOverride   = document.getElementById('editElapsedOverride');
  const editElapsedManualHint = document.getElementById('editElapsedManualHint');

  // Per-stop billing (route-sheet jobs): stops x rate, before IVA
  const editPerStopFields     = document.getElementById('editPerStopFields');
  const editStopCount         = document.getElementById('editStopCount');
  const editStopRate          = document.getElementById('editStopRate');

  // Payment link button
  const editCreatePaymentBtn    = document.getElementById('editCreatePaymentBtn');
  const editCreatePaymentStatus = document.getElementById('editCreatePaymentStatus');

  // System pricing
  const editGetSystemPricing  = document.getElementById('editGetSystemPricing');
  const systemPricingStatus   = document.getElementById('systemPricingStatus');
  const editPromoCode         = document.getElementById('editPromoCode');
  const editPriceSubtotal     = document.getElementById('editPriceSubtotal');

  let importImageBase64  = null;
  let importImageMime    = null;

  // Maps route link debounce
  let _mapsLinkTimer = null;

  const editorInputs = [
    editCustomerName, editCustomerEmail, editCustomerPhone, editUpdatesPreference,
    editNotes,
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
  let lastAccount = '';
  let filterTimer = null;
  // Bumped by every order load; a load whose response arrives after a newer
  // one started is dropped, so a slow earlier request can't overwrite it.
  let loadSeq = 0;
  let loadedDayKey = '';
  // Orders ticked on their card checkbox (by eventId), for the bulk actions bar.
  const selectedEventIds = new Set();
  let bulkBusy = false;
  let bulkEls = null;
  let editorState = {
    open: false,
    mode: 'edit',
    order: null,
    sourceEventId: '',
    dirty: false,
    snapshot: '',
    stopsModel: []
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
    loadRidersCache();
    initHeaderToggle();
  }

  function saveToken(token){
    try { sessionStorage.setItem(tokenKey, token); } catch(_) {}
  }

  // Folds the Load/Filter/View controls away (▲ Controls, and New order —
  // see handleNewOrder). Set up by initHeaderToggle.
  let setHeaderCollapsed = function(){};

  function initHeaderToggle(){
    const header = document.querySelector('.dispatcher-header');
    const toggleBtn = document.getElementById('dispatcherToggle');
    const orders = document.getElementById('dispatcherOrders');
    if (!header || !toggleBtn) return;

    const storageKey = 'cwDispatcherHeaderCollapsed';
    let collapsed = false;
    try { collapsed = sessionStorage.getItem(storageKey) === '1'; } catch(_) {}
    if (collapsed) header.classList.add('is-collapsed');

    function updateMargin(){
      if (!orders) return;
      const h = header.getBoundingClientRect().height;
      orders.style.marginTop = (h + 12) + 'px';
    }
    updateMargin();

    const ro = new ResizeObserver(updateMargin);
    ro.observe(header);

    setHeaderCollapsed = function(next){
      header.classList.toggle('is-collapsed', !!next);
      try { sessionStorage.setItem(storageKey, next ? '1' : '0'); } catch(_) {}
      setTimeout(updateMargin, 300); // after the fold animation
    };

    toggleBtn.addEventListener('click', function(){
      setHeaderCollapsed(!header.classList.contains('is-collapsed'));
    });
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

  // YYYY-MM-DD moved by `days` (local calendar days).
  function shiftDateKey(dateKey, days){
    const parts = String(dateKey || '').split('-').map(Number);
    const d = parts.length === 3 && parts[0] ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date();
    d.setDate(d.getDate() + days);
    return formatDateKey(d);
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

  // Orders booked through the public site never write a quote.breakdown
  // object — they store the pricing engine's raw fields instead (pickupCharge,
  // distanceTotal, addressFee, cargoAmount, surchargeAmount, discountAmount,
  // vatAmount; see map.js's distance pricing calc). Only orders already
  // created/edited via this dispatcher have a real breakdown object. Derive
  // one from the raw fields when it's missing so the editor doesn't show all
  // zeros; base+distance+stops+surcharge-discount+adjustment reconstructs
  // quote.total exactly.
  function deriveQuoteBreakdown(quote){
    const src = quote && typeof quote === 'object' ? quote : {};
    const explicit = src.breakdown && typeof src.breakdown === 'object' ? src.breakdown : {};
    const hasExplicit = ['base', 'distance', 'stops', 'surcharge', 'discount', 'adjustment']
      .some(function(key){ return safeNumber(explicit[key], 0) !== 0; });
    if (hasExplicit) return explicit;
    return {
      base: safeNumber(src.pickupCharge, 0),
      distance: safeNumber(src.distanceTotal, 0),
      stops: safeNumber(src.addressFee, 0),
      surcharge: safeNumber(src.cargoAmount, 0) + safeNumber(src.surchargeAmount, 0),
      discount: safeNumber(src.discountAmount, 0),
      adjustment: safeNumber(src.vatAmount, 0)
    };
  }

  function normalizeText(value){
    return String(value || '').trim();
  }

  // ISO instant -> <input type="datetime-local"> value, in the browser's own
  // local timezone (native datetime-local semantics — no zone suffix).
  function isoToDatetimeLocal(iso){
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = function(n){ return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
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
    // Google answers with an HTML error page (not JSON) when a request fails
    // outright, most often because it ran too long.
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (_) {
      throw new Error('The server didn\'t answer properly (the request may have taken too long). Try a shorter date range with From/To.');
    }
    if (!res.ok || (json && json.error)) {
      throw new Error((json && json.error) || 'Request failed');
    }
    return json;
  }

  async function fetchOrders(params){
    const ridersReady = ensureRidersCache(); // in parallel with the orders request
    const payload = Object.assign({ action: 'adminList' }, params || {});
    const json = await postAdmin(payload);
    await ridersReady;
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

  // Keep in sync with adminOrderSearchText() in Code.gs, which applies the same
  // match server-side. The timeline is left out on purpose: its entries name
  // whoever touched the order ("Order edited by X"), so searching a dispatcher
  // or rider name would match nearly every order.
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
    if (Array.isArray(route.stops)) {
      route.stops.forEach(function(stop){
        if (stop && stop.address) bits.push(stop.address);
      });
    }

    return bits.join(' | ').toLowerCase();
  }

  // The non-date filters, sent with range loads so the server only returns
  // matching orders. filterOrders() still applies them locally as well.
  function serverFilterParams(){
    return {
      keyword: normalizeText(keywordInput && keywordInput.value),
      status: normalizeText(filterStatus && filterStatus.value),
      updates: normalizeText(filterUpdates && filterUpdates.value),
      payment: normalizeText(filterPayment && filterPayment.value),
      invoiced: normalizeText(filterInvoiced && filterInvoiced.value)
    };
  }

  function hasServerFilters(params){
    return Object.keys(params).some(function(key){ return !!params[key]; });
  }

  function filterOrders(){
    const keyword = normalizeText(keywordInput && keywordInput.value).toLowerCase();
    const status = normalizeText(filterStatus && filterStatus.value);
    const updates = normalizeText(filterUpdates && filterUpdates.value);
    const payment = normalizeText(filterPayment && filterPayment.value);
    const invoicedFilter = normalizeText(filterInvoiced && filterInvoiced.value);
    const fromDateRaw = normalizeText(filterFromDate && filterFromDate.value);
    const toDateRaw = normalizeText(filterToDate && filterToDate.value);
    const fromDate = normalizeDateKey(fromDateRaw);
    const toDate = normalizeDateKey(toDateRaw);
    const sortMode = normalizeText(sortSelect && sortSelect.value) || 'newest';

    const filtered = allOrders.filter(function(order){
      if (status && normalizeText(order.status) !== status) return false;
      if (updates && normalizeText(order.updatesPreference) !== updates) return false;
      if (payment && normalizeText(order.paymentStatus) !== payment) return false;
      if (invoicedFilter === 'yes' && !normalizeText(order.invoicedAt)) return false;
      if (invoicedFilter === 'no' && normalizeText(order.invoicedAt)) return false;
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

  // Known values are always listed so filters can be set before anything is
  // loaded; any other value found in loaded orders is appended after them.
  function refreshFilterOptions(){
    const loadedStatuses = allOrders.map(function(order){ return normalizeText(order && order.status); }).filter(Boolean).sort();
    const loadedUpdates = allOrders.map(function(order){ return normalizeText(order && order.updatesPreference); }).filter(Boolean).sort();
    const statuses = Array.from(new Set(ORDER_STATUS_VALUES.concat(loadedStatuses)));
    const updates = Array.from(new Set(UPDATES_PREFERENCE_VALUES.concat(loadedUpdates)));
    setSelectOptions(filterStatus, statuses, 'Any status');
    setSelectOptions(filterUpdates, updates, 'Any updates');
    rememberAccounts(allOrders);
  }

  // Business accounts seen in any loaded orders are remembered in this
  // browser, so the "Account orders" box can suggest them next time.
  function loadKnownAccounts(){
    try {
      const list = JSON.parse(localStorage.getItem(knownAccountsKey) || '[]');
      return Array.isArray(list) ? list : [];
    } catch(_) { return []; }
  }

  function renderAccountOptions(list){
    if (!accountList) return;
    accountList.innerHTML = '';
    list.slice().sort(function(a, b){ return compareByString(a.token, b.token); }).forEach(function(acct){
      const opt = document.createElement('option');
      opt.value = acct.token;
      if (acct.name) opt.label = acct.name;
      accountList.appendChild(opt);
    });
  }

  function rememberAccounts(orders){
    const known = loadKnownAccounts();
    let changed = false;
    (orders || []).forEach(function(order){
      const token = normalizeText(order && order.accountToken).toUpperCase();
      if (!token) return;
      const name = normalizeText(order.accountName);
      const existing = known.find(function(a){ return a.token === token; });
      if (!existing) {
        known.push({ token: token, name: name });
        changed = true;
      } else if (name && existing.name !== name) {
        existing.name = name;
        changed = true;
      }
    });
    if (changed) {
      try { localStorage.setItem(knownAccountsKey, JSON.stringify(known)); } catch(_) {}
    }
    renderAccountOptions(known);
  }

  function statusChip(text, className){
    const chip = document.createElement('span');
    chip.className = 'dispatcher-chip' + (className ? (' ' + className) : '');
    chip.textContent = text;
    return chip;
  }

  // Timeline timestamps are stored as UTC ISO strings; show them in Barcelona time.
  const timelineTsFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  });
  function formatTimelineTs(iso){
    const d = new Date(normalizeText(iso));
    return Number.isNaN(d.getTime()) ? normalizeText(iso) : timelineTsFormat.format(d).replace(',', '');
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

    // Repeated taps in the rider app used to log the same update several
    // times seconds apart; skip an exact repeat within 5 min of the previous.
    const lastSeen = {};
    sorted.forEach(function(item){
      const status = normalizeText(item && item.status);
      const msg = normalizeText(item && item.message);
      const stamp = Date.parse(String(item && item.ts || ''));
      const prev = lastSeen[msg];
      lastSeen[msg] = stamp;
      if (stamp - prev < 5 * 60000) return;
      const li = document.createElement('li');
      const ts = formatTimelineTs(item && item.ts);
      li.textContent = (ts ? (ts + ' - ') : '') + (status ? (status + ': ') : '') + msg;
      ul.appendChild(li);
    });
    return ul;
  }

  // Load type ↔ the booking page's cargo choice (quote.cargoKey). Older
  // orders only have free text, so guess from its words.
  function cargoKeyFromQuote(quote){
    const key = normalizeText(quote && quote.cargoKey).toLowerCase();
    if (key === 'small' || key === 'regular' || key === 'large') return key;
    const t = (normalizeText(quote && quote.loadType) + ' ' + normalizeText(quote && quote.cargoType)).toLowerCase();
    if (/small|shoebox|peque/.test(t)) return 'small';
    if (/large|heavy|bulky|big|grande|pesad/.test(t)) return 'large';
    return 'regular';
  }

  function promoCodesFromInput(){
    return normalizeText(editPromoCode && editPromoCode.value).split(/[\s,;]+/).map(function(c){ return c.trim().toUpperCase(); }).filter(Boolean);
  }

  // The complete system price breakdown (CargoworksPricing.pricingDetail) as
  // rows: { label, value, kind: ''|'sub'|'sum'|'note'|'neg' }.
  function pricingDetailRows(d){
    const rows = [];
    rows.push({ label: 'Pickup fee (zone ' + (d.pickupZone || '-') + ')', value: d.pickupCharge });
    const floorKm = safeNumber(d.distanceBasisKm, 0) > safeNumber(d.totalKm, 0) + 0.004;
    rows.push({ label: 'Distance · ' + safeNumber(d.distanceBasisKm, 0).toFixed(2) + ' km × ' + money(d.perKm) + '/km', value: d.distanceTotal });
    (Array.isArray(d.legs) ? d.legs : []).forEach(function(leg){
      rows.push({ label: leg.from + ' → ' + leg.to + ' · ' + safeNumber(leg.km, 0).toFixed(2) + ' km', value: leg.price, kind: 'sub' });
    });
    if (floorKm) rows.push({ label: 'Charged as ' + safeNumber(d.distanceBasisKm, 0).toFixed(2) + ' km: the drop-off is that far from the centre (route is ' + safeNumber(d.totalKm, 0).toFixed(2) + ' km)', kind: 'note' });
    if (safeNumber(d.minimumTopUp, 0) > 0) rows.push({ label: 'Minimum fare top-up', value: d.minimumTopUp });
    if (safeNumber(d.addressFee, 0) > 0) rows.push({ label: 'Delivery fees · ' + d.addressFeeCount + ' drops × ' + money(d.addressFeePer), value: d.addressFee });
    if (safeNumber(d.cargoAmount, 0) !== 0) rows.push({ label: 'Load: ' + (d.cargoLabel || d.cargoKey), value: d.cargoAmount });
    if (safeNumber(d.weekendSurchargeAmount, 0) > 0) rows.push({ label: 'Weekend/holiday surcharge', value: d.weekendSurchargeAmount });
    if (safeNumber(d.afterHoursSurchargeAmount, 0) > 0) rows.push({ label: 'After-hours surcharge', value: d.afterHoursSurchargeAmount });
    if (safeNumber(d.discountAmount, 0) > 0) rows.push({ label: 'Promo' + ((d.discountCodes && d.discountCodes.length) ? (' ' + d.discountCodes.join(', ')) : ''), value: -safeNumber(d.discountAmount, 0), kind: 'neg' });
    rows.push({ label: 'Subtotal (before IVA)', value: d.preVatTotal, kind: 'sum' });
    rows.push({ label: 'IVA ' + Math.round(safeNumber(d.vatRate, 0.21) * 100) + '%', value: d.vatAmount });
    rows.push({ label: 'Total', value: d.total, kind: 'sum' });
    return rows;
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

    const perStop = quote.billingMode === 'per_stop';
    const detail = quote.pricingDetail;
    const detailOk = !perStop && !quote.priceOverride && detail && typeof detail === 'object' &&
      Math.abs(safeNumber(detail.total, -1) - total) < 0.005;
    if (detailOk) {
      // The full system price: each leg, fees, surcharges, subtotal, IVA.
      pricingDetailRows(detail).forEach(function(r){
        if (r.kind === 'note') {
          const n = document.createElement('div');
          n.className = 'dispatcher-pricing-note';
          n.style.cssText = 'grid-column:1/-1;font-size:0.68rem;color:var(--dispatch-muted);';
          n.textContent = r.label;
          grid.appendChild(n);
          return;
        }
        row((r.kind === 'sub' ? '· ' : '') + r.label, r.value);
        if (r.kind === 'sum') grid.lastChild.style.fontWeight = '700';
      });
    } else if (!perStop && quote.priceOverride) {
      // Price set by hand: just the VAT split of the total.
      const split = vatSplit(total);
      row('Subtotal (ex. VAT)', split.subtotal);
      row('VAT 21%', split.vat);
      row('Final total', split.total);
    } else {
      row('Base', base);
      row('Distance', distance);
      row(perStop ? (safeNumber(quote.stopCount, 0) + ' stops × ' + money(quote.stopRate)) : 'Stops', stops);
      row('Surcharge', surcharge);
      row('Discount', -discount);
      if (!perStop) row('Subtotal (ex. VAT)', total - adjustment);
      row(perStop ? 'Adjustment' : 'VAT / adjustment', adjustment);
      row(perStop ? 'Final total (+ IVA)' : 'Final total', total);
    }

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

  function applyFilters(){
    const visible = filterOrders();
    renderOrders(visible);

    const scope = loadMode === 'day'
      ? ('for ' + loadLabel)
      : (loadMode === 'all'
        ? 'from all loaded orders'
        : (loadMode === 'reference' || loadMode === 'reference-fallback'
          ? ('for reference ' + (loadLabel || 'search'))
          : (loadMode === 'account' ? ('for account ' + loadLabel) : '')));

    let summary = 'Showing ' + visible.length + ' of ' + allOrders.length + ' order(s)' + (scope ? (' ' + scope) : '') + '.';
    if (loadMode === 'account') {
      // Same rule as the client's account panel: everything not marked Paid is still due.
      const unpaid = visible.filter(function(order){ return normalizeText(order.paymentStatus) !== 'Paid'; });
      const due = unpaid.reduce(function(sum, order){ return sum + safeNumber(order.quote && order.quote.total, 0); }, 0);
      const notInvoiced = visible.filter(function(order){ return !normalizeText(order.invoicedAt); }).length;
      summary += ' Unpaid: ' + unpaid.length + ' order(s), EUR ' + money(due) + ' + IVA. Not invoiced: ' + notInvoiced + '.';
    }
    setSummary(summary);
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
      await loadAll(true, { defaultRange: lastAllUsedDefaultRange });
      return;
    }
    if (loadMode === 'reference' || loadMode === 'reference-fallback') {
      if (lastReference) {
        await loadByReference(lastReference, true);
      }
      return;
    }
    if (loadMode === 'account' && lastAccount) {
      await loadAccount(lastAccount, true);
    }
  }

  async function loadDay(dateKey, quiet){
    const normalizedDate = plausibleDateKey(dateKey);
    if (!normalizedDate) {
      setStatus('Choose a valid date.', true);
      return;
    }

    const seq = ++loadSeq;
    try {
      if (!quiet) setStatus('Loading ' + formatDateForUi(normalizedDate) + '...');
      const orders = await fetchOrders({ date: normalizedDate });
      if (seq !== loadSeq) return;
      allOrders = orders;
      loadMode = 'day';
      loadedDayKey = normalizedDate;
      loadLabel = formatDateForUi(normalizedDate);
      if (dateInput) dateInput.value = normalizedDate;
      refreshFilterOptions();
      applyFilters();
      if (!quiet) setStatus('Loaded ' + orders.length + ' order(s) for ' + formatDateForUi(normalizedDate) + '.');
    } catch (err) {
      if (seq !== loadSeq) return;
      allOrders = [];
      renderOrders([]);
      setSummary('No data yet.');
      setStatus(err && err.message ? err.message : 'Could not load orders.', true);
    }
  }

  // Scanning every order since 2020 can run past Apps Script's time limit, so
  // searches with no From/To cover this window instead (same as the client's
  // account panel); set From/To to search other dates.
  const DEFAULT_SEARCH_DAYS_BACK = 180;
  const DEFAULT_SEARCH_DAYS_AHEAD = 60;
  let lastAllUsedDefaultRange = false;

  // From/To as entered, or the default window when both are empty and
  // `useDefault` is set. Returns null (after reporting) for invalid dates.
  function searchRange(useDefault){
    const fromRaw = normalizeText(filterFromDate && filterFromDate.value);
    const toRaw = normalizeText(filterToDate && filterToDate.value);
    const from = plausibleDateKey(fromRaw);
    const to = plausibleDateKey(toRaw);
    if ((fromRaw && !from) || (toRaw && !to)) {
      setStatus('Choose valid From/To dates.', true);
      return null;
    }
    if (!from && !to && useDefault) {
      const today = formatDateKey(new Date());
      return { from: shiftDateKey(today, -DEFAULT_SEARCH_DAYS_BACK), to: shiftDateKey(today, DEFAULT_SEARCH_DAYS_AHEAD), isDefault: true };
    }
    return { from: from, to: to, isDefault: false };
  }

  function defaultRangeNote(range){
    return range.isDefault
      ? (' (' + formatDateForUi(range.from) + ' – ' + formatDateForUi(range.to) + '; set From/To to search other dates)')
      : '';
  }

  async function loadAll(quiet, options){
    const range = searchRange(!!(options && options.defaultRange));
    if (!range) return;
    const from = range.from;
    const to = range.to;
    lastAllUsedDefaultRange = range.isDefault;

    const filters = serverFilterParams();
    const filtered = hasServerFilters(filters);
    const seq = ++loadSeq;
    try {
      if (!quiet) setStatus(filtered ? 'Loading matching orders...' : 'Loading all orders...');
      const orders = await fetchOrders(Object.assign({ scope: 'all', from: from, to: to }, filters));
      if (seq !== loadSeq) return;
      allOrders = orders;
      loadMode = 'all';
      loadLabel = from || to
        ? ((from ? formatDateForUi(from) : '') + ' .. ' + (to ? formatDateForUi(to) : ''))
        : 'all';
      refreshFilterOptions();
      applyFilters();
      if (!quiet) setStatus((filtered ? ('Found ' + filterOrders().length + ' matching order(s)') : ('Loaded ' + orders.length + ' total order(s)')) + defaultRangeNote(range) + '.');
    } catch (err) {
      allOrders = [];
      if (seq !== loadSeq) return;
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
    const seq = ++loadSeq;
    try {
      if (!quiet) setStatus('Searching...');
      let orders = [];
      if (dateKey) {
        orders = await fetchOrders({ date: dateKey, ref: cleanRef });
        if (seq !== loadSeq) return;
      }
      if (!orders.length) {
        // Not on the reference's own date (it encodes the booking date, the
        // delivery can be later): search around it rather than all of time,
        // which can run past the server's time limit.
        const base = dateKey || formatDateKey(new Date());
        orders = await fetchOrders({ scope: 'all', ref: cleanRef, from: shiftDateKey(base, -30), to: shiftDateKey(base, 180) });
        if (seq !== loadSeq) return;
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
      if (seq !== loadSeq) return;
      allOrders = [];
      renderOrders([]);
      setSummary('No data yet.');
      setStatus(err && err.message ? err.message : 'Search failed.', true);
    }
  }

  // Loads the orders placed on one business account within From/To (or the
  // default search window when both are empty), so they can all be managed
  // on one screen.
  async function loadAccount(token, quiet){
    const cleanToken = normalizeText(token).toUpperCase();
    if (!cleanToken) {
      setStatus('Enter an account token (e.g. BIZ-NAME).', true);
      return;
    }
    const range = searchRange(true);
    if (!range) return;

    const seq = ++loadSeq;
    try {
      if (!quiet) setStatus('Loading account orders...');
      const orders = await fetchOrders(Object.assign({ scope: 'all', from: range.from, to: range.to, account: cleanToken }, serverFilterParams()));
      if (seq !== loadSeq) return;
      rememberAccounts(orders);
      allOrders = orders.filter(function(order){
        return normalizeText(order && order.accountToken).toUpperCase() === cleanToken;
      });
      loadMode = 'account';
      lastAccount = cleanToken;
      const named = allOrders.find(function(order){ return normalizeText(order.accountName); });
      loadLabel = named ? (normalizeText(named.accountName) + ' (' + cleanToken + ')') : cleanToken;
      if (accountInput) accountInput.value = cleanToken;
      refreshFilterOptions();
      applyFilters();
      if (!quiet) setStatus((allOrders.length ? ('Loaded ' + allOrders.length + ' order(s) for ' + cleanToken) : ('No orders found for ' + cleanToken)) + defaultRangeNote(range) + '.');
    } catch (err) {
      if (seq !== loadSeq) return;
      allOrders = [];
      renderOrders([]);
      setSummary('No data yet.');
      setStatus(err && err.message ? err.message : 'Could not load account orders.', true);
    }
  }

  // Marks every ticked order as paid (kind 'paid') or invoiced (kind 'invoiced').
  // One request per order, sent one after another to stay within Apps Script
  // limits. Orders that fail stay ticked so the action can simply be retried.
  async function updateSelectedOrders(kind){
    const isPaid = kind === 'paid';
    const verb = isPaid ? 'paid' : 'invoiced';
    const selected = allOrders.filter(function(order){ return selectedEventIds.has(order.eventId); });
    if (!selected.length) {
      setStatus('Tick at least one order first.', true);
      return;
    }
    const targets = selected.filter(function(order){
      return isPaid ? normalizeText(order.paymentStatus) !== 'Paid' : !normalizeText(order.invoicedAt);
    });
    if (!targets.length) {
      setStatus('The selected orders are already ' + verb + '.');
      return;
    }
    const skipped = selected.length - targets.length;
    if (!window.confirm('Mark ' + targets.length + ' order(s) as ' + verb + '?' + (skipped ? (' ' + skipped + ' already ' + verb + ' will be skipped.') : ''))) return;

    bulkBusy = true;
    updateBulkBar();
    let done = 0;
    let failed = 0;
    for (const order of targets) {
      setStatus('Marking as ' + verb + ' ' + (done + failed + 1) + '/' + targets.length + '...');
      const changes = isPaid ? { paymentStatus: 'Paid' } : { invoiced: true };
      try {
        await postAdmin(Object.assign({ action: 'adminUpdate', eventId: order.eventId, operator: currentOperator() }, changes));
        selectedEventIds.delete(order.eventId);
        done++;
      } catch (_) {
        failed++;
      }
    }
    // Already-done orders that were skipped don't need to stay ticked either.
    selected.forEach(function(order){ if (targets.indexOf(order) < 0) selectedEventIds.delete(order.eventId); });
    bulkBusy = false;
    await refreshCurrentLoad();
    updateBulkBar();
    setStatus(failed
      ? ('Marked ' + done + ' as ' + verb + ', ' + failed + ' failed (still ticked, try again).')
      : ('Marked ' + done + ' order(s) as ' + verb + '.'), failed > 0);
  }

  function updateBulkBar(){
    if (!bulkEls) return;
    const count = selectedEventIds.size;
    bulkEls.count.textContent = count + ' selected';
    bulkEls.allBox.checked = count > 0 && count === bulkEls.total;
    bulkEls.allBox.indeterminate = count > 0 && count < bulkEls.total;
    bulkEls.paidBtn.disabled = bulkBusy || !count;
    bulkEls.invoicedBtn.disabled = bulkBusy || !count;
  }

  // Sticky bar under the order list: select all + the bulk actions.
  function buildBulkBar(orders){
    const bar = document.createElement('div');
    bar.className = 'dispatcher-bulk-bar';

    const selectable = orders.filter(function(order){ return order.eventId; });
    const allLabel = document.createElement('label');
    const allBox = document.createElement('input');
    allBox.type = 'checkbox';
    allBox.className = 'dispatcher-select';
    allBox.addEventListener('change', function(){
      selectable.forEach(function(order){
        if (allBox.checked) selectedEventIds.add(order.eventId);
        else selectedEventIds.delete(order.eventId);
      });
      ordersWrap.querySelectorAll('.dispatcher-card .dispatcher-select').forEach(function(box){
        box.checked = allBox.checked;
        box.closest('.dispatcher-card').classList.toggle('is-selected', allBox.checked);
      });
      updateBulkBar();
    });
    allLabel.appendChild(allBox);
    allLabel.appendChild(document.createTextNode('Select all shown (' + selectable.length + ')'));

    const count = document.createElement('span');
    count.className = 'dispatcher-bulk-count';

    const paidBtn = document.createElement('button');
    paidBtn.type = 'button';
    paidBtn.className = 'btn';
    paidBtn.textContent = 'Mark selected as paid';
    paidBtn.addEventListener('click', function(){ updateSelectedOrders('paid'); });

    const invoicedBtn = document.createElement('button');
    invoicedBtn.type = 'button';
    invoicedBtn.className = 'btn btn--ghost';
    invoicedBtn.textContent = 'Mark selected as invoiced';
    invoicedBtn.addEventListener('click', function(){ updateSelectedOrders('invoiced'); });

    bar.appendChild(allLabel);
    bar.appendChild(count);
    bar.appendChild(invoicedBtn);
    bar.appendChild(paidBtn);
    bulkEls = { allBox: allBox, count: count, paidBtn: paidBtn, invoicedBtn: invoicedBtn, total: selectable.length };
    updateBulkBar();
    return bar;
  }

  // ISO timestamp -> DDMMYYYY in local time.
  function formatIsoForUi(iso){
    const d = new Date(normalizeText(iso));
    return Number.isNaN(d.getTime()) ? '' : formatDateForUi(formatDateKey(d));
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
    if (filterInvoiced) filterInvoiced.value = '';
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
      accountToken: normalizeText(editAccountToken && editAccountToken.value),
      accountStaffName: normalizeText(editAccountStaffName && editAccountStaffName.value),
      accountPickupTime: normalizeText(editAccountPickupTime && editAccountPickupTime.value),
      accountDropoffTime: normalizeText(editAccountDropoffTime && editAccountDropoffTime.value),
      accountAttName: normalizeText(editAccountAttName && editAccountAttName.value),
      accountAttContact: normalizeText(editAccountAttContact && editAccountAttContact.value),
      stops: JSON.stringify(editorState.stopsModel.map(function(s){
        return [s.id, s.address, s.tier, s.notes, s.customerNote || '', s.recipientName || '', s.recipientPhone || '', s.recipientEmail || '', s.addressDetails || ''];
      })),
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
      priceOverride: !!(editPriceOverride && editPriceOverride.checked),
      promoCode: normalizeText(editPromoCode && editPromoCode.value),
      billingMode: normalizeText(editBillingMode && editBillingMode.value),
      hourlyRate: normalizeText(editHourlyRate && editHourlyRate.value),
      routeStartedAt: normalizeText(editRouteStartedAt && editRouteStartedAt.value),
      routeCompletedAt: normalizeText(editRouteCompletedAt && editRouteCompletedAt.value),
      elapsedMinutes: normalizeText(editElapsedMinutes && editElapsedMinutes.value),
      stopCount: normalizeText(editStopCount && editStopCount.value),
      stopRate: normalizeText(editStopRate && editStopRate.value),
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
    refreshChangedHighlights();
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
    if (editPriceOverride && editPriceOverride.checked) return; // manual override — don't clobber
    if (editBillingMode && editBillingMode.value === 'elapsed') {
      const rate = safeNumber(editHourlyRate && editHourlyRate.value, 0);
      const mins = safeNumber(editElapsedMinutes && editElapsedMinutes.value, 0);
      const total = Math.round(rate * (mins / 60) * 100) / 100;
      if (editPriceTotal) editPriceTotal.value = total.toFixed(2);
      togglePriceNotice(true, 'Elapsed billing: ' + mins + ' min @ ' + rate.toFixed(2) + '/h = ' + total.toFixed(2) + '.');
      return;
    }
    if (editBillingMode && editBillingMode.value === 'per_stop') {
      const count = Math.max(0, Math.round(safeNumber(editStopCount && editStopCount.value, 0)));
      const rate = safeNumber(editStopRate && editStopRate.value, 0);
      const total = Math.round(count * rate * 100) / 100;
      if (editPriceTotal) editPriceTotal.value = total.toFixed(2);
      togglePriceNotice(true, 'Per-stop billing: ' + count + ' stops × EUR ' + rate.toFixed(2) + ' = EUR ' + total.toFixed(2) + ' + IVA.');
      return;
    }
    const base = safeNumber(editPriceBase && editPriceBase.value, 0);
    const distance = safeNumber(editPriceDistance && editPriceDistance.value, 0);
    const stops = safeNumber(editPriceStops && editPriceStops.value, 0);
    const surcharge = safeNumber(editPriceSurcharge && editPriceSurcharge.value, 0);
    const discount = safeNumber(editPriceDiscount && editPriceDiscount.value, 0);
    const adjustment = safeNumber(editPriceAdjustment && editPriceAdjustment.value, 0);
    const total = base + distance + stops + surcharge - discount + adjustment;
    if (editPriceTotal) editPriceTotal.value = total.toFixed(2);
    renderEditorSubtotal();
    togglePriceNotice(true, 'Pricing breakdown changed. Final total recalculated to ' + total.toFixed(2) + '.');
  }

  // "Subtotal (ex. VAT)" under the breakdown fields: everything before the
  // VAT line.
  function renderEditorSubtotal(){
    if (!editPriceSubtotal) return;
    const sub = safeNumber(editPriceBase && editPriceBase.value, 0) + safeNumber(editPriceDistance && editPriceDistance.value, 0) +
      safeNumber(editPriceStops && editPriceStops.value, 0) + safeNumber(editPriceSurcharge && editPriceSurcharge.value, 0) -
      safeNumber(editPriceDiscount && editPriceDiscount.value, 0);
    editPriceSubtotal.textContent = 'Subtotal (ex. VAT): EUR ' + sub.toFixed(2);
  }

  function recalculateElapsedMinutes(){
    if (editElapsedOverride && editElapsedOverride.checked) return; // manual override — don't clobber
    if (!editRouteStartedAt || !editRouteCompletedAt || !editElapsedMinutes) return;
    const startMs = editRouteStartedAt.value ? Date.parse(editRouteStartedAt.value) : NaN;
    const endMs = editRouteCompletedAt.value ? Date.parse(editRouteCompletedAt.value) : NaN;
    if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return; // leave field as-is
    editElapsedMinutes.value = String(Math.round((endMs - startMs) / 60000));
  }

  function applyBillingModeVisibility(){
    if (!editBillingMode) return;
    const elapsed = editBillingMode.value === 'elapsed';
    if (editElapsedFields) editElapsedFields.style.display = elapsed ? '' : 'none';
    if (editPerStopFields) editPerStopFields.style.display = editBillingMode.value === 'per_stop' ? '' : 'none';
    applyPriceOverride(); // re-derive breakdown-fields/get-system-pricing visibility for the new mode
  }

  function applyElapsedOverride(){
    if (!editElapsedOverride) return;
    if (editElapsedManualHint) editElapsedManualHint.style.display = editElapsedOverride.checked ? 'inline' : 'none';
  }

  // ── Inline editor ──────────────────────────────────────────────────────────
  // The editor (form + actions) opens inside the order's own card instead of a
  // pop-up; new orders and duplicates get a temporary card at the top of the
  // list. The same editor element is moved between cards, so re-rendering the
  // list parks it first and mounts it again afterwards.
  const editorCard = editorModal ? editorModal.querySelector('.dispatcher-modal-card') : null;
  let editorNewCardEl = null;

  function parkEditor(){
    if (!editorCard || !editorModal) return;
    if (editorCard.parentNode !== editorModal) editorModal.appendChild(editorCard);
    editorCard.classList.remove('is-inline');
    if (ordersWrap) {
      Array.prototype.forEach.call(ordersWrap.querySelectorAll('.dispatcher-card.is-editing'), function(c){ c.classList.remove('is-editing'); });
    }
    if (editorNewCardEl && editorNewCardEl.parentNode) editorNewCardEl.parentNode.removeChild(editorNewCardEl);
  }

  function mountEditorInline(scroll){
    if (!editorCard || !ordersWrap || !editorState.open) return;
    let host = null;
    if (editorState.mode === 'edit' && editorState.sourceEventId) {
      host = Array.prototype.find.call(ordersWrap.querySelectorAll('.dispatcher-card'), function(c){
        return c.dataset && c.dataset.eventId === editorState.sourceEventId;
      }) || null;
    }
    if (!host) {
      if (!editorNewCardEl) {
        editorNewCardEl = document.createElement('article');
        editorNewCardEl.className = 'dispatcher-card dispatcher-card--new';
      }
      ordersWrap.insertBefore(editorNewCardEl, ordersWrap.firstChild);
      host = editorNewCardEl;
    }
    host.classList.add('is-editing');
    host.appendChild(editorCard);
    editorCard.classList.add('is-inline');
    if (scroll && typeof window.scrollTo === 'function' && host.getBoundingClientRect) {
      const header = document.querySelector('.dispatcher-header');
      const offset = (header ? header.getBoundingClientRect().height : 0) + 16;
      window.scrollTo({ top: Math.max(0, host.getBoundingClientRect().top + (window.scrollY || 0) - offset), behavior: 'smooth' });
    }
  }

  // ── Changed-field highlighting ─────────────────────────────────────────────
  // Every field that differs from how the editor opened is highlighted (and
  // counted next to Save) so edits can be double-checked before saving. Stops
  // compare against the stop as loaded (_orig/_origIndex, set in openEditor).
  const editorFormEl = document.getElementById('dispatcherEditorForm');
  const STOP_TRACKED_FIELDS = ['address', 'tier', 'notes', 'customerNote', 'recipientName', 'recipientPhone', 'recipientEmail', 'addressDetails'];
  let editorChangeCountEl = null;

  function editorBaselineControls(){
    if (!editorFormEl) return [];
    return Array.prototype.filter.call(editorFormEl.querySelectorAll('input, select, textarea'), function(el){
      if (el.type === 'file' || el.type === 'button') return false;
      return !(el.closest && el.closest('#editStopsList, #importPanel, #stopsQuickPanel, .stop-split-bar'));
    });
  }

  function controlValue(el){
    return (el.type === 'checkbox' || el.type === 'radio') ? (el.checked ? '1' : '0') : String(el.value || '');
  }

  function markEditorBaseline(){
    editorBaselineControls().forEach(function(el){
      el.dataset.initial = controlValue(el);
      el.classList.remove('is-changed');
    });
  }

  function stopFieldIsChanged(stop, field){
    return editorState.mode !== 'create' && !!stop._orig && normalizeText(stop[field]) !== normalizeText(stop._orig[field]);
  }

  // Original stops whose order relative to each other changed (new stops
  // inserted in between don't count as moving the others).
  function movedStops(){
    const present = (editorState.stopsModel || []).filter(function(s){ return s._orig; });
    const sorted = present.slice().sort(function(a, b){ return a._origIndex - b._origIndex; });
    return present.filter(function(s, i){ return sorted[i] !== s; });
  }

  function stopChangeCount(){
    if (editorState.mode === 'create') return 0;
    const model = editorState.stopsModel || [];
    let n = movedStops().length;
    model.forEach(function(stop){
      if (!stop._orig) { n++; return; }
      STOP_TRACKED_FIELDS.forEach(function(f){ if (stopFieldIsChanged(stop, f)) n++; });
    });
    const ids = model.map(function(s){ return s.id; }).filter(Boolean);
    n += (editorState.origStopIds || []).filter(function(id){ return ids.indexOf(id) < 0; }).length;
    return n;
  }

  function refreshChangedHighlights(){
    if (!editorState.open) return;
    let count = 0;
    editorBaselineControls().forEach(function(el){
      const changed = el.dataset.initial !== undefined && controlValue(el) !== el.dataset.initial;
      el.classList.toggle('is-changed', changed);
      if (changed) count++;
    });
    count += stopChangeCount();
    if (!editorChangeCountEl && editorCard) {
      editorChangeCountEl = document.createElement('span');
      editorChangeCountEl.className = 'editor-change-count';
      const actions = editorCard.querySelector('.dispatcher-modal-actions');
      if (actions) actions.insertBefore(editorChangeCountEl, actions.querySelector('.dispatcher-action-group'));
    }
    if (editorChangeCountEl) {
      editorChangeCountEl.textContent = count ? ('✎ ' + count + ' change' + (count === 1 ? '' : 's') + ' highlighted — check before saving') : '';
    }
  }

  // ── Split into routes ──────────────────────────────────────────────────────
  // An order can become several orders, one per rider/time window. The editor
  // holds the current one; the others wait in pendingRoutes and, after a
  // save, the next opens pre-filled as a new order to check and save. Filled
  // by the extraction box ("routes") or the "Split selected stops" bar.
  let pendingRoutes = [];
  let routesBannerEl = null;
  const splitSelection = new Set();

  // Order-level fields every route of a split shares.
  function sharedRouteFields(){
    return [editCustomerName, editCustomerEmail, editCustomerPhone, editUpdatesPreference,
      editAccountToken, editAccountStaffName, editAccountPickupTime, editAccountDropoffTime,
      editAccountAttName, editAccountAttContact, editCargoType, editLoadType, editVehicleType,
      editPackageCount, editWeightKg, editVolumeM3, editBillingMode, editHourlyRate, editScheduleDate]
      .filter(Boolean).map(function(el){ return [el, el.value]; });
  }

  // A pending stop copied into another order: same address, notes and contact,
  // but no id/token/status, so it's a fresh stop there.
  function stopForNewRoute(s){
    return Object.assign(blankStopEntry(), {
      address: s.address || '', tier: s.tier || '', notes: s.notes || '', customerNote: s.customerNote || '',
      recipientName: s.recipientName || '', recipientPhone: s.recipientPhone || '',
      recipientEmail: s.recipientEmail || '', addressDetails: s.addressDetails || '',
      lat: hasExactLocation(s) ? s.lat : null, lng: hasExactLocation(s) ? s.lng : null
    });
  }

  function minutesBetween(start, end){
    const a = /^(\d{1,2}):(\d{2})/.exec(String(start || ''));
    const b = /^(\d{1,2}):(\d{2})/.exec(String(end || ''));
    if (!a || !b) return 0;
    const mins = (Number(b[1]) * 60 + Number(b[2])) - (Number(a[1]) * 60 + Number(a[2]));
    return mins > 0 ? Math.max(15, mins) : 0;
  }

  // Matches a name (as typed or as the AI read it) to a registered rider, since
  // the rider app only shows an order to the rider whose name matches exactly.
  // "me"/"yo" means whoever is operating, if they're also a rider.
  function resolveRiderName(raw){
    const name = normalizeText(raw);
    if (!name) return { name: '' };
    const isSelf = /^(me|myself|yo|mi|mí|jo)$/i.test(name);
    const wanted = (isSelf ? normalizeText(currentOperator()) : name).toLowerCase();
    const riders = _ridersCache || [];
    const match = riders.find(function(r){ return normalizeText(r.name).toLowerCase() === wanted; })
      || riders.find(function(r){ return normalizeText(r.name).toLowerCase().indexOf(wanted) === 0; });
    if (match) return { name: match.name };
    return {
      name: isSelf ? '' : name,
      warning: isSelf
        ? 'Couldn\'t tell which rider "' + name + '" is — set your name in Operator or pick a rider.'
        : 'Rider "' + name + '" isn\'t a registered rider — pick one from the list.'
    };
  }

  function renderRoutesBanner(){
    if (!editorCard) return;
    if (!routesBannerEl) {
      routesBannerEl = document.createElement('div');
      routesBannerEl.className = 'dispatcher-notice editor-routes-banner';
      editorCard.insertBefore(routesBannerEl, editorFormEl || null);
    }
    routesBannerEl.innerHTML = '';
    const warning = editorState.routeWarning;
    routesBannerEl.classList.toggle('is-visible', !!(pendingRoutes.length || warning));
    if (warning) {
      const w = document.createElement('div');
      w.textContent = '⚠️ ' + warning;
      routesBannerEl.appendChild(w);
    }
    if (!pendingRoutes.length) return;
    const head = document.createElement('div');
    head.style.fontWeight = '700';
    head.textContent = 'Split order — after you save this one, ' + (pendingRoutes.length === 1 ? 'this route opens' : 'these routes open one by one') + ' for you to check and save:';
    routesBannerEl.appendChild(head);
    const list = document.createElement('ul');
    list.style.cssText = 'margin:0.2rem 0 0;padding-left:1.1rem;';
    pendingRoutes.forEach(function(r){
      const li = document.createElement('li');
      li.textContent = r.label + ' — ' + (r.riderName || 'no rider yet') + ', ' +
        (r.startTime || 'same time') + (r.endTime ? ('–' + r.endTime) : '') + ', ' +
        r.stops.length + ' stop' + (r.stops.length === 1 ? '' : 's') + (r.warning ? (' ⚠️ ' + r.warning) : '');
      list.appendChild(li);
    });
    routesBannerEl.appendChild(list);
  }

  function updateSaveLabel(){
    if (editorSave) editorSave.textContent = pendingRoutes.length ? 'Save & open next route' : 'Save order';
  }

  function queueRoute(route){
    pendingRoutes.push(route);
    renderRoutesBanner();
    updateSaveLabel();
  }

  // Opens a queued route as a new order, pre-filled. Fields start from a blank
  // new order, so everything filled in here shows as highlighted to check.
  function openRouteDraft(route){
    openEditor('create', null);
    if (importPanel) importPanel.style.display = 'none';
    route.shared.forEach(function(pair){ pair[0].value = pair[1]; });
    if (editScheduleDate && route.date) editScheduleDate.value = route.date;
    if (editScheduleTime && route.startTime) editScheduleTime.value = route.startTime;
    if (editEtaMins && route.etaMins) editEtaMins.value = String(route.etaMins);
    if (editRiderName) editRiderName.value = route.riderName || '';
    if (editNotes) editNotes.value = route.notes || '';
    if (editInternalNotes) editInternalNotes.value = route.internalNote || '';
    if (editSaveNote) editSaveNote.value = 'Created as ' + route.label;
    editorState.stopsModel = [blankStopEntry(route.pickup || '')].concat(route.stops.map(stopForNewRoute));
    editorState.routeWarning = route.warning || '';
    applyBillingModeVisibility();
    resetAccountStatus();
    if (editAccountToken && editAccountToken.value) verifyAccountToken(true);
    renderStopsList();
    updateMapsRouteLink();
    autoCalcStopsFee();
    if (editorTitle) editorTitle.textContent = 'New order — ' + route.label;
    updateEditorDirtyFromForm();
    renderRoutesBanner();
    updateSaveLabel();
  }

  // Extraction replies with `routes` when the pasted text asks to split the
  // order (e.g. "the 18:00–19:00 deliveries go to Alex as a second route").
  // Route 1 stays in this editor; the others are queued.
  function applyImportedRoutes(d){
    const routes = Array.isArray(d && d.routes)
      ? d.routes.filter(function(r){ return r && Array.isArray(r.deliveries) && r.deliveries.length; })
      : [];
    if (routes.length < 2) return;
    const model = editorState.stopsModel;
    const deliveryEntries = model.slice(1);
    const owner = {};
    routes.forEach(function(r, ri){
      r.deliveries.map(Number).forEach(function(k){
        if (k >= 1 && k <= deliveryEntries.length && owner[k] === undefined) owner[k] = ri;
      });
    });
    // Anything the reply left out stays on route 1.
    const perRoute = routes.map(function(){ return []; });
    deliveryEntries.forEach(function(entry, i){ perRoute[owner[i + 1] === undefined ? 0 : owner[i + 1]].push(entry); });
    if (!perRoute[0].length) return;

    const count = routes.length;
    const first = routes[0];
    const firstRider = resolveRiderName(first.riderName);
    editorState.stopsModel = [model[0]].concat(perRoute[0]);
    if (editRiderName && firstRider.name) editRiderName.value = firstRider.name;
    if (editScheduleDate && first.scheduleDate) editScheduleDate.value = first.scheduleDate;
    if (editScheduleTime && first.startTime) editScheduleTime.value = first.startTime;
    if (editEtaMins && minutesBetween(first.startTime, first.endTime)) editEtaMins.value = String(minutesBetween(first.startTime, first.endTime));
    const allNotes = editNotes ? editNotes.value : '';
    if (editNotes && first.notes) editNotes.value = first.notes;
    if (editInternalNotes) editInternalNotes.value = (editInternalNotes.value ? editInternalNotes.value + '\n' : '') + 'Route 1 of ' + count + ' (split order)';
    editorState.routeWarning = firstRider.warning || '';

    const shared = sharedRouteFields();
    routes.slice(1).forEach(function(r, i){
      const rider = resolveRiderName(r.riderName);
      queueRoute({
        label: 'Route ' + (i + 2) + ' of ' + count,
        shared: shared,
        pickup: model[0].address,
        stops: perRoute[i + 1],
        riderName: rider.name,
        warning: rider.warning || (perRoute[i + 1].length ? '' : 'no stops matched this route'),
        date: r.scheduleDate || '',
        startTime: r.startTime || '',
        endTime: r.endTime || '',
        etaMins: minutesBetween(r.startTime, r.endTime),
        notes: r.notes || allNotes,
        internalNote: 'Route ' + (i + 2) + ' of ' + count + ' (split order)'
      });
    });
    if (editorTitle) editorTitle.textContent = 'Create new order — Route 1 of ' + count;
    renderStopsList();
    updateMapsRouteLink();
    autoCalcStopsFee();
    updateEditorDirtyFromForm();
  }

  // "Split selected stops": moves the ticked pending drops out of this order
  // into a queued new order with its own rider and time window.
  function splitSelectedStops(riderRaw, startTime, endTime){
    const model = editorState.stopsModel || [];
    const selected = model.filter(function(s){ return splitSelection.has(s); });
    if (!selected.length) return;
    const remaining = model.filter(function(s){ return !splitSelection.has(s); });
    if (remaining.length < 2) {
      setEditorFeedback('Keep at least one delivery in this order.', true);
      return;
    }
    const rider = resolveRiderName(riderRaw);
    const ref = normalizeText(editorState.order && editorState.order.reference);
    splitSelection.clear();
    editorState.stopsModel = remaining;
    queueRoute({
      label: 'New route' + (ref ? (' split from ' + ref) : ''),
      shared: sharedRouteFields(),
      pickup: remaining[0].address,
      stops: selected,
      riderName: rider.name,
      warning: rider.warning || '',
      date: '',
      startTime: startTime || '',
      endTime: endTime || '',
      etaMins: minutesBetween(startTime, endTime),
      notes: editNotes ? editNotes.value : '',
      internalNote: ref ? ('Split from ' + ref) : 'Split order'
    });
    renderStopsList();
    updateMapsRouteLink();
    autoCalcStopsFee();
    updateEditorDirtyFromForm();
    setEditorFeedback(selected.length + ' stop' + (selected.length === 1 ? '' : 's') + ' moved to a new order — save this one, then check the new route.');
  }

  // Registered riders as suggestions for the editor's rider field, so the name
  // matches what the rider app looks for.
  function refreshRiderSuggestions(){
    if (!editRiderName) return;
    let list = document.getElementById('dispatcherRiderList');
    if (!list) {
      list = document.createElement('datalist');
      list.id = 'dispatcherRiderList';
      document.body.appendChild(list);
      editRiderName.setAttribute('list', 'dispatcherRiderList');
    }
    list.innerHTML = '';
    (_ridersCache || []).forEach(function(r){
      const opt = document.createElement('option');
      opt.value = r.name;
      list.appendChild(opt);
    });
  }

  function closeEditor(force, keepRoutes){
    if (!editorModal) return;
    if (!force && (editorState.dirty || pendingRoutes.length)) {
      const ok = window.confirm(pendingRoutes.length
        ? ('Discard this order and the ' + pendingRoutes.length + ' route' + (pendingRoutes.length === 1 ? '' : 's') + ' waiting after it?')
        : 'Discard unsaved changes?');
      if (!ok) return;
    }
    if (!keepRoutes) pendingRoutes = [];
    splitSelection.clear();
    editorState.routeWarning = '';
    stopCameraStream();
    parkEditor();
    editorState.open = false;
    editorState.order = null;
    editorState.sourceEventId = '';
    setEditorDirty(false);
    setEditorFeedback('');
    togglePriceNotice(false);
  }

  function openEditor(mode, order){
    if (!editorModal) return;
    if (editorState.open) {
      if ((editorState.dirty || pendingRoutes.length) && !window.confirm('Discard the changes to the order you are editing?')) return;
      pendingRoutes = [];
      splitSelection.clear();
      parkEditor();
    }

    const normalizedMode = mode || 'edit';
    const source = order || null;
    const quote = source && source.quote ? source.quote : {};
    const route = source && source.route ? source.route : (quote.route || {});
    const customer = source && source.customer ? source.customer : {};
    const breakdown = deriveQuoteBreakdown(quote);

    if (editorTitle) {
      editorTitle.textContent = normalizedMode === 'create'
        ? 'Create new order'
        : ((normalizedMode === 'duplicate' ? 'Duplicate order' : 'Edit order') + (source && source.reference ? (' ' + normalizeText(source.reference)) : ''));
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

    if (editAccountToken) editAccountToken.value = modeCreate ? '' : normalizeText(source && source.accountToken);
    if (editAccountStaffName) editAccountStaffName.value = modeCreate ? '' : normalizeText(source && source.staffName);
    if (editAccountPickupTime) editAccountPickupTime.value = modeCreate ? '' : normalizeText(source && source.pickupTime);
    if (editAccountDropoffTime) editAccountDropoffTime.value = modeCreate ? '' : normalizeText(source && source.dropoffTime);
    if (editAccountAttName) editAccountAttName.value = modeCreate ? '' : normalizeText(source && source.attName);
    if (editAccountAttContact) editAccountAttContact.value = modeCreate ? '' : normalizeText(source && source.attContact);
    resetAccountStatus();
    if (editAccountToken && editAccountToken.value) verifyAccountToken(true);

    if (editNotes) editNotes.value = modeCreate ? '' : normalizeText(source && source.notes);

    if (editScheduleDate) editScheduleDate.value = modeCreate ? (dateInput && dateInput.value ? dateInput.value : formatDateKey(new Date())) : normalizeText(source && source.schedule && source.schedule.date);
    if (editScheduleTime) editScheduleTime.value = modeCreate ? '09:00' : normalizeText(source && source.schedule && source.schedule.time || '09:00');
    if (editEtaMins) editEtaMins.value = String(safeNumber(quote && quote.etaMins, 60));
    if (editTotalKm) editTotalKm.value = String(safeNumber(quote && quote.totalKm, 0));

    if (editCargoType) editCargoType.value = normalizeText(quote && quote.cargoType);
    if (editLoadType) editLoadType.value = cargoKeyFromQuote(quote);
    if (editPromoCode) editPromoCode.value = (modeCreate || !Array.isArray(quote && quote.discountCodes)) ? '' : quote.discountCodes.join(', ');
    // The stored complete breakdown is kept only while the price fields still match it.
    editorState.pricingDetail = (!modeCreate && quote && quote.pricingDetail && typeof quote.pricingDetail === 'object') ? quote.pricingDetail : null;
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
    renderEditorSubtotal();

    if (editBillingMode) editBillingMode.value = (quote && (quote.billingMode === 'elapsed' || quote.billingMode === 'per_stop')) ? quote.billingMode : 'flat';
    if (editStopCount) editStopCount.value = (quote && quote.stopCount) ? String(safeNumber(quote.stopCount, 0)) : '';
    if (editStopRate) editStopRate.value = (quote && quote.stopRate) ? String(safeNumber(quote.stopRate, 0)) : '';
    if (editHourlyRate) editHourlyRate.value = String(safeNumber(quote && quote.hourlyRate, 0));
    if (editRouteStartedAt) editRouteStartedAt.value = isoToDatetimeLocal(source && source.routeStartedAt);
    if (editRouteCompletedAt) editRouteCompletedAt.value = isoToDatetimeLocal(source && source.routeCompletedAt);
    if (editElapsedMinutes) editElapsedMinutes.value = String(safeNumber(quote && quote.elapsedMinutes, 0));
    applyBillingModeVisibility();

    if (editStatus) editStatus.value = modeCreate || modeDuplicate ? 'Confirmed' : normalizeText(source && source.status || 'Confirmed');
    if (editPaymentStatus) editPaymentStatus.value = modeCreate || modeDuplicate ? 'Pending' : normalizeText(source && source.paymentStatus || 'Pending');
    if (editPaymentUrl) editPaymentUrl.value = modeCreate || modeDuplicate ? '' : normalizeText(source && source.paymentUrl);

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

    // Show / hide quick import panel
    if (importPanel) {
      importPanel.style.display = modeCreate ? '' : 'none';
      if (modeCreate) clearImportPanel();
    }

    // Reset stops quick-add
    if (stopsQuickPanel) stopsQuickPanel.style.display = 'none';
    if (stopsQuickAddToggle) stopsQuickAddToggle.textContent = '⚡ Quick add';
    if (stopsQTypeWrap) stopsQTypeWrap.style.display = 'none';
    if (stopsQConfirmWrap) stopsQConfirmWrap.style.display = 'none';
    if (stopsQStatus) stopsQStatus.textContent = '';

    // Reset payment link status
    if (editCreatePaymentStatus) { editCreatePaymentStatus.textContent = ''; editCreatePaymentStatus.style.display = 'none'; }
    if (editCreatePaymentBtn) editCreatePaymentBtn.disabled = false;

    togglePriceNotice(false);
    setEditorFeedback('');
    resetPriceOverride();
    if (!modeCreate && quote && quote.priceOverride && editPriceOverride) {
      editPriceOverride.checked = true;
      applyPriceOverride();
    }
    updateMapsRouteLink();
    autoCalcStopsFee();

    editorState.open = true;
    editorState.mode = normalizedMode;
    editorState.order = source;
    editorState.sourceEventId = normalizeText(source && source.eventId);
    // _customerNoteOriginal lets the save send a stop's customer note only when
    // it was changed here, so a rider's note added meanwhile isn't overwritten.
    // A duplicate is a new run, so its customer notes start blank.
    // _orig/_origIndex: the stop as loaded, for highlighting what changed.
    editorState.stopsModel = modeCreate
      ? [blankStopEntry(), blankStopEntry()]
      : (Array.isArray(route.stops) ? route.stops.map(function(s, idx){
        const copy = Object.assign({}, s);
        if (modeDuplicate) copy.customerNote = '';
        copy._customerNoteOriginal = copy.customerNote || '';
        copy._notesOriginal = copy.notes || '';
        copy._orig = {};
        STOP_TRACKED_FIELDS.forEach(function(f){ copy._orig[f] = copy[f] || ''; });
        copy._origIndex = idx;
        return copy;
      }) : []);
    editorState.origStopIds = editorState.stopsModel.map(function(s){ return s.id; }).filter(Boolean);
    editorState.routeWarning = '';
    splitSelection.clear();
    if (splitBarEl) Array.prototype.forEach.call(splitBarEl.querySelectorAll('input'), function(i){ i.value = ''; });
    refreshRiderSuggestions();
    renderStopsList();
    editorState.snapshot = editorModelSnapshot();
    setEditorDirty(false);

    mountEditorInline(true);
    markEditorBaseline();
    refreshChangedHighlights();
    renderRoutesBanner();
    updateSaveLabel();
  }

  // The complete breakdown from "Get system pricing", but only if the price
  // fields still say exactly that (nothing typed over it since); otherwise
  // null, which also clears an old one from the order.
  function currentPricingDetail(manualPrice, total, breakdown){
    const d = editorState.pricingDetail;
    if (!d || manualPrice) return null;
    if (editBillingMode && editBillingMode.value !== 'flat') return null;
    const near = function(a, b){ return Math.abs(safeNumber(a, 0) - safeNumber(b, 0)) < 0.005; };
    const ok = near(d.total, total) && near(d.pickupCharge + d.minimumTopUp, breakdown.base) &&
      near(d.distanceTotal, breakdown.distance) && near(d.addressFee, breakdown.stops) &&
      near(d.cargoAmount + d.surchargeAmount, breakdown.surcharge) && near(d.discountAmount, breakdown.discount) &&
      near(d.vatAmount, breakdown.adjustment);
    return ok ? d : null;
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

    let total = safeNumber(editPriceTotal && editPriceTotal.value, 0);
    const manualPrice = isManualFlatPrice();
    if (manualPrice) {
      const split = vatSplit(total);
      total = split.total;
      breakdown.base = split.subtotal;
      breakdown.distance = 0;
      breakdown.stops = 0;
      breakdown.surcharge = 0;
      breakdown.discount = 0;
      breakdown.adjustment = split.vat;
    }

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
          // The unified list: index 0 is pickup, the last index is dropoff,
          // everything between is an intermediate stop — all saved the same way.
          stops: editorState.stopsModel.filter(function(s){ return normalizeText(s.address); }).map(function(s){
            const out = {
              id: s.id || '', address: normalizeText(s.address), tier: normalizeText(s.tier), priority: !!s.priority, outlier: !!s.outlier,
              lat: hasExactLocation(s) ? Number(s.lat) : null, lng: hasExactLocation(s) ? Number(s.lng) : null,
              // Contact details are only edited here (riders can't), so always sent.
              recipientName: normalizeText(s.recipientName), recipientPhone: normalizeText(s.recipientPhone),
              recipientEmail: normalizeText(s.recipientEmail), addressDetails: normalizeText(s.addressDetails)
            };
            // Internal note: the backend keeps a stop's saved note unless told
            // it was edited here (a rider's route resubmit mustn't wipe it).
            out.notes = normalizeText(s.notes);
            if (s.id && out.notes !== normalizeText(s._notesOriginal)) out.notesEdited = true;
            // Only send the customer note when it's new or edited here (see openEditor).
            const note = normalizeText(s.customerNote);
            if (editorState.mode !== 'edit' || !s.id || note !== normalizeText(s._customerNoteOriginal)) out.customerNote = note;
            return out;
          })
        },
        total: total,
        priceOverride: manualPrice,
        billingMode: normalizeText(editBillingMode && editBillingMode.value) || 'flat',
        hourlyRate: safeNumber(editHourlyRate && editHourlyRate.value, 0),
        elapsedMinutes: safeNumber(editElapsedMinutes && editElapsedMinutes.value, 0),
        stopCount: Math.max(0, Math.round(safeNumber(editStopCount && editStopCount.value, 0))),
        stopRate: safeNumber(editStopRate && editStopRate.value, 0),
        etaMins: Math.max(15, safeNumber(editEtaMins && editEtaMins.value, 60)),
        totalKm: safeNumber(editTotalKm && editTotalKm.value, 0),
        currency: 'EUR',
        cargoType: normalizeText(editCargoType && editCargoType.value),
        cargoKey: normalizeText(editLoadType && editLoadType.value) || 'regular',
        loadType: (editLoadType && editLoadType.selectedOptions && editLoadType.selectedOptions[0]) ? normalizeText(editLoadType.selectedOptions[0].textContent) : '',
        discountCodes: promoCodesFromInput(),
        pricingDetail: currentPricingDetail(manualPrice, total, breakdown),
        vehicleType: normalizeText(editVehicleType && editVehicleType.value),
        packageCount: safeNumber(editPackageCount && editPackageCount.value, 0),
        weightKg: safeNumber(editWeightKg && editWeightKg.value, 0),
        volumeM3: safeNumber(editVolumeM3 && editVolumeM3.value, 0),
        breakdown: Object.assign({}, breakdown, { total: total })
      },
      notes: normalizeText(editNotes && editNotes.value),
      updatesPreference: normalizeText(editUpdatesPreference && editUpdatesPreference.value),
      language: 'en',
      sourceUrl: window.location.href,
      accountToken: normalizeText(editAccountToken && editAccountToken.value).toUpperCase(),
      staffName: normalizeText(editAccountStaffName && editAccountStaffName.value),
      pickupTime: normalizeText(editAccountPickupTime && editAccountPickupTime.value),
      dropoffTime: normalizeText(editAccountDropoffTime && editAccountDropoffTime.value),
      attName: normalizeText(editAccountAttName && editAccountAttName.value),
      attContact: normalizeText(editAccountAttContact && editAccountAttContact.value)
    };
  }

  function validateEditorData(orderData){
    const customerName = normalizeText(orderData && orderData.customer && orderData.customer.name);
    const stops = (orderData && orderData.quote && orderData.quote.route && orderData.quote.route.stops) || [];
    const pickup = normalizeText(stops[0] && stops[0].address);
    const dropoff = normalizeText(stops.length > 1 && stops[stops.length - 1].address);
    const date = normalizeDateKey(orderData && orderData.quote && orderData.quote.schedule && orderData.quote.schedule.date);
    const time = normalizeText(orderData && orderData.quote && orderData.quote.schedule && orderData.quote.schedule.time);

    if (!customerName) return 'Customer name is required.';
    if (stops.length < 2 || !pickup || !dropoff) return 'Pickup and dropoff are required.';
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
      message: normalizeText(editSaveNote && editSaveNote.value),
      routeStartedAt: (editRouteStartedAt && editRouteStartedAt.value) ? new Date(editRouteStartedAt.value).toISOString() : '',
      routeCompletedAt: (editRouteCompletedAt && editRouteCompletedAt.value) ? new Date(editRouteCompletedAt.value).toISOString() : ''
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
      const savedMode = editorState.mode;
      if (order) upsertOrderInState(order, true);
      closeEditor(true, true);
      const savedMsg = savedMode === 'create' ? 'Order created.' : (savedMode === 'duplicate' ? 'Order duplicated.' : 'Order saved.');
      // A split order: open the next route, pre-filled, to check and save.
      if (pendingRoutes.length) {
        const next = pendingRoutes.shift();
        openRouteDraft(next);
        setStatus(savedMsg + ' Now check ' + next.label + '.');
      } else {
        setStatus(savedMsg);
      }
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
        // Left undefined (so not sent) when the caller has no Invoiced control.
        invoiced: controls.invoiced ? controls.invoiced.value === 'yes' : undefined,
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

  function canCheckStripePayment(order){
    const payment = normalizeText(order && order.paymentStatus);
    if (payment !== 'Pending' && payment !== 'Failed') return false;
    return !!(order.hasStripeSession || /stripe\.com/i.test(normalizeText(order.paymentUrl)));
  }

  async function checkStripePayment(order, btn){
    if (!order || !order.eventId) return;
    const ref = normalizeText(order.reference) || 'this order';
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Checking Stripe...';
    setStatus('Checking Stripe for ' + ref + '...');
    try {
      const res = await postAdmin({
        action: 'adminCheckStripePayment',
        eventId: order.eventId,
        reference: normalizeText(order.reference),
        operator: currentOperator()
      });
      if (res && res.found) {
        let msg = 'Paid in Stripe \u2713 \u2014 ';
        if (res.confirmationEmailSent) msg += 'confirmation sent to the customer.';
        else if (res.confirmationEmailSentAt) msg += 'the customer already had their confirmation.';
        else msg += 'but the confirmation email could NOT be sent. Contact the customer.';
        const emailFailed = !res.confirmationEmailSent && !res.confirmationEmailSentAt;
        if (res.order) upsertOrderInState(res.order);
        setStatus(ref + ': ' + msg, emailFailed);
        showToast(msg, emailFailed);
      } else {
        const msg = (res && res.message) || ('No completed payment found in Stripe for ' + ref + '.');
        setStatus(msg, true);
        showToast(msg, true);
      }
    } catch (err) {
      const raw = err && err.message ? err.message : 'Stripe check failed.';
      const msg = /unknown action/i.test(raw)
        ? 'The backend doesn\'t have the Stripe check yet. Redeploy Code.gs (Manage deployments \u2192 New version) and try again.'
        : raw;
      setStatus(msg, true);
      showToast(msg, true);
    } finally {
      if (btn.isConnected) {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
  }

  async function cardCompleteStop(order, stop, status){
    if (!order.eventId || !stop.id) return;
    let reason = '';
    if (status === 'Failed') {
      reason = window.prompt('Reason the stop failed:') || '';
      if (!reason.trim()) return;
    }
    try {
      await postAdmin({
        action: 'adminUpdateStop',
        eventId: order.eventId,
        stopId: stop.id,
        status: status,
        reason: reason,
        operator: currentOperator()
      });
      await refreshCurrentLoad();
      setStatus('Stop updated.');
    } catch (err) {
      setStatus(err && err.message ? err.message : 'Stop update failed.', true);
    }
  }

  function buildCardStopRow(order, stop, stopIdx, stopsLength){
    const isFirst = stopIdx === 0;
    const isLast = stopIdx === stopsLength - 1;
    const row = document.createElement('div');
    row.style.cssText = 'border:1px solid var(--dispatch-border,#ddd);border-radius:8px;padding:0.35rem 0.5rem;display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;font-size:0.75rem;';

    const addr = document.createElement('span');
    addr.style.cssText = 'flex:1 1 auto;min-width:120px;';
    const label = isFirst ? 'Pickup' : (isLast ? 'Dropoff' : String(stopIdx + 1));
    addr.textContent = label + '. ' + (stop.address || '');
    row.appendChild(addr);

    const badge = document.createElement('span');
    badge.innerHTML = stopStatusBadgeHtml(stop.status, isFirst);
    row.appendChild(badge);

    if (stop.status === 'Failed' && stop.failureReason) {
      const reasonEl = document.createElement('span');
      reasonEl.style.color = '#b00020';
      reasonEl.textContent = stop.failureReason;
      row.appendChild(reasonEl);
    }

    if (stop.notes) {
      const notesEl = document.createElement('span');
      notesEl.style.cssText = 'color:var(--dispatch-muted);font-style:italic;';
      notesEl.textContent = '📝 ' + stop.notes;
      row.appendChild(notesEl);
    }

    if (stop.customerNote) {
      const custEl = document.createElement('span');
      custEl.title = 'Note for customer (shown on tracking)';
      custEl.textContent = '💬 ' + stop.customerNote;
      row.appendChild(custEl);
    }

    if (stop.podUrl) {
      const podLink = document.createElement('a');
      podLink.href = stop.podUrl;
      podLink.target = '_blank';
      podLink.rel = 'noopener';
      podLink.textContent = '📷 POD';
      row.appendChild(podLink);
    }

    if (stop.id && order.eventId) {
      const podInput = document.createElement('input');
      podInput.type = 'file';
      podInput.accept = 'image/*';
      podInput.style.display = 'none';

      const podBtn = document.createElement('button');
      podBtn.type = 'button';
      podBtn.className = 'btn btn--ghost';
      podBtn.style.cssText = 'padding:0.1rem 0.4rem;font-size:0.7rem;';
      podBtn.textContent = stop.podUrl ? '📷 Replace POD' : '📷 Upload POD';
      podBtn.addEventListener('click', function(){ podInput.click(); });

      podInput.addEventListener('change', function(){
        const file = podInput.files && podInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async function(){
          podBtn.disabled = true;
          podBtn.textContent = 'Uploading...';
          try {
            await postAdmin({
              action: 'adminUpdateStop',
              eventId: order.eventId,
              stopId: stop.id,
              podData: String(reader.result || ''),
              podFileName: file.name,
              podContentType: file.type,
              operator: currentOperator()
            });
            await refreshCurrentLoad();
            setStatus('POD uploaded.');
          } catch (err) {
            setStatus(err && err.message ? err.message : 'POD upload failed.', true);
            podBtn.disabled = false;
            podBtn.textContent = stop.podUrl ? '📷 Replace POD' : '📷 Upload POD';
          } finally {
            podInput.value = '';
          }
        };
        reader.readAsDataURL(file);
      });

      row.appendChild(podBtn);
      row.appendChild(podInput);
    }

    if (stop.id && order.eventId) {
      const notesBtn = document.createElement('button');
      notesBtn.type = 'button';
      notesBtn.className = 'btn btn--ghost';
      notesBtn.style.cssText = 'padding:0.1rem 0.4rem;font-size:0.7rem;';
      notesBtn.textContent = stop.notes ? '✎ Edit internal note' : '✎ Add internal note';
      notesBtn.addEventListener('click', async function(){
        const next = window.prompt('Internal note for this stop (rider and dispatch only, never shown on tracking):', stop.notes || '');
        if (next == null) return;
        try {
          await postAdmin({
            action: 'adminUpdateStop',
            eventId: order.eventId,
            stopId: stop.id,
            notes: next,
            operator: currentOperator()
          });
          await refreshCurrentLoad();
          setStatus('Note saved.');
        } catch (err) {
          setStatus(err && err.message ? err.message : 'Note save failed.', true);
        }
      });
      row.appendChild(notesBtn);
    }

    if ((!stop.status || stop.status === 'Pending') && stop.id && order.eventId) {
      const deliveredBtn = document.createElement('button');
      deliveredBtn.type = 'button';
      deliveredBtn.className = 'btn btn--ghost';
      deliveredBtn.style.cssText = 'padding:0.1rem 0.4rem;font-size:0.7rem;';
      deliveredBtn.textContent = isFirst ? '✓ Picked up' : '✓ Delivered';
      deliveredBtn.addEventListener('click', function(){ cardCompleteStop(order, stop, 'Delivered'); });

      const failedBtn = document.createElement('button');
      failedBtn.type = 'button';
      failedBtn.className = 'btn btn--ghost';
      failedBtn.style.cssText = 'padding:0.1rem 0.4rem;font-size:0.7rem;';
      failedBtn.textContent = '✗ Failed';
      failedBtn.addEventListener('click', function(){ cardCompleteStop(order, stop, 'Failed'); });

      row.appendChild(deliveredBtn);
      row.appendChild(failedBtn);
    }

    return row;
  }

  function renderOrders(orders){
    if (!ordersWrap) return;
    // The inline editor lives inside a card; take it out before the list is
    // rebuilt and put it back (into the same order's card) afterwards.
    parkEditor();
    ordersWrap.innerHTML = '';
    renderOrderCards(orders);
    if (editorState.open) mountEditorInline(false);
  }

  function renderOrderCards(orders){

    // Only orders on screen can stay ticked, so bulk actions never touch hidden orders.
    const visibleIds = new Set(orders.map(function(order){ return order.eventId; }));
    selectedEventIds.forEach(function(id){ if (!visibleIds.has(id)) selectedEventIds.delete(id); });
    bulkEls = null;

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
      if (order.eventId) card.dataset.eventId = order.eventId;

      const top = document.createElement('div');
      top.className = 'dispatcher-card-top';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'dispatcher-card-title';
      const title = document.createElement('h3');
      title.textContent = (normalizeText(order.reference) || 'Order') + ' - ' + (normalizeText(order.status) || '');
      if (order.eventId) {
        const selectBox = document.createElement('input');
        selectBox.type = 'checkbox';
        selectBox.className = 'dispatcher-select';
        selectBox.checked = selectedEventIds.has(order.eventId);
        selectBox.setAttribute('aria-label', 'Select ' + (normalizeText(order.reference) || 'order'));
        if (selectBox.checked) card.classList.add('is-selected');
        selectBox.addEventListener('change', function(){
          if (selectBox.checked) selectedEventIds.add(order.eventId);
          else selectedEventIds.delete(order.eventId);
          card.classList.toggle('is-selected', selectBox.checked);
          updateBulkBar();
        });
        title.prepend(selectBox);
      }
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
      // Keyed on the token (not payment status) so the badge stays after the order is marked Paid.
      if (normalizeText(order.accountToken) || normalizeText(order.paymentStatus) === 'Account') badges.appendChild(statusChip('Account: ' + (normalizeText(order.accountName) || normalizeText(order.accountToken) || 'Account'), 'is-account'));
      if (normalizeText(order.invoicedAt)) badges.appendChild(statusChip('Invoiced ' + formatIsoForUi(order.invoicedAt), 'is-invoiced'));
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
        '<span><strong>Updates:</strong> ' + (normalizeText(order && order.updatesPreference) || 'Default') + '</span>';
      if (normalizeText(order && order.staffName))  meta.innerHTML += '<span><strong>Staff:</strong> '        + normalizeText(order.staffName)  + '</span>';
      if (normalizeText(order && order.pickupTime)) meta.innerHTML += '<span><strong>Pickup time:</strong> '  + normalizeText(order.pickupTime)  + '</span>';
      if (normalizeText(order && order.dropoffTime))meta.innerHTML += '<span><strong>Dropoff time:</strong> ' + normalizeText(order.dropoffTime) + '</span>';
      if (normalizeText(order && order.attName))    meta.innerHTML += '<span><strong>Att name:</strong> '     + normalizeText(order.attName)     + '</span>';
      if (normalizeText(order && order.attContact)) meta.innerHTML += '<span><strong>Att contact:</strong> '  + normalizeText(order.attContact)  + '</span>';
      card.appendChild(meta);

      if (order && order.route && Array.isArray(order.route.stops) && order.route.stops.length) {
        const stopsWrap = document.createElement('div');
        stopsWrap.className = 'dispatcher-stops';
        stopsWrap.style.cssText = 'margin:0.4rem 0;display:flex;flex-direction:column;gap:0.3rem;';

        const stopsTitle = document.createElement('div');
        stopsTitle.style.cssText = 'font-size:0.72rem;font-weight:600;color:var(--dispatch-muted);';
        stopsTitle.textContent = 'Stops (' + order.route.stops.length + ')';
        stopsWrap.appendChild(stopsTitle);

        order.route.stops.forEach(function(stop, stopIdx){
          stopsWrap.appendChild(buildCardStopRow(order, stop, stopIdx, order.route.stops.length));
        });

        // Route map (opened on demand) and Optimize, under the stops.
        if (order.route.stops.length >= 2) {
          const pendingDrops = order.route.stops.slice(1).filter(function(s){ return !s.status || s.status === 'Pending'; }).length;
          const mapPanel = buildStopsMapPanel(function(){ return order.route.stops; }, {
            onOptimize: pendingDrops >= 2 ? function(btn){ optimizeOrderInEditor(order, btn); } : null,
            onToggle: function(isOpen){
              if (isOpen) openCardMaps.add(order.eventId);
              else openCardMaps.delete(order.eventId);
            }
          });
          stopsWrap.appendChild(mapPanel.el);
          // Stays open across list redraws.
          if (order.eventId && openCardMaps.has(order.eventId)) mapPanel.setOpen(true);
        }

        card.appendChild(stopsWrap);
      }

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

      const quickInvoiced = document.createElement('select');
      [['no', 'No'], ['yes', 'Yes']].forEach(function(pair){
        const option = document.createElement('option');
        option.value = pair[0];
        option.textContent = pair[1];
        if ((normalizeText(order.invoicedAt) ? 'yes' : 'no') === pair[0]) option.selected = true;
        quickInvoiced.appendChild(option);
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

      const riderDropdownWrap = document.createElement('div');
      riderDropdownWrap.className = 'dispatcher-field span-3';
      const riderDropdownLabel = document.createElement('label');
      riderDropdownLabel.textContent = 'Assign rider';
      const riderDropdown = document.createElement('select');
      const riderOptNone = document.createElement('option');
      riderOptNone.value = '';
      riderOptNone.textContent = '— Unassigned —';
      riderDropdown.appendChild(riderOptNone);
      _ridersCache.forEach(function(r){
        const opt = document.createElement('option');
        opt.value = r.name;
        opt.textContent = r.name;
        if (r.name === normalizeText(order.riderName)) opt.selected = true;
        riderDropdown.appendChild(opt);
      });
      // Rider assigned by a name that's not in the active list (revoked, or
      // typed by hand) — show it rather than pretending the order is unassigned.
      const currentRider = normalizeText(order.riderName);
      if (currentRider && !_ridersCache.some(function(r){ return r.name === currentRider; })) {
        const opt = document.createElement('option');
        opt.value = currentRider;
        opt.textContent = currentRider + ' (not in rider list)';
        opt.selected = true;
        riderDropdown.appendChild(opt);
      }
      if (!_ridersCache.length) {
        const opt = document.createElement('option');
        opt.disabled = true;
        opt.textContent = 'Rider list did not load — reload the orders';
        riderDropdown.appendChild(opt);
      }
      riderDropdownWrap.appendChild(riderDropdownLabel);
      riderDropdownWrap.appendChild(riderDropdown);
      quick.appendChild(riderDropdownWrap);

      riderDropdown.addEventListener('change', function(){
        quickRiderName.value = riderDropdown.value;
      });

      const assignBtn = document.createElement('button');
      assignBtn.type = 'button';
      assignBtn.className = 'btn';
      assignBtn.style.cssText = 'padding:0.3rem 0.52rem;font-size:0.72rem;align-self:flex-end;';
      assignBtn.textContent = 'Assign';
      assignBtn.addEventListener('click', async function(){
        const name = riderDropdown.value;
        quickRiderName.value = name;
        const prevStatus = quickStatus.value;
        if (name && prevStatus === 'Confirmed') quickStatus.value = 'Assigned';
        if (!name && prevStatus === 'Assigned') quickStatus.value = 'Confirmed';
        await quickUpdate(order, {
          status: quickStatus,
          payment: quickPayment,
          riderName: quickRiderName,
          riderPhone: quickRiderPhone,
          date: quickDate,
          time: quickTime,
          eta: quickEta,
          internalNotes: quickInternalNotes,
          note: quickNote
        }, false);
        showToast(name ? 'Assigned to ' + name : 'Rider unassigned');
      });

      const assignWrap = document.createElement('div');
      assignWrap.className = 'dispatcher-field span-1';
      assignWrap.style.justifyContent = 'flex-end';
      assignWrap.style.display = 'flex';
      assignWrap.style.flexDirection = 'column';
      assignWrap.appendChild(assignBtn);
      quick.appendChild(assignWrap);

      quickField('Status', 'span-2', quickStatus);
      quickField('Payment', 'span-2', quickPayment);
      quickField('Invoiced', 'span-2', quickInvoiced);
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
      fullEditBtn.textContent = 'Edit';
      fullEditBtn.title = 'Edit every detail of this order right here';

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

      // Web bookings paid by card that never got marked Paid (the customer's
      // page didn't report back) — ask Stripe directly.
      if (canCheckStripePayment(order)) {
        const stripeCheckBtn = document.createElement('button');
        stripeCheckBtn.type = 'button';
        stripeCheckBtn.className = 'btn btn--ghost';
        stripeCheckBtn.textContent = 'Check Stripe payment';
        stripeCheckBtn.title = 'Ask Stripe whether this order was paid. If it was, the order is marked Paid and the customer is emailed their booking confirmation.';
        stripeCheckBtn.addEventListener('click', function(){ checkStripePayment(order, stripeCheckBtn); });
        actionsWrap.appendChild(stripeCheckBtn);
      }

      quick.appendChild(actionsWrap);

      // Pickup/dropoff POD upload lives on their stop rows in the "Stops"
      // section below (buildCardStopRow) — there's no separate whole-order
      // POD control anymore, since pickup/dropoff are just the first/last stop.
      const quickControls = {
        status: quickStatus,
        payment: quickPayment,
        invoiced: quickInvoiced,
        riderName: quickRiderName,
        riderPhone: quickRiderPhone,
        date: quickDate,
        time: quickTime,
        eta: quickEta,
        internalNotes: quickInternalNotes,
        note: quickNote
      };

      quickSaveBtn.addEventListener('click', function(){ quickUpdate(order, quickControls, false); });
      quickSendBtn.addEventListener('click', function(){ quickUpdate(order, quickControls, true); });
      fullEditBtn.addEventListener('click',  function(){ openEditor('edit', order); });
      duplicateBtn.addEventListener('click', function(){ openEditor('duplicate', order); });
      cancelBtn.addEventListener('click',    function(){ openCancelModal(order); });

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

    ordersWrap.appendChild(buildBulkBar(orders));
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

  // ── Quick Import ─────────────────────────────────────────────────────────

  function setupImportPanel() {
    if (!importDropZone || !importImageInput) return;

    // Click to open file picker
    importDropZone.addEventListener('click', function() {
      importImageInput.click();
    });

    // File selected via input
    importImageInput.addEventListener('change', function() {
      const file = importImageInput.files && importImageInput.files[0];
      if (file) loadImportImage(file);
    });

    // Drag and drop
    importDropZone.addEventListener('dragover', function(e) {
      e.preventDefault();
      importDropZone.style.borderColor = 'var(--dispatch-accent)';
      importDropZone.style.background  = 'rgba(240,123,57,0.06)';
    });
    importDropZone.addEventListener('dragleave', function() {
      importDropZone.style.borderColor = '';
      importDropZone.style.background  = '';
    });
    importDropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      importDropZone.style.borderColor = '';
      importDropZone.style.background  = '';
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) loadImportImage(file);
    });

    // Paste image anywhere in modal
    document.addEventListener('paste', function(e) {
      if (!importPanel || importPanel.style.display === 'none') return;
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          loadImportImage(items[i].getAsFile());
          break;
        }
      }
    });

    if (importExtractBtn) importExtractBtn.addEventListener('click', handleQuickImport);
    if (importClearBtn)   importClearBtn.addEventListener('click', clearImportPanel);
  }

  function loadImportImage(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      importImageBase64 = e.target.result.split(',')[1];
      importImageMime   = file.type || 'image/jpeg';
      if (importImageName) { importImageName.textContent = file.name; importImageName.style.display = 'block'; }
      if (importDropLabel)   importDropLabel.textContent = '✓ Image loaded';
      importDropZone.style.borderColor = 'var(--dispatch-accent)';
    };
    reader.readAsDataURL(file);
  }

  function clearImportPanel() {
    if (importText)        importText.value     = '';
    if (importImageInput)  importImageInput.value = '';
    if (importImageName)   { importImageName.textContent = ''; importImageName.style.display = 'none'; }
    if (importDropLabel)   importDropLabel.textContent = 'Click to select or drop an image';
    if (importStatus)      importStatus.textContent    = '';
    if (importDropZone)    importDropZone.style.borderColor = '';
    importImageBase64 = null;
    importImageMime   = null;
  }

  function setImportStatus(msg, isError) {
    if (!importStatus) return;
    importStatus.textContent = msg;
    importStatus.className   = 'dispatcher-status' + (isError ? ' is-error' : '');
  }

  async function handleQuickImport() {
    const text  = importText  ? importText.value.trim() : '';
    const image = importImageBase64;

    if (!text && !image) {
      setImportStatus('Paste a message or add an image first.', true);
      return;
    }

    setImportStatus('Extracting order details…');
    if (importExtractBtn) importExtractBtn.disabled = true;

    try {
      // Extraction runs in the backend (adminExtractOrder) so the Anthropic key
      // stays in Apps Script instead of each dispatcher's browser.
      const res = await postAdmin({
        action: 'adminExtractOrder',
        text: text,
        image: image || '',
        mimeType: importImageMime || ''
      });
      applyImportedFields(res.order);
      setImportStatus('✓ Fields populated — review and adjust before saving.');

    } catch(err) {
      setImportStatus(err && err.message ? err.message : 'Extraction failed.', true);
    } finally {
      if (importExtractBtn) importExtractBtn.disabled = false;
    }
  }

  function applyImportedFields(d) {
    if (!d) return;
    function fill(el, val) {
      if (el && val != null && val !== '') el.value = String(val);
    }
    fill(editCustomerName,   d.customerName);
    fill(editCustomerPhone,  d.customerPhone);
    fill(editCustomerEmail,  d.customerEmail);
    // Pickup/dropoff are stopsModel[0]/[last] (always present — openEditor
    // seeds 2 blank entries in create mode) rather than standalone inputs.
    if (!editorState.stopsModel.length) editorState.stopsModel.push(blankStopEntry(), blankStopEntry());
    if (d.pickupAddress) editorState.stopsModel[0].address = String(d.pickupAddress);
    // `deliveries` (one per address, with the recipient's details; the last is
    // the dropoff) — older extraction replies used dropoffAddress + stops.
    const deliveries = Array.isArray(d.deliveries) ? d.deliveries.filter(function(x){ return x && normalizeText(x.address); }) : [];
    function withContact(entry, x) {
      ['recipientName', 'recipientPhone', 'recipientEmail', 'addressDetails'].forEach(function(field){
        if (x[field] != null && x[field] !== '') entry[field] = String(x[field]);
      });
      entry.address = String(x.address);
      return entry;
    }
    if (deliveries.length) {
      withContact(editorState.stopsModel[editorState.stopsModel.length - 1], deliveries[deliveries.length - 1]);
      deliveries.slice(0, -1).forEach(function(x){
        editorState.stopsModel.splice(editorState.stopsModel.length - 1, 0, withContact(blankStopEntry(), x));
      });
    }
    if (d.dropoffAddress) editorState.stopsModel[editorState.stopsModel.length - 1].address = String(d.dropoffAddress);
    if (d.stops) {
      const stopLines = Array.isArray(d.stops)
        ? d.stops.map(function(s){ return String(s || '').trim(); }).filter(Boolean)
        : String(d.stops).split('\n').map(function(s){ return s.trim(); }).filter(Boolean);
      stopLines.forEach(function(addr){ addStopToModel(addr); });
    }
    renderStopsList();
    updateEditorDirtyFromForm();
    updateMapsRouteLink();
    autoCalcStopsFee();
    fill(editNotes,          d.notes);
    fill(editScheduleDate,   d.scheduleDate);
    fill(editScheduleTime,   d.scheduleTime);
    fill(editCargoType,      d.cargoType);
    if (editLoadType && d.cargoType) editLoadType.value = cargoKeyFromQuote({ cargoType: d.cargoType });
    fill(editInternalNotes,  d.internalNotes);
    if (editPackageCount && d.packageCount != null) editPackageCount.value = String(d.packageCount);
    if (editWeightKg     && d.weightKg     != null) editWeightKg.value     = String(d.weightKg);
    applyImportedRoutes(d);
    renderRoutesBanner();
    updateSaveLabel();
    updateEditorDirtyFromForm();
  }

  // ── Structured stops list ────────────────────────────────────────────────
  // Replaces the old plain textarea. Each stop is a row bound to an object in
  // editorState.stopsModel carrying id/status/podUrl/trackingToken/
  // completedAt/failureReason — this editor only ever edits address/tier here;
  // completion fields are read-only display, changed only via the
  // Delivered/Failed buttons (which call adminUpdateStop immediately, not part
  // of the main Save flow) so a stale re-save of this form can never clobber a
  // rider's already-recorded delivery.

  // Stops only have Pending/Delivered/Failed; on the pickup leg "Delivered"
  // means the cargo was collected.
  function stopStatusBadgeHtml(status, isPickup) {
    if (status === 'Delivered') return '<span class="stop-badge stop-badge--ok">' + (isPickup ? '✓ Picked up' : '✓ Delivered') + '</span>';
    if (status === 'Failed') return '<span class="stop-badge stop-badge--fail">✗ Failed</span>';
    return '<span class="stop-badge">Pending</span>';
  }

  function buildStopTrackingLink(stop) {
    const ref = normalizeText(editorState.order && editorState.order.reference);
    if (!ref || !stop.id || !stop.trackingToken) return '';
    return window.location.origin + '/tracking.html?ref=' + encodeURIComponent(ref) +
      '&stop=' + encodeURIComponent(stop.id) + '&t=' + encodeURIComponent(stop.trackingToken);
  }

  // Index of the stop row being dragged in the editor (null when idle).
  let dragStopIdx = null;

  // Index 0 is the pickup and stays first; every drop after it can move,
  // including the last one (whichever stop ends up last becomes the dropoff).
  function moveStopInModel(fromIdx, toIdx) {
    if (fromIdx < 1 || toIdx < 1 || fromIdx === toIdx) return;
    const moved = editorState.stopsModel.splice(fromIdx, 1)[0];
    editorState.stopsModel.splice(toIdx, 0, moved);
    renderStopsList();
    updateEditorDirtyFromForm();
    updateMapsRouteLink();
    autoCalcStopsFee();
  }

  function clearStopDragMarks() {
    if (!editStopsList) return;
    Array.prototype.forEach.call(editStopsList.children, function(r){
      r.classList.remove('drag-over-top', 'drag-over-bottom');
    });
  }

  // Rows accept a dragged drop above or below themselves; the pickup row only
  // below, so nothing can be placed before it.
  function attachStopDropTarget(row, idx) {
    function dropAbove(e) {
      if (idx === 0) return false;
      const rect = row.getBoundingClientRect();
      return e.clientY < rect.top + rect.height / 2;
    }
    row.addEventListener('dragover', function(e){
      if (dragStopIdx === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const above = dropAbove(e);
      row.classList.toggle('drag-over-top', above);
      row.classList.toggle('drag-over-bottom', !above);
    });
    row.addEventListener('dragleave', function(){
      row.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    row.addEventListener('drop', function(e){
      if (dragStopIdx === null) return;
      e.preventDefault();
      const from = dragStopIdx;
      dragStopIdx = null;
      clearStopDragMarks();
      const target = dropAbove(e) ? idx : idx + 1;
      moveStopInModel(from, target > from ? target - 1 : target);
    });
  }

  // Highlights a stop field that differs from the stop as loaded, live as it's typed.
  function trackStopInput(input, stop, field){
    input.classList.toggle('is-changed', stopFieldIsChanged(stop, field));
    input.addEventListener('input', function(){
      input.classList.toggle('is-changed', stopFieldIsChanged(stop, field));
    });
  }

  // Shown under the stops while any are ticked "Split": moves them to a new
  // order with its own rider and time window (see splitSelectedStops).
  let splitBarEl = null;
  function renderSplitBar(){
    if (!editStopsList || !editStopsList.parentNode) return;
    if (!splitBarEl) {
      splitBarEl = document.createElement('div');
      splitBarEl.className = 'stop-split-bar';
      const label = document.createElement('span');
      label.className = 'stop-split-label';
      const rider = document.createElement('input');
      rider.type = 'text';
      rider.placeholder = 'Rider';
      rider.setAttribute('list', 'dispatcherRiderList');
      const start = document.createElement('input');
      start.type = 'time';
      start.title = 'Start time';
      const to = document.createElement('span');
      to.textContent = 'to';
      const end = document.createElement('input');
      end.type = 'time';
      end.title = 'End time (optional)';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = 'Split off';
      btn.addEventListener('click', function(){ splitSelectedStops(rider.value, start.value, end.value); });
      [label, rider, start, to, end, btn].forEach(function(el){ splitBarEl.appendChild(el); });
      splitBarEl._label = label;
      editStopsList.parentNode.insertBefore(splitBarEl, editStopsList.nextSibling);
    }
    const count = (editorState.stopsModel || []).filter(function(s){ return splitSelection.has(s); }).length;
    splitBarEl.style.display = count ? '' : 'none';
    splitBarEl._label.textContent = 'Move ' + count + ' stop' + (count === 1 ? '' : 's') + ' to a new order:';
  }

  function renderStopsList() {
    if (!editStopsList) return;
    editStopsList.innerHTML = '';
    const moved = movedStops();
    editorState.stopsModel.forEach(function(stop, idx) {
      const isFirst = idx === 0;
      const isLast = idx === editorState.stopsModel.length - 1;
      const isPinned = isFirst || isLast;

      const row = document.createElement('div');
      row.className = 'stop-row';
      row.style.cssText = 'border:1px solid var(--dispatch-border,#ddd);border-radius:8px;padding:0.4rem 0.5rem;margin-bottom:0.35rem;';
      // When editing an existing order, mark stops that were added or moved.
      if (editorState.mode !== 'create') {
        row.classList.toggle('is-new-stop', !stop._orig);
        row.classList.toggle('is-moved', moved.indexOf(stop) >= 0);
      }
      attachStopDropTarget(row, idx);

      const topRow = document.createElement('div');
      topRow.style.cssText = 'display:flex;gap:0.35rem;align-items:center;';

      // Drag handle on every drop; dragging only from the handle keeps text
      // selection in the address/tier inputs working.
      if (!isFirst) {
        const handle = document.createElement('span');
        handle.className = 'stop-drag-handle';
        handle.textContent = '⠿';
        handle.title = 'Drag to reorder';
        handle.draggable = true;
        handle.addEventListener('dragstart', function(e){
          dragStopIdx = idx;
          row.classList.add('is-dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(idx));
          if (e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(row, 12, 12);
        });
        handle.addEventListener('dragend', function(){
          dragStopIdx = null;
          row.classList.remove('is-dragging');
          clearStopDragMarks();
        });
        topRow.appendChild(handle);
      }

      if (isPinned) {
        const roleLabel = document.createElement('span');
        roleLabel.textContent = isFirst ? 'Pickup' : 'Dropoff';
        roleLabel.style.cssText = 'flex:0 0 auto;font-size:0.7rem;font-weight:700;color:var(--dispatch-muted);';
        topRow.appendChild(roleLabel);
      }

      const addrInput = document.createElement('input');
      addrInput.type = 'text';
      addrInput.placeholder = isFirst ? 'Pickup address' : (isLast ? 'Dropoff address' : 'Stop address');
      addrInput.value = stop.address || '';
      addrInput.style.cssText = 'flex:1 1 auto;min-width:0;';
      addrInput.addEventListener('input', function(){
        stop.address = addrInput.value;
        // Typed by hand: the exact point picked earlier no longer applies.
        if (!addrInput._fromPlace) setStopLocation(stop, addrInput, null);
        updateEditorDirtyFromForm();
        updateMapsRouteLink();
        autoCalcStopsFee();
      });
      trackStopInput(addrInput, stop, 'address');
      topRow.appendChild(addrInput);
      setStopLocation(stop, addrInput, hasExactLocation(stop) ? { lat: stop.lat, lng: stop.lng } : null);
      attachPlacesAutocomplete(addrInput, stop);

      if (isFirst) {
        const locBtn = document.createElement('button');
        locBtn.type = 'button';
        locBtn.className = 'btn btn--ghost';
        locBtn.textContent = '📍 My location';
        locBtn.style.cssText = 'flex:0 0 auto;padding:0.15rem 0.4rem;font-size:0.7rem;';
        locBtn.addEventListener('click', function(){ handlePickupMyLocation(locBtn, addrInput); });
        topRow.appendChild(locBtn);
      }

      if (!isPinned) {
        const tierInput = document.createElement('input');
        tierInput.type = 'text';
        tierInput.placeholder = 'Tier';
        tierInput.value = stop.tier || '';
        tierInput.style.cssText = 'flex:0 0 64px;';
        tierInput.addEventListener('input', function(){
          stop.tier = tierInput.value;
          updateEditorDirtyFromForm();
        });
        trackStopInput(tierInput, stop, 'tier');
        topRow.appendChild(tierInput);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn btn--ghost';
        removeBtn.title = 'Remove stop';
        removeBtn.textContent = '✗';
        removeBtn.style.cssText = 'flex:0 0 auto;padding:0.15rem 0.4rem;';
        removeBtn.addEventListener('click', function(){
          if (stop.status && stop.status !== 'Pending') {
            const ok = window.confirm('This stop is already ' + stop.status + '. Removing it will break its public tracking link and unlink its POD photo. Continue?');
            if (!ok) return;
          }
          splitSelection.delete(stop);
          editorState.stopsModel.splice(idx, 1);
          renderStopsList();
          updateEditorDirtyFromForm();
          updateMapsRouteLink();
          autoCalcStopsFee();
        });
        topRow.appendChild(removeBtn);
      }

      // Tick pending drops to move them to a new order (another rider/time).
      if (!isFirst && (!stop.status || stop.status === 'Pending')) {
        const splitLab = document.createElement('label');
        splitLab.className = 'stop-split-pick';
        splitLab.title = 'Tick stops to move them to a new order for another rider or time';
        const splitBox = document.createElement('input');
        splitBox.type = 'checkbox';
        splitBox.checked = splitSelection.has(stop);
        splitBox.addEventListener('change', function(){
          if (splitBox.checked) splitSelection.add(stop);
          else splitSelection.delete(stop);
          renderSplitBar();
        });
        splitLab.appendChild(splitBox);
        splitLab.appendChild(document.createTextNode('Split'));
        topRow.appendChild(splitLab);
      }

      row.appendChild(topRow);

      // Internal note: rider and dispatch only, never on tracking.
      const internalNote = document.createElement('input');
      internalNote.type = 'text';
      internalNote.className = 'stop-internal-note';
      internalNote.placeholder = '🔒 Internal note — rider & dispatch only (never on tracking)';
      internalNote.value = stop.notes || '';
      internalNote.addEventListener('input', function(){
        stop.notes = internalNote.value;
        updateEditorDirtyFromForm();
      });
      trackStopInput(internalNote, stop, 'notes');
      row.appendChild(internalNote);

      row.appendChild(buildStopRecipientControls(stop, isFirst));

      const metaRow = document.createElement('div');
      metaRow.style.cssText = 'display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin-top:0.3rem;font-size:0.72rem;';

      const badge = document.createElement('span');
      badge.innerHTML = stopStatusBadgeHtml(stop.status, isFirst);
      metaRow.appendChild(badge);

      if (stop.status === 'Failed' && stop.failureReason) {
        const reasonEl = document.createElement('span');
        reasonEl.style.color = '#b00020';
        reasonEl.textContent = stop.failureReason;
        metaRow.appendChild(reasonEl);
      }


      if (stop.podUrl) {
        const podLink = document.createElement('a');
        podLink.href = stop.podUrl;
        podLink.target = '_blank';
        podLink.rel = 'noopener';
        podLink.textContent = '📷 POD';
        metaRow.appendChild(podLink);
      }

      if (stop.id && editorState.sourceEventId) {
        const podInput = document.createElement('input');
        podInput.type = 'file';
        podInput.accept = 'image/*';
        podInput.style.display = 'none';

        const podBtn = document.createElement('button');
        podBtn.type = 'button';
        podBtn.className = 'btn btn--ghost';
        podBtn.style.cssText = 'padding:0.1rem 0.4rem;font-size:0.7rem;';
        podBtn.textContent = stop.podUrl ? '📷 Replace POD' : '📷 Upload POD';
        podBtn.addEventListener('click', function(){ podInput.click(); });

        podInput.addEventListener('change', function(){
          const file = podInput.files && podInput.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async function(){
            podBtn.disabled = true;
            podBtn.textContent = 'Uploading...';
            try {
              const res = await postAdmin({
                action: 'adminUpdateStop',
                eventId: editorState.sourceEventId,
                stopId: stop.id,
                podData: String(reader.result || ''),
                podFileName: file.name,
                podContentType: file.type,
                operator: currentOperator()
              });
              if (res && res.stop) {
                Object.assign(editorState.stopsModel[idx], res.stop);
              }
              if (res && res.order) {
                editorState.order = res.order;
              }
              renderStopsList();
              setEditorFeedback('✓ POD uploaded.');
            } catch (err) {
              setEditorFeedback('POD upload failed: ' + ((err && err.message) || err), true);
              podBtn.disabled = false;
              podBtn.textContent = stop.podUrl ? '📷 Replace POD' : '📷 Upload POD';
            } finally {
              podInput.value = '';
            }
          };
          reader.readAsDataURL(file);
        });

        metaRow.appendChild(podBtn);
        metaRow.appendChild(podInput);
      }

      if (stop.id && stop.trackingToken && editorState.order) {
        const trackBtn = document.createElement('button');
        trackBtn.type = 'button';
        trackBtn.className = 'btn btn--ghost';
        trackBtn.style.cssText = 'padding:0.1rem 0.35rem;font-size:0.68rem;';
        trackBtn.textContent = '🔗 Copy tracking link';
        trackBtn.addEventListener('click', function(){
          const url = buildStopTrackingLink(stop);
          if (!url) return;
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url);
          trackBtn.textContent = '✓ Copied';
          setTimeout(function(){ trackBtn.textContent = '🔗 Copy tracking link'; }, 1500);
        });
        metaRow.appendChild(trackBtn);
      }

      if ((!stop.status || stop.status === 'Pending') && stop.id && editorState.sourceEventId) {
        const deliveredBtn = document.createElement('button');
        deliveredBtn.type = 'button';
        deliveredBtn.className = 'btn btn--ghost';
        deliveredBtn.style.cssText = 'padding:0.1rem 0.4rem;font-size:0.7rem;';
        deliveredBtn.textContent = isFirst ? '✓ Picked up' : '✓ Delivered';
        deliveredBtn.addEventListener('click', function(){ completeStopFromDispatcher(stop, idx, 'Delivered'); });

        const failedBtn = document.createElement('button');
        failedBtn.type = 'button';
        failedBtn.className = 'btn btn--ghost';
        failedBtn.style.cssText = 'padding:0.1rem 0.4rem;font-size:0.7rem;';
        failedBtn.textContent = '✗ Failed';
        failedBtn.addEventListener('click', function(){ completeStopFromDispatcher(stop, idx, 'Failed'); });

        metaRow.appendChild(deliveredBtn);
        metaRow.appendChild(failedBtn);
      } else if ((!stop.status || stop.status === 'Pending') && !stop.id) {
        const hint = document.createElement('span');
        hint.style.color = 'var(--dispatch-muted)';
        hint.textContent = '(save order to enable Delivered/Failed)';
        metaRow.appendChild(hint);
      }

      row.appendChild(metaRow);
      editStopsList.appendChild(row);
    });
    renderSplitBar();
    ensureEditorMapPanel();
    refreshChangedHighlights();
  }

  // Under each drop: the recipient's contact details (internal — rider and
  // dispatch only, never on tracking) and the customer note, which shows on
  // that stop's tracking and can be sent now, optionally also by WhatsApp
  // and/or email to the recipient.
  // Contact, access details and customer note for a stop — on the pickup the
  // contact is whoever hands the parcel over.
  function buildStopRecipientControls(stop, isPickup) {
    const wrap = document.createElement('div');

    const noteRow = document.createElement('div');
    noteRow.style.cssText = 'display:flex;gap:0.35rem;align-items:center;flex-wrap:wrap;margin-top:0.3rem;font-size:0.72rem;';
    const custNote = document.createElement('input');
    custNote.type = 'text';
    custNote.placeholder = 'Note for customer (shown on their tracking)';
    custNote.value = stop.customerNote || '';
    custNote.style.cssText = 'flex:1 1 220px;min-width:0;font-size:0.78rem;';
    custNote.addEventListener('input', function(){
      stop.customerNote = custNote.value;
      updateEditorDirtyFromForm();
    });
    trackStopInput(custNote, stop, 'customerNote');
    function channelBox(label) {
      const lab = document.createElement('label');
      lab.style.cssText = 'display:inline-flex;align-items:center;gap:0.2rem;white-space:nowrap;cursor:pointer;';
      const box = document.createElement('input');
      box.type = 'checkbox';
      lab.appendChild(box);
      lab.appendChild(document.createTextNode(label));
      return { label: lab, box: box };
    }
    const wa = channelBox('WhatsApp');
    const em = channelBox('Email');
    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'btn btn--ghost';
    sendBtn.style.cssText = 'padding:0.1rem 0.45rem;font-size:0.72rem;';
    sendBtn.textContent = '📣 Send note now';
    // Sending writes to the saved order, so it needs a saved stop on an order
    // being edited (not a duplicate, whose stops still point at the original).
    const canSend = editorState.mode === 'edit' && !!editorState.sourceEventId && !!stop.id;
    function refreshChannels() {
      wa.box.disabled = !normalizeText(stop.recipientPhone);
      em.box.disabled = !normalizeText(stop.recipientEmail);
      if (wa.box.disabled) wa.box.checked = false;
      if (em.box.disabled) em.box.checked = false;
      wa.label.title = wa.box.disabled ? 'Add a phone number to send by WhatsApp' : '';
      em.label.title = em.box.disabled ? 'Add an email to send by email' : '';
    }
    sendBtn.disabled = !canSend;
    sendBtn.title = canSend ? 'Shows the note on this stop\'s tracking now' : 'Save the order first';
    sendBtn.addEventListener('click', function(){
      sendStopNoteFromEditor(stop, { whatsapp: wa.box.checked, email: em.box.checked }, sendBtn);
    });
    noteRow.appendChild(custNote);
    noteRow.appendChild(wa.label);
    noteRow.appendChild(em.label);
    noteRow.appendChild(sendBtn);

    const contactRow = document.createElement('div');
    contactRow.style.cssText = 'display:flex;gap:0.3rem;flex-wrap:wrap;margin-top:0.3rem;';
    [['recipientName', isPickup ? 'Contact at pickup' : 'Recipient name', 'text', '1 1 120px'],
     ['recipientPhone', 'Phone', 'tel', '1 1 100px'],
     ['recipientEmail', 'Email', 'email', '1 1 140px'],
     ['addressDetails', 'Floor, door, buzzer…', 'text', '1 1 100%']].forEach(function(spec){
      const input = document.createElement('input');
      input.type = spec[2];
      input.placeholder = spec[1];
      input.value = stop[spec[0]] || '';
      input.style.cssText = 'flex:' + spec[3] + ';min-width:0;font-size:0.75rem;';
      input.addEventListener('input', function(){
        stop[spec[0]] = input.value;
        updateEditorDirtyFromForm();
        refreshChannels();
      });
      trackStopInput(input, stop, spec[0]);
      contactRow.appendChild(input);
    });

    refreshChannels();
    wrap.appendChild(contactRow);
    wrap.appendChild(noteRow);
    return wrap;
  }

  // WhatsApp/email digits for wa.me: Spanish numbers are often typed without +34.
  function stopWhatsAppPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.indexOf('00') === 0) digits = digits.slice(2);
    if (digits.length === 9 && /^[6789]/.test(digits)) digits = '34' + digits;
    return digits;
  }

  // Same message the backend emails (buildStopNoteText in Code.gs).
  function stopNoteMessage(stop, note, reference) {
    const lines = [stop.recipientName ? ('Hola ' + normalizeText(stop.recipientName) + ',') : 'Hola,', '', note];
    if (reference && stop.id && stop.trackingToken) {
      lines.push('', 'Tracking: https://cargoworks.es/tracking.html?ref=' + encodeURIComponent(reference) +
        '&stop=' + encodeURIComponent(stop.id) + '&t=' + encodeURIComponent(stop.trackingToken));
    }
    lines.push('', 'Cargoworks');
    return lines.join('\n');
  }

  async function sendStopNoteFromEditor(stop, channels, btn) {
    const note = normalizeText(stop.customerNote);
    if (!note) {
      setEditorFeedback('Write the customer note first.', true);
      return;
    }
    // Open WhatsApp right away, while the click still counts as the user's —
    // browsers block windows opened after waiting on the server.
    const phone = stopWhatsAppPhone(stop.recipientPhone);
    if (channels.whatsapp && phone) {
      const reference = normalizeText(editorState.order && editorState.order.reference);
      try { window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(stopNoteMessage(stop, note, reference)), '_blank'); } catch(_) {}
    }
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      const res = await postAdmin({
        action: 'sendStopNote',
        eventId: editorState.sourceEventId,
        stopId: stop.id,
        customerNote: note,
        recipientName: normalizeText(stop.recipientName),
        recipientPhone: normalizeText(stop.recipientPhone),
        recipientEmail: normalizeText(stop.recipientEmail),
        channels: channels,
        operator: currentOperator()
      });
      if (res && res.stop) stop._customerNoteOriginal = res.stop.customerNote || '';
      if (res && res.order) editorState.order = res.order;
      const sent = (res && res.sent) || {};
      const via = ['tracking'].concat(sent.email ? ['email'] : [], channels.whatsapp && phone ? ['WhatsApp'] : []);
      const problems = sent.errors || [];
      setEditorFeedback('✓ Note sent (' + via.join(' + ') + ')' + (problems.length ? ' — ' + problems.join('; ') : ''), problems.length > 0);
    } catch (err) {
      setEditorFeedback('Send failed: ' + ((err && err.message) || err), true);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  async function completeStopFromDispatcher(stop, idx, status) {
    if (!editorState.sourceEventId || !stop.id) {
      setEditorFeedback('Save the order first before marking stops.', true);
      return;
    }
    let reason = '';
    if (status === 'Failed') {
      reason = window.prompt(idx === 0 ? 'Reason the pickup failed:' : 'Reason the stop failed:') || '';
      if (!reason.trim()) return;
    }
    try {
      const res = await postAdmin({
        action: 'adminUpdateStop',
        eventId: editorState.sourceEventId,
        stopId: stop.id,
        status: status,
        reason: reason,
        operator: currentOperator()
      });
      if (res && res.stop) {
        Object.assign(editorState.stopsModel[idx], res.stop);
      }
      if (res && res.order) {
        editorState.order = res.order;
        if (editStatus) editStatus.value = res.order.status || editStatus.value;
      }
      renderStopsList();
      setEditorFeedback('✓ Stop updated.');
    } catch (err) {
      setEditorFeedback('Stop update failed: ' + ((err && err.message) || err), true);
    }
  }

  // ── Stop Quick-add ───────────────────────────────────────────────────────

  function stopCameraStream() {
    if (_cameraStream) {
      try { _cameraStream.getTracks().forEach(function(t){ t.stop(); }); } catch(_) {}
      _cameraStream = null;
    }
    if (stopsQCameraVideo) stopsQCameraVideo.srcObject = null;
    if (stopsQCameraOverlay) stopsQCameraOverlay.style.display = 'none';
  }

  function setupStopsQuickAdd() {
    if (!stopsQuickAddToggle || !stopsQuickPanel) return;

    // ── Panel toggle ──
    stopsQuickAddToggle.addEventListener('click', function() {
      const open = stopsQuickPanel.style.display === 'none' || !stopsQuickPanel.style.display;
      stopsQuickPanel.style.display = open ? '' : 'none';
      stopsQuickAddToggle.textContent = open ? '⚡ Close' : '⚡ Quick add';
    });

    // ── 📷 Camera — getUserMedia, no OS handoff ──
    if (stopsQCamera) stopsQCamera.addEventListener('click', function() {
      openCameraOverlay();
    });

    // ── 🖼 File — gallery / file picker only ──
    if (stopsQFile) stopsQFile.addEventListener('click', function() {
      if (stopsQFileInput) stopsQFileInput.click();
    });
    if (stopsQFileInput) stopsQFileInput.addEventListener('change', function() {
      const file = stopsQFileInput.files && stopsQFileInput.files[0];
      if (file) extractAddressFromFile(file);
      stopsQFileInput.value = ''; // reset so same file can be picked again
    });

    // ── ✎ Type ──
    if (stopsQType) stopsQType.addEventListener('click', function() {
      if (stopsQTypeWrap) stopsQTypeWrap.style.display = stopsQTypeWrap.style.display === 'none' ? '' : 'none';
      if (stopsQConfirmWrap) stopsQConfirmWrap.style.display = 'none';
      if (stopsQTypeInput) { stopsQTypeInput.value = ''; stopsQTypeInput.focus(); }
    });
    if (stopsQTypeInput) stopsQTypeInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); commitStopFromType(); }
    });
    if (stopsQTypeAddBtn) stopsQTypeAddBtn.addEventListener('click', commitStopFromType);

    // ── Confirm / Discard ──
    if (stopsQConfirmBtn) stopsQConfirmBtn.addEventListener('click', function() {
      const addr = stopsQConfirmInput ? stopsQConfirmInput.value.trim() : '';
      if (!addr) return;
      addStopToModel(addr);
      if (stopsQConfirmWrap) stopsQConfirmWrap.style.display = 'none';
      setStopsQStatus('✓ Stop added. Tap Camera for next stop.');
    });
    if (stopsQDiscardBtn) stopsQDiscardBtn.addEventListener('click', function() {
      if (stopsQConfirmWrap) stopsQConfirmWrap.style.display = 'none';
      setStopsQStatus('');
    });

    // ── Camera overlay controls ──
    if (stopsQCameraCapture) stopsQCameraCapture.addEventListener('click', captureFromCamera);
    if (stopsQCameraCancel)  stopsQCameraCancel.addEventListener('click',  stopCameraStream);
  }

  function setStopsQStatus(msg, isError) {
    if (!stopsQStatus) return;
    stopsQStatus.textContent = msg || '';
    stopsQStatus.className = 'dispatcher-status' + (isError ? ' is-error' : '');
  }

  async function openCameraOverlay() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStopsQStatus('Camera API not available in this browser.', true);
      return;
    }
    if (!stopsQCameraOverlay || !stopsQCameraVideo) return;

    // Stop any previous stream first
    stopCameraStream();
    if (stopsQCameraMsg) { stopsQCameraMsg.textContent = 'Starting camera…'; stopsQCameraMsg.style.display = 'block'; }
    if (stopsQCameraCapture) stopsQCameraCapture.disabled = true;

    stopsQCameraOverlay.style.display = 'flex';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      _cameraStream = stream;
      stopsQCameraVideo.srcObject = stream;
      await stopsQCameraVideo.play();
      if (stopsQCameraMsg) stopsQCameraMsg.style.display = 'none';
      if (stopsQCameraCapture) stopsQCameraCapture.disabled = false;
    } catch(err) {
      stopCameraStream();
      setStopsQStatus('Camera error: ' + (err.message || String(err)), true);
    }
  }

  function captureFromCamera() {
    if (!stopsQCameraVideo || !stopsQCameraCanvas) return;
    const video = stopsQCameraVideo;
    const canvas = stopsQCameraCanvas;
    const w = video.videoWidth  || 1280;
    const h = video.videoHeight || 720;
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const b64 = dataUrl.split(',')[1];

    // Stop stream before showing confirm so camera LED goes off
    stopCameraStream();

    extractAddressFromB64(b64, 'image/jpeg');
  }

  async function extractAddressFromFile(file) {
    const reader = new FileReader();
    reader.onload = function(ev) {
      const b64 = ev.target.result.split(',')[1];
      extractAddressFromB64(b64, file.type || 'image/jpeg');
    };
    reader.readAsDataURL(file);
  }

  // Server-side vision extraction — the same handleVisionExtract endpoint the
  // rider's route-sheet scanner already uses, now callable with the admin
  // token instead of a rider id. Returns a validated, deduped, tiered list of
  // ALL addresses found in one shot, so (unlike the old direct-to-Anthropic,
  // one-address-at-a-time version this replaced) there's no per-address
  // confirm step — every extracted stop is added straight to the list.
  async function extractAddressFromB64(b64, mime) {
    setStopsQStatus('Extracting addresses…');
    if (stopsQConfirmWrap) stopsQConfirmWrap.style.display = 'none';
    if (stopsQTypeWrap)    stopsQTypeWrap.style.display    = 'none';

    try {
      const res = await postAdmin({ action: 'visionExtract', image: b64, mimeType: mime });
      if (!res.stops || !res.stops.length) {
        setStopsQStatus('No addresses found — try again or use ✎ Type.', true);
        return;
      }
      res.stops.forEach(function(s){ addStopToModel(s.address, s.tier || ''); });
      setStopsQStatus('✓ ' + res.stops.length + ' stop(s) extracted and added.');
    } catch(err) {
      setStopsQStatus('Request failed: ' + ((err && err.message) || err), true);
    }
  }

  function commitStopFromType() {
    const addr = stopsQTypeInput ? stopsQTypeInput.value.trim() : '';
    if (!addr) return;
    addStopToModel(addr);
    if (stopsQTypeInput) stopsQTypeInput.value = '';
    if (stopsQTypeWrap) stopsQTypeWrap.style.display = 'none';
    if (stopsQStatus) { stopsQStatus.textContent = '✓ Stop added.'; stopsQStatus.className = 'dispatcher-status'; }
  }

  // Appends a new blank-state stop to the structured stops model (used by the
  // Quick-add camera/file/type flows and manual "+ Add stop"). id/podUrl/
  // trackingToken/completedAt/failureReason are always left blank here — the
  // server assigns a real id + tracking token the first time this order is
  // saved (normalizeStopsForOrder); status defaults to Pending.
  function blankStopEntry(address, tier) {
    return {
      id: '', address: address || '', tier: tier || '', priority: false, outlier: false,
      status: 'Pending', podUrl: '', podAt: '', notes: '', customerNote: '', trackingToken: '', completedAt: '', failureReason: '',
      recipientName: '', recipientPhone: '', recipientEmail: '', addressDetails: ''
    };
  }

  // Inserts before the last entry — dropoff always occupies the last slot in
  // editorState.stopsModel, so a plain push() would file new intermediate
  // stops AFTER dropoff instead of between pickup and dropoff.
  function addStopToModel(address, tier) {
    const entry = blankStopEntry(address, tier);
    const insertAt = editorState.stopsModel.length ? editorState.stopsModel.length - 1 : 0;
    editorState.stopsModel.splice(insertAt, 0, entry);
    renderStopsList();
    updateEditorDirtyFromForm();
    updateMapsRouteLink();
    autoCalcStopsFee();
  }

  // "+ Add stop": a new row at the END of the route, after the stop just
  // filled in (that one moves into the middle and the new row becomes the
  // last stop) — inserting before the last row pushed the stop being typed
  // down and put a blank row in its place. If the last row is still empty,
  // that's the row to fill, so no second blank row.
  function addStopAtEnd() {
    const model = editorState.stopsModel;
    const last = model[model.length - 1];
    if (model.length < 2 || (last && normalizeText(last.address))) {
      model.push(blankStopEntry(''));
      renderStopsList();
      updateEditorDirtyFromForm();
      updateMapsRouteLink();
      autoCalcStopsFee();
    }
    const rows = editStopsList ? editStopsList.querySelectorAll('.stop-row') : [];
    const input = rows.length ? rows[rows.length - 1].querySelector('input[type="text"]') : null;
    if (input) {
      input.focus();
      if (input.scrollIntoView) input.scrollIntoView({ block: 'nearest' });
    }
  }

  // ── Pickup — My Location ─────────────────────────────────────────────────

  // btn/addrInput are the dynamically-rendered pickup row's controls (row 0
  // in renderStopsList) — there's no static pickup input anymore.
  function handlePickupMyLocation(btn, addrInput) {
    if (!navigator.geolocation) {
      setEditorFeedback('Geolocation not supported by this browser.', true);
      return;
    }
    function setAddress(value, lat, lng) {
      editorState.stopsModel[0].address = value;
      if (addrInput) addrInput.value = value;
      setStopLocation(editorState.stopsModel[0], addrInput, (lat != null && lng != null) ? { lat: lat, lng: lng } : null);
    }
    if (btn) { btn.disabled = true; btn.textContent = '📍 Locating…'; }
    navigator.geolocation.getCurrentPosition(
      async function(pos) {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const mapsKey = window.CARGOWORKS_MAPS_KEY || '';
        if (!mapsKey) {
          setAddress(lat.toFixed(6) + ',' + lng.toFixed(6), lat, lng);
          if (btn) { btn.disabled = false; btn.textContent = '📍 My location'; }
          updateMapsRouteLink();
          return;
        }
        try {
          const url = 'https://maps.googleapis.com/maps/api/geocode/json?latlng=' + lat + ',' + lng + '&key=' + encodeURIComponent(mapsKey);
          const res = await fetch(url);
          const data = await res.json();
          let address = '';
          if (data && data.results && data.results[0]) {
            address = data.results[0].formatted_address || '';
          }
          setAddress(address || (lat.toFixed(6) + ',' + lng.toFixed(6)), lat, lng);
          updateEditorDirtyFromForm();
          updateMapsRouteLink();
        } catch(err) {
          setAddress(lat.toFixed(6) + ',' + lng.toFixed(6), lat, lng);
          updateMapsRouteLink();
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = '📍 My location'; }
        }
      },
      function(err) {
        setEditorFeedback('Location error: ' + (err.message || 'denied.'), true);
        if (btn) { btn.disabled = false; btn.textContent = '📍 My location'; }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  // ── Auto-calculate stops fee ─────────────────────────────────────────────
  // Mirrors map.js logic: addressFeeCount = stops + 1 (dropoff), fee = €1.25 × count if count >= 3

  function autoCalcStopsFee() {
    if (!editPriceStops) return;
    if (editPriceOverride && editPriceOverride.checked) return; // manual override — leave it alone
    // stopsModel[0]/[last] are pickup/dropoff, not intermediate stops — slice
    // them off before counting (dropoff is still added back via the +1 below,
    // same as before pickup/dropoff joined this array).
    const stopCount = editorState.stopsModel.slice(1, -1).filter(function(s){ return normalizeText(s.address); }).length;
    const addressFeeCount = stopCount + 1; // stops + dropoff
    const addressFeePer = addressFeeCount >= 3 ? 1.25 : 0;
    const addressFee = Math.round(addressFeePer * addressFeeCount * 100) / 100;
    editPriceStops.value = addressFee.toFixed(2);
    recalculatePriceTotal();
  }

  // ── Maps route link ──────────────────────────────────────────────────────

  function updateMapsRouteLink() {
    if (!editMapsRouteLink) return;
    const parts = editorState.stopsModel.map(function(s){ return normalizeText(s.address); }).filter(Boolean);
    if (parts.length < 2) {
      editMapsRouteLink.style.display = 'none';
      return;
    }
    const encoded = parts.map(function(p){ return encodeURIComponent(p); }).join('/');
    editMapsRouteLink.href = 'https://www.google.com/maps/dir/' + encoded;
    editMapsRouteLink.style.display = 'inline';
  }

  // ── Account order verification ───────────────────────────────────────────
  // Lets dispatcher tag a manually-entered order with a customer account token
  // (phone/WhatsApp orders for account clients), reusing the same public
  // validateAccountToken endpoint the booking site uses. A verified token
  // shows the account name, reveals the account-specific fields, and marks
  // the order Payment status = Account (no Stripe link needed).

  function resetAccountStatus() {
    if (editAccountStatus) {
      editAccountStatus.textContent = '';
      editAccountStatus.style.display = 'none';
      editAccountStatus.classList.remove('is-error');
    }
    if (editAccountFieldsWrap) editAccountFieldsWrap.style.display = 'none';
  }

  function setAccountStatus(msg, isError) {
    if (!editAccountStatus) return;
    editAccountStatus.textContent = msg || '';
    editAccountStatus.classList.toggle('is-error', !!isError);
    editAccountStatus.style.display = msg ? 'block' : 'none';
  }

  async function verifyAccountToken(silent) {
    const token = normalizeText(editAccountToken && editAccountToken.value).toUpperCase();
    if (!token) {
      resetAccountStatus();
      return;
    }
    if (!silent) setAccountStatus('Verifying…', false);
    try {
      const res = await fetch(API_BASE + '?action=validateAccountToken&token=' + encodeURIComponent(token));
      const json = await res.json();
      if (!json || !json.valid) {
        setAccountStatus('Invalid or inactive account token.', true);
        if (editAccountFieldsWrap) editAccountFieldsWrap.style.display = 'none';
        return;
      }
      setAccountStatus('✓ ' + (json.accountName || 'Account') + ' — order will appear in their account panel, no payment link needed.', false);
      if (editAccountFieldsWrap) editAccountFieldsWrap.style.display = '';
      if (editPaymentStatus) editPaymentStatus.value = 'Account';
      // Accounts billed per stop (e.g. TREVOL) switch the order to per-stop
      // billing at the account's rate when the token is entered.
      const pricePerStop = safeNumber(json.pricePerStop, 0);
      if (!silent && pricePerStop > 0 && editBillingMode && editBillingMode.value !== 'per_stop') {
        editBillingMode.value = 'per_stop';
        if (editStopRate && !safeNumber(editStopRate.value, 0)) editStopRate.value = String(pricePerStop);
        applyBillingModeVisibility();
        recalculatePriceTotal();
      }
      updateEditorDirtyFromForm();
    } catch (err) {
      setAccountStatus('Could not verify token: ' + ((err && err.message) || 'network error'), true);
    }
  }

  // ── Pricing manual override ──────────────────────────────────────────────

  // A total that includes 21% VAT, split so subtotal + VAT add up to it exactly.
  function vatSplit(total) {
    const t = Math.round(safeNumber(total, 0) * 100) / 100;
    const subtotal = Math.round((t / 1.21) * 100) / 100;
    return { subtotal: subtotal, vat: Math.round((t - subtotal) * 100) / 100, total: t };
  }

  // Manual price on a normally priced order (per-stop and elapsed work their
  // own totals out).
  function isManualFlatPrice() {
    return !!(editPriceOverride && editPriceOverride.checked) && (!editBillingMode || editBillingMode.value === 'flat');
  }

  function renderVatSplit() {
    if (!editPriceVatSplit) return;
    if (!isManualFlatPrice()) { editPriceVatSplit.style.display = 'none'; editPriceVatSplit.textContent = ''; return; }
    const split = vatSplit(editPriceTotal && editPriceTotal.value);
    editPriceVatSplit.textContent = 'Subtotal (ex. VAT) EUR ' + split.subtotal.toFixed(2) + ' + VAT 21% EUR ' + split.vat.toFixed(2) + ' = EUR ' + split.total.toFixed(2);
    editPriceVatSplit.style.display = '';
  }

  function applyPriceOverride() {
    if (!editPriceOverride) return;
    const manual = editPriceOverride.checked;
    const elapsed = !!(editBillingMode && (editBillingMode.value === 'elapsed' || editBillingMode.value === 'per_stop'));
    if (editPriceBreakdownFields) editPriceBreakdownFields.style.display = (manual || elapsed) ? 'none' : '';
    if (editPriceManualHint) editPriceManualHint.style.display = manual ? 'inline' : 'none';
    if (editGetSystemPricing) editGetSystemPricing.style.display = (manual || elapsed) ? 'none' : '';
    if (manual && systemPricingStatus) { systemPricingStatus.style.display = 'none'; systemPricingStatus.textContent = ''; }
    renderVatSplit();
  }

  function resetPriceOverride() {
    if (editPriceOverride) editPriceOverride.checked = false;
    if (editElapsedOverride) editElapsedOverride.checked = false;
    if (systemPricingStatus) { systemPricingStatus.style.display = 'none'; systemPricingStatus.textContent = ''; }
    applyPriceOverride();
    applyElapsedOverride();
  }

  // ── Create payment link ──────────────────────────────────────────────────

  async function handleCreatePaymentLink() {
    if (!editorState.open) return;
    const eventId = normalizeText(editorState.sourceEventId);

    function setPayStatus(msg, isError) {
      if (!editCreatePaymentStatus) return;
      editCreatePaymentStatus.textContent = msg || '';
      editCreatePaymentStatus.className = 'dispatcher-status' + (isError ? ' is-error' : '');
      editCreatePaymentStatus.style.display = msg ? 'block' : 'none';
    }

    setPayStatus('Creating payment link…');
    if (editCreatePaymentBtn) editCreatePaymentBtn.disabled = true;

    try {
      const res = await postAdmin({
        action: 'adminCreatePayment',
        eventId: eventId || '',
        order: {
          customer: {
            name: normalizeText(editCustomerName && editCustomerName.value),
            email: normalizeText(editCustomerEmail && editCustomerEmail.value)
          },
          quote: {
            total: safeNumber(editPriceTotal && editPriceTotal.value, 0),
            route: { stops: editorState.stopsModel.filter(function(s){ return normalizeText(s.address); }).map(function(s){ return { address: normalizeText(s.address) }; }) },
            schedule: {
              date: normalizeText(editScheduleDate && editScheduleDate.value),
              time: normalizeText(editScheduleTime && editScheduleTime.value)
            }
          }
        },
        reference: normalizeText(editorState.order && editorState.order.reference)
      });

      const url = (res && res.paymentUrl) ? normalizeText(res.paymentUrl) : '';
      if (!url) throw new Error('No payment URL returned.');
      if (editPaymentUrl) editPaymentUrl.value = url;
      updateEditorDirtyFromForm();
      setPayStatus('✓ Payment link created.');
    } catch (err) {
      setPayStatus(err && err.message ? err.message : 'Failed to create link.', true);
    } finally {
      if (editCreatePaymentBtn) editCreatePaymentBtn.disabled = false;
    }
  }

  // ── System pricing engine ────────────────────────────────────────────────
  // Mirrors map.js runEstimate exactly. Uses haversine × 1.25 for route
  // distance (same as map.js's own Directions API fallback). Zone detection
  // uses the same ray-casting algorithm and geojson as the booking UI.

  var _spCache = { prices: null, zones: null, holidays: null };

  async function _spLoadData() {
    const [prices, zones, holidays, discounts] = await Promise.all([
      _spCache.prices  || fetch('/data/prices.json').then(function(r){ return r.json(); }).then(function(d){ _spCache.prices = d; return d; }),
      _spCache.zones   || fetch('/data/zones.geojson').then(function(r){ return r.json(); }).then(function(d){ _spCache.zones = d; return d; }),
      _spCache.holidays|| fetch('/data/holidays.json').then(function(r){ return r.text(); }).then(function(t){
        const dates = new Set((String(t||'').match(/\d{4}-\d{2}-\d{2}/g) || []));
        _spCache.holidays = dates; return dates;
      }),
      _spCache.discounts || fetch('/data/discounts.json').then(function(r){ return r.json(); }).then(function(d){ _spCache.discounts = d; return d; }).catch(function(){ return { codes: [] }; })
    ]);
    return { prices, zones, holidays, discounts };
  }

  // Plain-object haversine (no google.maps dependency)
  function _spHaversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const s1 = Math.sin(dLat/2), s2 = Math.sin(dLng/2);
    const a = s1*s1 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * s2*s2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  // Ray-casting point-in-polygon using plain {lat, lng} ring arrays
  function _spPointInRing(lat, lng, ring) {
    let inside = false;
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = ring[i][0], yi = ring[i][1]; // [lng, lat] GeoJSON order
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > lat) !== (yj > lat)) &&
        (lng < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Shoelace area on GeoJSON [lng,lat] ring — just for zone comparison, not real m²
  function _spRingArea(ring) {
    let area = 0;
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      area += ring[i][0] * ring[j][1];
      area -= ring[j][0] * ring[i][1];
    }
    return Math.abs(area / 2);
  }

  // Parse geojson into [{name, outerRing, holes, area}]
  function _spParseZones(geojson) {
    const features = [];
    (geojson.features || []).forEach(function(f) {
      const name = f.properties && f.properties.name;
      const m = String(name||'').match(/(\d+)/);
      const num = m ? m[1] : '';
      const geom = f.geometry;
      if (!geom || !num) return;
      function addPolygon(coords) {
        if (!coords || !coords[0] || !coords[0].length) return;
        const outerRing = coords[0];
        const holes = coords.slice(1);
        const area = _spRingArea(outerRing);
        features.push({ num: num, outerRing: outerRing, holes: holes, area: area });
      }
      if (geom.type === 'Polygon') {
        addPolygon(geom.coordinates);
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach(addPolygon);
      }
    });
    return features;
  }

  // Find innermost zone number for a lat/lng point (mirrors map.js findZoneForLatLng)
  function _spFindZone(lat, lng, parsedZones) {
    let best = null, bestArea = Infinity;
    parsedZones.forEach(function(f) {
      if (!_spPointInRing(lat, lng, f.outerRing)) return;
      // Check not in any hole
      for (let k = 0; k < f.holes.length; k++) {
        if (_spPointInRing(lat, lng, f.holes[k])) return;
      }
      if (f.area < bestArea) { bestArea = f.area; best = f.num; }
    });
    return best || '';
  }

  // Geocode via Apps Script proxy — no CORS, handles both place names and addresses.
  // Returns { lat, lng, label } or null (zero results), throws on API/network errors.
  async function _spGeocode(address) {
    const res = await postAdmin({ action: 'adminGeocode', query: address });
    // postAdmin throws on non-ok or json.error, so if we're here it succeeded
    if (res && res.result) return res.result;
    return null; // ZERO_RESULTS
  }

  // ── Route maps + optimize ─────────────────────────────────────────────────
  // A small Leaflet map of an order's stops (under the stops on its card and
  // in the editor) and a nearest-neighbour + 2-opt optimizer. Distances are
  // straight-line, not actual bike routes.
  const GEO_CACHE_KEY = 'cwGeoCache';
  let geoCache = null;
  const openCardMaps = new Set();
  let editorMapPanel = null;
  let editorMapTimer = null;

  function geoCacheStore(){
    if (!geoCache) {
      try { geoCache = JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || '{}') || {}; } catch(_) { geoCache = {}; }
    }
    return geoCache;
  }

  // Each address is looked up once per browser, then served from the cache.
  async function geocodeCached(address){
    const key = normalizeText(address).toLowerCase().replace(/\s+/g, ' ');
    if (!key) return null;
    const cache = geoCacheStore();
    if (cache[key]) return cache[key];
    const res = await _spGeocode(address);
    const lat = Number(res && res.lat);
    const lng = Number(res && res.lng);
    if (!res || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    cache[key] = { lat: lat, lng: lng };
    try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache)); } catch(_) {}
    return cache[key];
  }

  // Coordinates for every stop (null where the address wasn't found), 4 lookups at a time.
  async function geocodeStops(stops){
    const out = stops.map(function(){ return null; });
    let next = 0;
    async function worker(){
      while (next < stops.length) {
        const i = next++;
        const st = stops[i];
        if (hasExactLocation(st)) { out[i] = { lat: Number(st.lat), lng: Number(st.lng) }; continue; }
        try { out[i] = await geocodeCached(st && st.address); } catch(_) { out[i] = null; }
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    return out;
  }

  // Straight-line km along the points in order, skipping ones with no coordinates.
  function routeKm(coords){
    let km = 0;
    let prev = null;
    coords.forEach(function(c){
      if (!c) return;
      if (prev) km += _spHaversine(prev.lat, prev.lng, c.lat, c.lng);
      prev = c;
    });
    return km;
  }

  // The order the stops should be visited in, as indexes into `stops`:
  // pickup first; completed stops next as they happened; pending priority
  // stops; then the other pending drops chained nearest-neighbour and tidied
  // with 2-opt; stops whose address wasn't found go last in their old order.
  function optimizeStopOrder(stops, coords){
    const all = stops.map(function(s, i){ return i; });
    const isDone = function(i){ return !!(stops[i].status && stops[i].status !== 'Pending'); };
    const drops = all.slice(1);
    const done = drops.filter(isDone);
    const pending = drops.filter(function(i){ return !isDone(i); });
    const priority = pending.filter(function(i){ return stops[i].priority; });
    const normal = pending.filter(function(i){ return !stops[i].priority && coords[i]; });
    const noCoords = pending.filter(function(i){ return !stops[i].priority && !coords[i]; });
    const dist = function(a, b){ return _spHaversine(coords[a].lat, coords[a].lng, coords[b].lat, coords[b].lng); };

    const anchors = [0].concat(done, priority).filter(function(i){ return coords[i]; });
    const anchor = anchors.length ? anchors[anchors.length - 1] : null;
    const remaining = normal.slice();
    const path = anchor === null ? [] : [anchor];
    let current = anchor;
    while (remaining.length) {
      let best = 0;
      if (current !== null) {
        let bestD = Infinity;
        remaining.forEach(function(i, k){ const d = dist(current, i); if (d < bestD) { bestD = d; best = k; } });
      }
      current = remaining.splice(best, 1)[0];
      path.push(current);
    }
    // 2-opt on the open path (first point fixed, last free).
    for (let pass = 0, improved = true; improved && pass < 50; pass++) {
      improved = false;
      for (let i = 1; i < path.length - 1; i++) {
        for (let k = i + 1; k < path.length; k++) {
          const a = path[i - 1], b = path[i], c = path[k], e = path[k + 1];
          const before = dist(a, b) + (e !== undefined ? dist(c, e) : 0);
          const after = dist(a, c) + (e !== undefined ? dist(b, e) : 0);
          if (after < before - 1e-9) {
            const seg = path.slice(i, k + 1).reverse();
            path.splice.apply(path, [i, seg.length].concat(seg));
            improved = true;
          }
        }
      }
    }
    const chained = anchor === null ? path : path.slice(1);
    let order = [0].concat(done, priority, chained, noCoords);
    const beforeKm = routeKm(all.map(function(i){ return coords[i]; }));
    let afterKm = routeKm(order.map(function(i){ return coords[i]; }));
    // Only suggest a new order if it's meaningfully shorter (>50 m).
    if (afterKm >= beforeKm - 0.05) { order = all; afterKm = beforeKm; }
    return {
      indexOrder: order,
      beforeKm: beforeKm,
      afterKm: afterKm,
      changed: order.some(function(v, k){ return v !== k; })
    };
  }

  // Google Maps (the free OpenStreetMap tile servers refuse business use
  // with a 403 under their tile policy).
  function drawStopsMap(el, stops, coords){
    el.textContent = 'Loading map…';
    window.cwLoadGoogleMaps().then(function(gm){
      if (!el.isConnected) return;
      el.textContent = '';
      const map = new gm.Map(el, {
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        clickableIcons: false, gestureHandling: 'cooperative'
      });
      const bounds = new gm.LatLngBounds();
      const path = [];
      stops.forEach(function(stop, idx){
        const c = coords[idx];
        if (!c) return;
        const done = !!(stop.status && stop.status !== 'Pending');
        new gm.Marker({
          map: map,
          position: c,
          title: (idx === 0 ? 'Pickup: ' : (idx + '. ')) + (stop.address || ''),
          label: { text: idx === 0 ? 'P' : String(idx), color: '#ffffff', fontSize: '11px', fontWeight: '700' },
          icon: { path: gm.SymbolPath.CIRCLE, scale: 11, fillColor: idx === 0 ? '#f07b39' : (done ? '#1c8a5a' : '#182335'), fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 }
        });
        bounds.extend(c);
        path.push(c);
      });
      if (path.length > 1) new gm.Polyline({ map: map, path: path, strokeColor: '#f07b39', strokeOpacity: 0.85, strokeWeight: 3 });
      if (path.length > 1) {
        map.fitBounds(bounds, 24);
        gm.event.addListenerOnce(map, 'idle', function(){ if (map.getZoom() > 16) map.setZoom(16); });
      } else {
        map.setCenter(path[0] || { lat: 41.3902, lng: 2.1542 });
        map.setZoom(path.length ? 15 : 13);
      }
    }).catch(function(err){
      el.textContent = 'Map unavailable: ' + ((err && err.message) || err);
    });
  }

  // "🗺 Map" toggle plus its panel. getStops() gives the stops to draw (read
  // on every refresh); opts.onOptimize adds "✨ Optimize route"; opts.onToggle
  // hears open/close.
  function buildStopsMapPanel(getStops, opts){
    const options = opts || {};
    const wrap = document.createElement('div');
    const row = document.createElement('div');
    row.className = 'stops-map-toggle-row';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn--ghost';
    toggle.textContent = '🗺 Map';
    row.appendChild(toggle);
    let optimizeBtn = null;
    if (options.onOptimize) {
      optimizeBtn = document.createElement('button');
      optimizeBtn.type = 'button';
      optimizeBtn.className = 'btn btn--ghost';
      optimizeBtn.textContent = '✨ Optimize route';
      optimizeBtn.title = options.optimizeTitle || 'Reorder the pending stops for a shorter route and open the order to check it';
      optimizeBtn.addEventListener('click', function(){ options.onOptimize(optimizeBtn); });
      row.appendChild(optimizeBtn);
    }
    const panel = document.createElement('div');
    panel.className = 'stops-map-panel';
    panel.style.display = 'none';
    const mapEl = document.createElement('div');
    mapEl.className = 'stops-map';
    const summary = document.createElement('div');
    summary.className = 'stops-map-summary';
    panel.appendChild(mapEl);
    panel.appendChild(summary);
    wrap.appendChild(row);
    wrap.appendChild(panel);

    let open = false;
    let drawSeq = 0;
    async function refresh(){
      if (!open) return;
      const seq = ++drawSeq;
      const stops = getStops().filter(function(s){ return normalizeText(s && s.address); });
      summary.textContent = 'Looking up addresses…';
      const coords = await geocodeStops(stops);
      if (!open || seq !== drawSeq) return;
      drawStopsMap(mapEl, stops, coords);
      const missing = stops.filter(function(s, i){ return !coords[i]; }).map(function(s){ return s.address; });
      summary.textContent = '≈ ' + routeKm(coords).toFixed(1) + ' km straight line';
      if (missing.length) {
        const warn = document.createElement('span');
        warn.className = 'is-warn';
        warn.textContent = ' · Not found on the map: ' + missing.join(', ');
        summary.appendChild(warn);
      }
    }
    function setOpen(next){
      open = !!next;
      panel.style.display = open ? '' : 'none';
      toggle.textContent = open ? '🗺 Hide map' : '🗺 Map';
      if (options.onToggle) options.onToggle(open);
      if (open) refresh();
    }
    toggle.addEventListener('click', function(){ setOpen(!open); });
    return { el: wrap, setOpen: setOpen, refresh: refresh, isOpen: function(){ return open; }, optimizeBtn: optimizeBtn };
  }

  // Under the editor's stops; redrawn (debounced) whenever the stops are re-rendered.
  function ensureEditorMapPanel(){
    if (!editStopsList || !editStopsList.parentNode) return;
    if (!editorMapPanel) {
      editorMapPanel = buildStopsMapPanel(function(){ return editorState.stopsModel || []; }, {
        onOptimize: optimizeEditorStops,
        optimizeTitle: 'Reorder the pending stops for a shorter route — check the highlighted stops, then Save'
      });
      const after = (splitBarEl && splitBarEl.parentNode === editStopsList.parentNode) ? splitBarEl : editStopsList;
      editStopsList.parentNode.insertBefore(editorMapPanel.el, after.nextSibling);
    }
    if (editorMapPanel.isOpen()) {
      if (editorMapTimer) clearTimeout(editorMapTimer);
      editorMapTimer = setTimeout(editorMapPanel.refresh, 400);
    }
  }

  // "✨ Optimize route" under the editor's stops: reorders them as they are
  // right now (hand-dragged order included) for a shorter route. Pickup,
  // finished and priority stops keep their places; empty rows stay last.
  async function optimizeEditorStops(btn){
    const model = editorState.stopsModel || [];
    const filled = model.filter(function(s){ return normalizeText(s.address); });
    const blank = model.filter(function(s){ return !normalizeText(s.address); });
    if (filled.length < 3) {
      setEditorFeedback('Add at least two drops to optimize the route.', true);
      return;
    }
    const before = filled.map(function(s){ return normalizeText(s.address); }).join('|');
    let coords;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Optimizing…'; }
    try {
      coords = await geocodeStops(filled);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✨ Optimize route'; }
    }
    // The stops were edited while the addresses were looked up.
    const now = (editorState.stopsModel || []).filter(function(s){ return normalizeText(s.address); }).map(function(s){ return normalizeText(s.address); }).join('|');
    if (!editorState.open || now !== before) {
      if (editorState.open) setEditorFeedback('The stops changed while optimizing — press Optimize again.', true);
      return;
    }
    const result = optimizeStopOrder(filled, coords);
    if (!result.changed) {
      setEditorFeedback('This is already the shortest order found (' + result.beforeKm.toFixed(1) + ' km straight line) — nothing changed.');
      return;
    }
    editorState.stopsModel = result.indexOrder.map(function(i){ return filled[i]; }).concat(blank);
    renderStopsList();
    updateMapsRouteLink();
    autoCalcStopsFee();
    updateEditorDirtyFromForm();
    setEditorFeedback('Reordered for a shorter route: ' + result.beforeKm.toFixed(1) + ' → ' + result.afterKm.toFixed(1) + ' km (straight line). Check the highlighted stops and Save.');
  }

  // "✨ Optimize route" on a card: opens the order in the editor, shows the
  // map and optimizes there (moved stops highlighted) for checking before Save.
  async function optimizeOrderInEditor(order, btn){
    const stops = (order && order.route && Array.isArray(order.route.stops)) ? order.route.stops : [];
    if (stops.length < 3) return;
    openEditor('edit', order);
    if (!editorState.open || editorState.sourceEventId !== order.eventId) return;
    if (editorMapPanel) editorMapPanel.setOpen(true);
    await optimizeEditorStops(editorMapPanel ? editorMapPanel.optimizeBtn : btn);
  }

  function _spSetSystemPricingStatus(msg) {
    if (!systemPricingStatus) return;
    systemPricingStatus.textContent = msg || '';
    systemPricingStatus.style.display = msg ? 'block' : 'none';
  }

  // Prices the route exactly like the booking page: Google geocoding and bike
  // routing in the browser, then the shared CargoworksPricing calculation
  // (zone, per-km, fees, load type, surcharges, promo codes, IVA). Fills the
  // breakdown fields and keeps the complete breakdown for the order.
  async function handleGetSystemPricing() {
    const model = editorState.stopsModel || [];
    const filled = model.filter(function(s){ return normalizeText(s.address); });
    if (filled.length < 2 || !normalizeText(model[0] && model[0].address) || !normalizeText(model[model.length - 1] && model[model.length - 1].address)) {
      _spSetSystemPricingStatus('⚠ Pickup and dropoff are required.');
      return;
    }
    if (editGetSystemPricing) { editGetSystemPricing.disabled = true; editGetSystemPricing.textContent = '⚙ Calculating…'; }
    _spSetSystemPricingStatus('Looking up ' + filled.length + ' address(es)…');
    try {
      const data = await _spLoadData();
      const parsedZones = _spParseZones(data.zones);
      const gm = await window.cwLoadGoogleMaps();
      const geocoder = new gm.Geocoder();
      const directions = new gm.DirectionsService();

      const found = await Promise.all(filled.map(function(s){
        if (hasExactLocation(s)) return { location: new gm.LatLng(Number(s.lat), Number(s.lng)), label: normalizeText(s.address), precise: true, exact: true };
        return CargoworksPricing.geocodeBarcelona(geocoder, normalizeText(s.address));
      }));
      const labels = filled.map(function(s, i){ return i === 0 ? 'Pickup' : (i === filled.length - 1 ? 'Drop-off' : ('Stop ' + i)); });
      for (let i = 0; i < found.length; i++) {
        if (!found[i]) { _spSetSystemPricingStatus('⚠ No result for ' + labels[i].toLowerCase() + ': "' + normalizeText(filled[i].address) + '" — try a more complete address.'); return; }
      }
      const points = found.map(function(f){ return { lat: f.location.lat(), lng: f.location.lng() }; });
      const zonesOf = points.map(function(p){ return _spFindZone(p.lat, p.lng, parsedZones); });
      const pickupZone = zonesOf[0];
      if (!pickupZone) { _spSetSystemPricingStatus('⚠ Pickup is outside the Cargoworks service area.'); return; }
      const outside = labels.filter(function(l, i){ return i > 0 && !zonesOf[i]; });

      _spSetSystemPricingStatus('Routing ' + (points.length - 1) + ' leg(s) by bike…');
      const routed = await CargoworksPricing.routeBikeLegs(directions, found.map(function(f){ return f.location; }));
      const origin = CargoworksPricing.zoneOneCenter(data.zones);
      const dateKey = normalizeText(editScheduleDate && editScheduleDate.value);
      const timeLabel = normalizeText(editScheduleTime && editScheduleTime.value);
      const codes = promoCodesFromInput();
      let discountInfo = { totalDiscount: 0, applied: [], errors: [] };
      const priced = CargoworksPricing.computeQuotePrice({
        prices: data.prices,
        holidays: data.holidays,
        pickupZone: pickupZone,
        legs: routed.legs,
        dropCenterKm: CargoworksPricing.haversineKm(origin, points[points.length - 1]),
        intermediateStops: points.length - 2,
        cargoKey: normalizeText(editLoadType && editLoadType.value) || 'regular',
        dateKey: dateKey,
        timeLabel: timeLabel,
        discount: function(sub){
          discountInfo = CargoworksPricing.resolveDiscounts(codes, data.discounts && data.discounts.codes, sub, dateKey || formatDateKey(new Date()));
          return discountInfo;
        }
      });
      const detail = CargoworksPricing.pricingDetail(priced, labels);

      if (editPriceBase)       editPriceBase.value       = (priced.pickupCharge + priced.minimumTopUp).toFixed(2);
      if (editPriceDistance)   editPriceDistance.value   = priced.distanceTotal.toFixed(2);
      if (editPriceStops)      editPriceStops.value      = priced.addressFee.toFixed(2);
      if (editPriceSurcharge)  editPriceSurcharge.value  = (priced.cargoAmount + priced.surchargeAmount).toFixed(2);
      if (editPriceDiscount)   editPriceDiscount.value   = priced.discountAmount.toFixed(2);
      if (editPriceAdjustment) editPriceAdjustment.value = priced.vatAmount.toFixed(2);
      if (editPriceTotal)      editPriceTotal.value      = priced.total.toFixed(2);
      if (editLoadType && priced.cargo.auto) editLoadType.value = 'large';
      if (editEtaMins) editEtaMins.value = String(Math.max(15, priced.etaMins));
      if (editTotalKm) editTotalKm.value = priced.totalKm.toFixed(2);
      editorState.pricingDetail = detail;
      renderEditorSubtotal();
      togglePriceNotice(false);
      updateEditorDirtyFromForm();

      // The complete breakdown, plus what was matched, under the button.
      const notes = ['✓ Zone ' + pickupZone + ' · ' + priced.totalKm.toFixed(2) + ' km by bike' + (routed.estimated ? ' (estimated — routing unavailable)' : '') + ' · ETA ~' + priced.etaMins + ' min'];
      if (priced.cargo.auto) notes.push('Load set to Heavy/Big automatically (5+ stops), like the booking page.');
      outside.forEach(function(l){ notes.push('⚠ ' + l + ' is outside the service area — the booking page would not price this route.'); });
      (discountInfo.errors || []).forEach(function(e){ notes.push('⚠ Promo ' + e.code + ': ' + ({ not_found: 'not found', inactive: 'inactive', not_started: 'not active yet', expired: 'expired', min_order: 'minimum order not reached' }[e.reason] || e.reason)); });
      const exactCount = found.filter(function(f){ return f.exact; }).length;
      if (exactCount) notes.push('📍 ' + exactCount + ' of ' + found.length + ' addresses use the exact point picked from the suggestions.');
      filled.forEach(function(s, i){
        if (found[i].exact) return;
        if (!found[i].precise) notes.push('⚠ ' + labels[i] + ' only matched an area ("' + found[i].label + '"), not an exact address — pick it from the suggestions to price it exactly.');
        else if (found[i].label && found[i].label !== normalizeText(s.address)) notes.push(labels[i] + ' → ' + found[i].label);
      });
      renderSystemPricingDetail(detail, notes);
    } catch(err) {
      _spSetSystemPricingStatus('⚠ Error: ' + (err && err.message || String(err)));
    } finally {
      if (editGetSystemPricing) { editGetSystemPricing.disabled = false; editGetSystemPricing.textContent = '⚙ Get system pricing'; }
    }
  }

  function renderSystemPricingDetail(detail, notes){
    if (!systemPricingStatus) return;
    systemPricingStatus.textContent = '';
    const grid = document.createElement('div');
    grid.className = 'price-detail';
    pricingDetailRows(detail).forEach(function(r){
      const l = document.createElement('span');
      l.textContent = r.label;
      if (r.kind === 'note') { l.className = 'is-note'; grid.appendChild(l); return; }
      const v = document.createElement('span');
      v.textContent = 'EUR ' + money(r.value);
      if (r.kind === 'sub') l.className = 'is-sub';
      if (r.kind === 'sum') { l.className = 'is-sum'; v.className = 'is-sum'; }
      grid.appendChild(l);
      grid.appendChild(v);
    });
    (notes || []).forEach(function(n){
      const e = document.createElement('span');
      e.className = /^⚠/.test(n) ? 'is-warn' : 'is-note';
      e.textContent = n;
      grid.appendChild(e);
    });
    systemPricingStatus.appendChild(grid);
    systemPricingStatus.style.display = 'block';
  }

  // ── Live address inference on pickup / dropoff fields ───────────────────
  // Debounced 700ms — calls adminGeocode and shows a suggestion pill the
  // dispatcher can accept with one tap. Never rewrites the field automatically.

  // Attaches the debounced geocode-suggestion UI to a single address input.
  // Called for the dynamically-rendered pickup/dropoff rows in renderStopsList
  // (idx 0 and the last index) each time they're (re)created — intermediate
  // stop rows and the AI scanner already return validated addresses, so this
  // isn't attached per-row for those.
  function hasExactLocation(stop){
    return !!stop && stop.lat !== '' && stop.lat != null && stop.lng !== '' && stop.lng != null &&
      Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lng));
  }

  // The exact point of a stop (picked from Google's suggestions, the booking
  // page or My location) — pricing and maps then use that spot instead of
  // looking the text up again. null clears it.
  function setStopLocation(stop, inputEl, loc){
    if (loc) {
      stop.lat = Math.round(Number(loc.lat) * 1e6) / 1e6;
      stop.lng = Math.round(Number(loc.lng) * 1e6) / 1e6;
    } else {
      stop.lat = null;
      stop.lng = null;
    }
    if (inputEl) {
      inputEl.classList.toggle('has-exact-location', !!loc);
      inputEl.title = loc ? 'Exact location (picked from the suggestions) — used for pricing and maps' : '';
    }
  }

  // Google's address suggestions, same settings as the booking page
  // (Barcelona area, addresses and places). Loaded on first focus.
  function attachPlacesAutocomplete(inputEl, stop){
    if (!inputEl || typeof window.cwLoadGoogleMaps !== 'function') return;
    function attach(gm){
      if (inputEl._placesAttached || !gm || !gm.places || !gm.places.Autocomplete) return;
      inputEl._placesAttached = true;
      const ac = new gm.places.Autocomplete(inputEl, {
        types: ['geocode', 'establishment'],
        componentRestrictions: { country: 'es' },
        fields: ['formatted_address', 'geometry', 'name', 'types']
      });
      try {
        ac.setBounds(new gm.LatLngBounds(new gm.LatLng(41.30, 1.96), new gm.LatLng(41.52, 2.30)));
        ac.setOptions({ strictBounds: true });
      } catch(_) {}
      ac.addListener('place_changed', function(){
        const place = ac.getPlace();
        const loc = place && place.geometry && place.geometry.location;
        if (!loc) return;
        const isPlace = Array.isArray(place.types) && place.types.indexOf('establishment') >= 0 && place.name;
        const label = (isPlace && place.formatted_address && place.formatted_address.indexOf(place.name) !== 0)
          ? (place.name + ', ' + place.formatted_address)
          : (place.formatted_address || inputEl.value);
        inputEl.value = label;
        inputEl._fromPlace = true;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl._fromPlace = false;
        setStopLocation(stop, inputEl, { lat: loc.lat(), lng: loc.lng() });
      });
    }
    if (window.google && window.google.maps && window.google.maps.places) { attach(window.google.maps); return; }
    inputEl.addEventListener('focus', function(){
      window.cwLoadGoogleMaps().then(attach).catch(function(){});
    }, { once: true });
  }

  // ── End system pricing ────────────────────────────────────────────────────



  async function handleNewOrder(){
    if (!currentToken()) {
      setStatus('Unlock with admin token first.', true);
      return;
    }
    openEditor('create', null);
    // Give the new order form the room — unless opening it was cancelled
    // (kept editing another order).
    if (editorState.open && editorState.mode === 'create') setHeaderCollapsed(true);
  }

  function onControlChange(){
    if (filterTimer) window.clearTimeout(filterTimer);
    filterTimer = window.setTimeout(applyFilters, 140);
    if (loadMode === 'none') setStatus('Press Apply (or Enter in Quick search) to load matching orders.');
  }

  // Fetches orders for the From/To range (every date if both are empty) and
  // applies the remaining filters to them, so filters can be set first and
  // loaded in one step. An account view stays on that account.
  function loadWithFilters(){
    if (loadMode === 'account' && lastAccount) {
      loadAccount(lastAccount, false);
      return;
    }
    loadAll(false, { defaultRange: true });
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
  if (yesterdayBtn) yesterdayBtn.addEventListener('click', function(){
    const yesterday = shiftDateKey(formatDateKey(new Date()), -1);
    if (dateInput) dateInput.value = yesterday;
    loadDay(yesterday, false);
  });
  // ‹ › step the Date by one day from what's shown (today if empty) and load
  // it. The box updates right away so quick repeated taps keep stepping.
  [[prevDayBtn, -1], [nextDayBtn, 1]].forEach(function(pair){
    if (!pair[0]) return;
    pair[0].addEventListener('click', function(){
      const base = dateInput && dateInput.value ? dateInput.value : formatDateKey(new Date());
      const next = shiftDateKey(base, pair[1]);
      if (dateInput) dateInput.value = next;
      loadDay(next, false);
    });
  });
  // Picking a date in the Day box loads it — but only once it's a complete,
  // plausible date (typing a year passes through 0002, 0020, 0202…) and the
  // typing has paused; Enter or leaving the box loads it right away.
  let dayPickTimer = null;
  function plausibleDateKey(value){
    const key = normalizeDateKey(value);
    const year = Number(String(key).slice(0, 4));
    return key && year >= 2020 && year <= 2100 ? key : '';
  }
  function loadPickedDay(){
    if (dayPickTimer) { window.clearTimeout(dayPickTimer); dayPickTimer = null; }
    const key = plausibleDateKey(dateInput && dateInput.value);
    if (key && !(loadMode === 'day' && loadedDayKey === key)) loadDay(key, false);
  }
  if (dateInput) {
    ['input', 'change'].forEach(function(evt){
      dateInput.addEventListener(evt, function(){
        if (dayPickTimer) window.clearTimeout(dayPickTimer);
        dayPickTimer = window.setTimeout(loadPickedDay, 700);
      });
    });
    dateInput.addEventListener('blur', function(){ if (dayPickTimer) loadPickedDay(); });
    dateInput.addEventListener('keydown', function(e){
      if (e.key === 'Enter') { e.preventDefault(); loadPickedDay(); }
    });
  }
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

  if (loadAccountBtn) loadAccountBtn.addEventListener('click', function(){
    loadAccount(accountInput && accountInput.value, false);
  });
  if (accountInput) accountInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter') {
      e.preventDefault();
      loadAccount(accountInput.value, false);
    }
  });

  if (logSheetBtn) logSheetBtn.addEventListener('click', openLogSheet);
  if (newOrderBtn) newOrderBtn.addEventListener('click', handleNewOrder);
  if (applyFiltersBtn) applyFiltersBtn.addEventListener('click', loadWithFilters);
  if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', clearFilters);
  if (keywordInput) keywordInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter') {
      e.preventDefault();
      loadWithFilters();
    }
  });
  refreshFilterOptions();

  [keywordInput, filterStatus, filterUpdates, filterPayment, filterInvoiced, sortSelect]
    .forEach(function(control){
      if (!control) return;
      const eventName = control.tagName === 'INPUT' ? 'input' : 'change';
      control.addEventListener(eventName, onControlChange);
    });
  // From/To only re-filter once cleared or a complete, plausible date — not
  // on every keystroke while a year is being typed.
  [filterFromDate, filterToDate].forEach(function(control){
    if (!control) return;
    control.addEventListener('change', function(){
      if (!control.value || plausibleDateKey(control.value)) onControlChange();
    });
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

  if (editCreatePaymentBtn) editCreatePaymentBtn.addEventListener('click', handleCreatePaymentLink);

  // Pickup geolocation button and maps-route-link live updates are wired
  // per-row inside renderStopsList (pickup/dropoff are now dynamically
  // rendered rows, not static inputs).

  if (addStopBtn) addStopBtn.addEventListener('click', addStopAtEnd);

  if (editGetSystemPricing) editGetSystemPricing.addEventListener('click', handleGetSystemPricing);

  // Pricing override toggle
  if (editPriceOverride) editPriceOverride.addEventListener('change', function(){ applyPriceOverride(); recalculatePriceTotal(); renderVatSplit(); updateEditorDirtyFromForm(); });
  // Typing a total by hand is a manual override.
  if (editPriceTotal) editPriceTotal.addEventListener('input', function(){
    if (editPriceOverride && !editPriceOverride.checked && (!editBillingMode || editBillingMode.value === 'flat')) {
      editPriceOverride.checked = true;
      applyPriceOverride();
    }
    renderVatSplit();
  });

  // Elapsed-time billing
  if (editBillingMode) editBillingMode.addEventListener('change', function(){
    applyBillingModeVisibility();
    recalculateElapsedMinutes();
    recalculatePriceTotal();
    updateEditorDirtyFromForm();
  });
  if (editElapsedOverride) editElapsedOverride.addEventListener('change', function(){ applyElapsedOverride(); recalculatePriceTotal(); });
  [editHourlyRate, editRouteStartedAt, editRouteCompletedAt, editElapsedMinutes, editStopCount, editStopRate].forEach(function(el){
    if (!el) return;
    el.addEventListener('input', function(){
      if (el === editRouteStartedAt || el === editRouteCompletedAt) recalculateElapsedMinutes();
      recalculatePriceTotal();
      updateEditorDirtyFromForm();
    });
  });

  // Account token verification
  if (editAccountVerifyBtn) editAccountVerifyBtn.addEventListener('click', function(){ verifyAccountToken(false); });
  if (editAccountToken) editAccountToken.addEventListener('blur', function(){ verifyAccountToken(false); });

  // Stop quick-add wiring done inside setupStopsQuickAdd()

  (function init(){
    const token = loadToken();
    const operator = loadOperator();
    if (token) unlockGate();
    if (operatorInput) operatorInput.value = operator || 'dispatcher';
    const today = formatDateKey(new Date());
    if (dateInput) dateInput.value = today;
    renderAccountOptions(loadKnownAccounts());
    setupImportPanel();
    setupStopsQuickAdd();
  })();

})();