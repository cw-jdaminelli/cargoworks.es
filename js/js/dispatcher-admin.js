(function(){
  const API_BASE = (window.CARGOWORKS_BOOKING_API || '').replace(/\/$/, '');
  const tokenKey = 'cwDispatcherToken';

  const gate = document.getElementById('dispatcherGate');
  const tokenInput = document.getElementById('dispatcherTokenInput');
  const tokenButton = document.getElementById('dispatcherTokenButton');
  const gateStatus = document.getElementById('dispatcherGateStatus');

  const dateInput = document.getElementById('dispatcherDate');
  const loadBtn = document.getElementById('dispatcherLoad');
  const loadAllBtn = document.getElementById('dispatcherLoadAll');
  const todayBtn = document.getElementById('dispatcherToday');
  const searchInput = document.getElementById('dispatcherSearchInput');
  const searchBtn = document.getElementById('dispatcherSearchButton');
  const logSheetBtn = document.getElementById('dispatcherLogSheet');

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

  let toastTimer = null;
  let allOrders = [];
  let loadMode = 'none';
  let loadLabel = '';

  function setStatus(msg){
    if (statusEl) statusEl.textContent = msg || '';
    showToast(msg);
  }
  function setSummary(msg){ if (summaryEl) summaryEl.textContent = msg || ''; }

  function showToast(msg){
    if (!msg) return;
    let toast = document.querySelector('.dispatcher-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'dispatcher-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
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

  function currentToken(){
    const tok = loadToken();
    return String(tok || '').trim();
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

  function dateKeyFromReference(ref){
    const match = String(ref || '').toUpperCase().match(/^CW-(\d{8})-/);
    if (!match) return '';
    const y = match[1].slice(0, 4);
    const m = match[1].slice(4, 6);
    const d = match[1].slice(6, 8);
    return y + '-' + m + '-' + d;
  }

  function formatDateKey(date){
    const d = date instanceof Date ? date : new Date(date);
    const y = String(d.getFullYear());
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function el(tag, className, text){
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function buildSelect(options, value){
    const sel = document.createElement('select');
    options.forEach(function(opt){
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      if (value && value === opt.value) o.selected = true;
      sel.appendChild(o);
    });
    return sel;
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

  async function fetchOrders(params){
    const token = currentToken();
    if (!API_BASE) throw new Error('Booking API is not configured.');
    const query = new URLSearchParams();
    query.set('action', 'adminList');
    query.set('token', token);
    if (params && params.date) query.set('date', String(params.date));
    if (params && params.scope) query.set('scope', String(params.scope));
    if (params && params.from) query.set('from', String(params.from));
    if (params && params.to) query.set('to', String(params.to));
    const url = API_BASE + '?' + query.toString();
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || 'Request failed');
    return Array.isArray(json.orders) ? json.orders : [];
  }

  async function fetchLogSheetInfo(){
    const token = currentToken();
    const query = new URLSearchParams();
    query.set('action', 'adminSheetInfo');
    query.set('token', token);
    const res = await fetch(API_BASE + '?' + query.toString());
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || 'Could not load sheet info');
    return json;
  }

  async function postAdmin(payload){
    const form = new URLSearchParams();
    form.set('payload', JSON.stringify(payload));
    const res = await fetch(API_BASE, {
      method: 'POST',
      body: form
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || 'Request failed');
    return json;
  }

  function renderTimeline(items){
    if (!Array.isArray(items) || !items.length) return el('div', 'dispatcher-status', 'No updates yet.');
    const ul = document.createElement('ul');
    ul.className = 'dispatcher-timeline';
    items.slice().reverse().slice(0, 6).forEach(function(item){
      const li = document.createElement('li');
      const ts = item && item.ts ? String(item.ts).replace('T', ' ').replace('Z', '') : '';
      const status = item && item.status ? String(item.status) : '';
      const msg = item && item.message ? String(item.message) : '';
      li.textContent = (ts ? (ts + ' - ') : '') + (status ? (status + ': ') : '') + msg;
      ul.appendChild(li);
    });
    return ul;
  }

  function setLink(anchor, url){
    if (!anchor) return;
    const clean = String(url || '').trim();
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

  function orderCard(order){
    const card = el('div', 'dispatcher-card');
    const header = el('h3', '', (order.reference || 'Order') + ' - ' + (order.status || ''));
    card.appendChild(header);

    const meta = el('div', 'dispatcher-meta');
    meta.appendChild(el('span', '', 'Date: ' + (order.schedule && order.schedule.date ? order.schedule.date : '-')));
    meta.appendChild(el('span', '', 'Time: ' + (order.schedule && order.schedule.time ? order.schedule.time : '-')));
    meta.appendChild(el('span', '', 'Customer: ' + (order.customer && order.customer.name ? order.customer.name : '-')));
    meta.appendChild(el('span', '', 'Email: ' + (order.customer && order.customer.email ? order.customer.email : '-')));
    meta.appendChild(el('span', '', 'Phone: ' + (order.customer && order.customer.phone ? order.customer.phone : '-')));
    meta.appendChild(el('span', '', 'Preference: ' + (order.updatesPreference || '-')));
    meta.appendChild(el('span', '', 'Payment: ' + (order.paymentStatus || '-')));
    card.appendChild(meta);

    const links = el('div', 'dispatcher-links');
    const tracking = buildLink(order.trackingUrl, 'Tracking');
    const payment = buildLink(order.paymentUrl, 'Payment');
    const pod = document.createElement('a');
    pod.textContent = 'POD';
    pod.target = '_blank';
    pod.rel = 'noopener';
    setLink(pod, order.podUrl);
    links.appendChild(el('span', 'dispatcher-chip', 'Links'));
    links.appendChild(document.createTextNode(' '));
    links.appendChild(tracking);
    links.appendChild(document.createTextNode(' | '));
    links.appendChild(payment);
    links.appendChild(document.createTextNode(' | '));
    links.appendChild(pod);
    card.appendChild(links);

    const actions = el('div', 'dispatcher-actions');
    const statusSelect = buildSelect([
      { value: 'Pending payment', label: 'Pending payment' },
      { value: 'Assigned', label: 'Assigned' },
      { value: 'Picked up', label: 'Picked up' },
      { value: 'In transit', label: 'In transit' },
      { value: 'Delivered', label: 'Delivered' },
      { value: 'Issue', label: 'Issue' }
    ], order.status || '');

    const paymentSelect = buildSelect([
      { value: '', label: 'Payment status' },
      { value: 'pending', label: 'Pending' },
      { value: 'paid', label: 'Paid' },
      { value: 'failed', label: 'Failed' },
      { value: 'none', label: 'None' }
    ], order.paymentStatus || '');

    const message = document.createElement('textarea');
    message.placeholder = 'Write a progress update...';

    const channelWrap = el('div', 'dispatcher-controls');
    const emailCheck = document.createElement('input');
    emailCheck.type = 'checkbox';
    emailCheck.checked = (order.updatesPreference || '').toLowerCase() === 'email';
    const emailLabel = el('label', 'dispatcher-channel');
    emailLabel.appendChild(emailCheck);
    emailLabel.appendChild(document.createTextNode(' Email'));

    const waCheck = document.createElement('input');
    waCheck.type = 'checkbox';
    waCheck.checked = (order.updatesPreference || '').toLowerCase() === 'whatsapp';
    const waLabel = el('label', 'dispatcher-channel');
    waLabel.appendChild(waCheck);
    waLabel.appendChild(document.createTextNode(' WhatsApp'));

    channelWrap.appendChild(emailLabel);
    channelWrap.appendChild(waLabel);

    const sendBtn = el('button', 'btn dispatcher-action-btn', 'Send update');
    const saveBtn = el('button', 'btn btn--ghost dispatcher-action-btn', 'Save status');

    const podWrap = el('div', 'dispatcher-pod');
    const podInput = document.createElement('input');
    podInput.type = 'file';
    podInput.accept = 'image/*';
    podInput.style.display = 'none';
    const podChoose = el('button', 'btn btn--ghost', 'Choose POD photo');
    podChoose.type = 'button';
    const podUpload = el('button', 'btn', 'Upload POD');
    podUpload.type = 'button';
    podUpload.disabled = true;
    const podName = el('span', 'dispatcher-status', 'No file selected');
    podChoose.addEventListener('click', function(){
      try { podInput.click(); } catch(_) {}
    });
    podWrap.appendChild(podChoose);
    podWrap.appendChild(podUpload);
    podWrap.appendChild(podName);
    podWrap.appendChild(podInput);

    actions.appendChild(statusSelect);
    actions.appendChild(paymentSelect);
    actions.appendChild(message);
    actions.appendChild(channelWrap);
    actions.appendChild(sendBtn);
    actions.appendChild(saveBtn);
    actions.appendChild(podWrap);
    card.appendChild(actions);

    const timeline = renderTimeline(order.timeline || []);
    card.appendChild(timeline);

    saveBtn.addEventListener('click', async function(){
      try {
        setStatus('Saving status...');
        const token = currentToken();
        await postAdmin({
          action: 'adminUpdate',
          token: token,
          eventId: order.eventId,
          status: statusSelect.value,
          paymentStatus: paymentSelect.value
        });
        setStatus('Status updated.');
      } catch(_) {
        setStatus('Update failed.');
      }
    });

    sendBtn.addEventListener('click', async function(){
      const text = String(message.value || '').trim();
      if (!text) { setStatus('Add an update message.'); return; }
      try {
        setStatus('Sending update...');
        const token = currentToken();
        const send = { email: emailCheck.checked, whatsapp: waCheck.checked };
        const res = await postAdmin({
          action: 'adminUpdate',
          token: token,
          eventId: order.eventId,
          status: statusSelect.value,
          paymentStatus: paymentSelect.value,
          message: text,
          send: send
        });
        if (res && res.send && res.send.whatsappUrl) {
          try { window.open(res.send.whatsappUrl, '_blank'); } catch(_) {}
        }
        if (message) message.value = '';
        setStatus('Update sent.');
      } catch(_) {
        setStatus('Update failed.');
      }
    });

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
      if (!file) { setStatus('Choose a photo first.'); return; }
      const reader = new FileReader();
      reader.onload = async function(){
        try {
          setStatus('Uploading POD...');
          const token = currentToken();
          const res = await postAdmin({
            action: 'adminPod',
            token: token,
            eventId: order.eventId,
            fileName: file.name,
            contentType: file.type,
            data: String(reader.result || '')
          });
          if (res && res.podUrl) {
            setLink(pod, res.podUrl);
            setStatus('POD uploaded.');
          } else {
            setStatus('POD upload complete.');
          }
        } catch(_) {
          setStatus('POD upload failed.');
        } finally {
          podInput.value = '';
          podUpload.disabled = true;
          podName.textContent = 'No file selected';
        }
      };
      reader.readAsDataURL(file);
    });

    return card;
  }

  function orderDateKey(order){
    return String(order && order.schedule && order.schedule.date || '').trim();
  }

  function orderTimeLabel(order){
    return String(order && order.schedule && order.schedule.time || '').trim();
  }

  function orderDateTimeMs(order){
    const iso = String(order && order.schedule && order.schedule.startIso || '').trim();
    if (iso) {
      const ms = Date.parse(iso);
      if (!Number.isNaN(ms)) return ms;
    }
    const dateKey = orderDateKey(order);
    const time = orderTimeLabel(order) || '00:00';
    const ms = Date.parse(dateKey + 'T' + time + ':00');
    return Number.isNaN(ms) ? 0 : ms;
  }

  function orderSearchText(order){
    const bits = [];
    bits.push(order.reference || '');
    bits.push(order.title || '');
    bits.push(order.status || '');
    bits.push(order.paymentStatus || '');
    bits.push(order.updatesPreference || '');
    bits.push(order.notes || '');
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

  function renderOrders(orders){
    if (!ordersWrap) return;
    ordersWrap.innerHTML = '';
    orders.forEach(function(order){ ordersWrap.appendChild(orderCard(order)); });
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
      const clean = String(value || '').trim();
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
    const statuses = Array.from(new Set(allOrders.map(function(order){ return order && order.status ? String(order.status).trim() : ''; }).filter(Boolean))).sort();
    const updates = Array.from(new Set(allOrders.map(function(order){ return order && order.updatesPreference ? String(order.updatesPreference).trim() : ''; }).filter(Boolean))).sort();
    setSelectOptions(filterStatus, statuses, 'Any status');
    setSelectOptions(filterUpdates, updates, 'Any updates preference');
  }

  function filterOrders(){
    const keyword = String(keywordInput && keywordInput.value || '').trim().toLowerCase();
    const status = String(filterStatus && filterStatus.value || '').trim();
    const updates = String(filterUpdates && filterUpdates.value || '').trim();
    const payment = String(filterPayment && filterPayment.value || '').trim();
    const fromDate = String(filterFromDate && filterFromDate.value || '').trim();
    const toDate = String(filterToDate && filterToDate.value || '').trim();
    const sortMode = String(sortSelect && sortSelect.value || 'newest').trim();

    const filtered = allOrders.filter(function(order){
      if (status && String(order.status || '') !== status) return false;
      if (updates && String(order.updatesPreference || '') !== updates) return false;
      if (payment && String(order.paymentStatus || '') !== payment) return false;
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

  function applyFilters(){
    const visible = filterOrders();
    renderOrders(visible);
    const scope = loadMode === 'day'
      ? ('for ' + loadLabel)
      : (loadMode === 'all' ? 'from all loaded orders' : (loadMode === 'reference' ? 'for reference search' : ''));
    setSummary('Showing ' + visible.length + ' of ' + allOrders.length + ' order(s)' + (scope ? (' ' + scope) : '') + '.');
  }

  async function loadDay(dateKey){
    try {
      setStatus('Loading day...');
      const orders = await fetchOrders({ date: dateKey });
      allOrders = orders;
      loadMode = 'day';
      loadLabel = dateKey;
      refreshFilterOptions();
      applyFilters();
      setStatus('Loaded ' + orders.length + ' order(s).');
    } catch(err) {
      allOrders = [];
      renderOrders([]);
      setStatus(err && err.message ? err.message : 'Could not load orders.');
      setSummary('No data yet.');
    }
  }

  async function loadAll(){
    try {
      setStatus('Loading all orders...');
      const from = String(filterFromDate && filterFromDate.value || '').trim();
      const to = String(filterToDate && filterToDate.value || '').trim();
      const orders = await fetchOrders({ scope: 'all', from: from, to: to });
      allOrders = orders;
      loadMode = 'all';
      loadLabel = from || to ? (from + ' .. ' + to) : 'all';
      refreshFilterOptions();
      applyFilters();
      setStatus('Loaded ' + orders.length + ' total order(s).');
    } catch(err) {
      allOrders = [];
      renderOrders([]);
      setStatus(err && err.message ? err.message : 'Could not load all orders.');
      setSummary('No data yet.');
    }
  }

  async function loadByReference(ref){
    const cleanRef = String(ref || '').trim().toUpperCase();
    if (!cleanRef) { setStatus('Enter a reference.'); return; }
    const dateKey = dateKeyFromReference(cleanRef);
    if (!dateKey) {
      setStatus('Reference must look like CW-YYYYMMDD-XXXX.');
      return;
    }
    try {
      setStatus('Searching...');
      const orders = await fetchOrders({ date: dateKey });
      allOrders = orders.filter(function(order){ return String(order.reference || '').toUpperCase() === cleanRef; });
      loadMode = 'reference';
      loadLabel = cleanRef;
      refreshFilterOptions();
      applyFilters();
      if (dateInput) dateInput.value = dateKey;
      setStatus(allOrders.length ? 'Search complete.' : 'No matches.');
    } catch(err) {
      allOrders = [];
      renderOrders([]);
      setStatus(err && err.message ? err.message : 'Search failed.');
      setSummary('No data yet.');
    }
  }

  async function openLogSheet(){
    try {
      setStatus('Loading log sheet...');
      const info = await fetchLogSheetInfo();
      const url = String(info && info.url || '').trim();
      if (!url) throw new Error('Log sheet URL is unavailable');
      window.open(url, '_blank');
      setStatus('Log sheet opened.');
    } catch (err) {
      setStatus(err && err.message ? err.message : 'Could not open log sheet.');
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

  function handleGate(){
    const token = String(tokenInput && tokenInput.value || '').trim();
    if (!token) { if (gateStatus) gateStatus.textContent = 'Enter a token.'; return; }
    saveToken(token);
    if (gateStatus) gateStatus.textContent = '';
    unlockGate();
  }

  if (tokenButton) tokenButton.addEventListener('click', handleGate);
  if (tokenInput) tokenInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter') { e.preventDefault(); handleGate(); }
  });

  if (loadBtn) loadBtn.addEventListener('click', function(){
    const value = dateInput && dateInput.value ? dateInput.value : formatDateKey(new Date());
    if (dateInput) dateInput.value = value;
    loadDay(value);
  });

  if (loadAllBtn) loadAllBtn.addEventListener('click', loadAll);

  if (todayBtn) todayBtn.addEventListener('click', function(){
    const today = formatDateKey(new Date());
    if (dateInput) dateInput.value = today;
    loadDay(today);
  });

  if (searchBtn) searchBtn.addEventListener('click', function(){
    const ref = buildReferenceFromSuffix(searchInput && searchInput.value);
    loadByReference(ref);
  });

  if (searchInput) searchInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter') {
      e.preventDefault();
      const ref = buildReferenceFromSuffix(searchInput.value);
      loadByReference(ref);
    }
  });

  if (logSheetBtn) logSheetBtn.addEventListener('click', openLogSheet);
  if (applyFiltersBtn) applyFiltersBtn.addEventListener('click', applyFilters);
  if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', clearFilters);

  [keywordInput, filterStatus, filterUpdates, filterPayment, filterFromDate, filterToDate, sortSelect].forEach(function(control){
    if (!control) return;
    const eventName = control.tagName === 'INPUT' ? 'input' : 'change';
    control.addEventListener(eventName, function(){
      if (eventName === 'input') {
        if (window._dispatcherFilterTimer) window.clearTimeout(window._dispatcherFilterTimer);
        window._dispatcherFilterTimer = window.setTimeout(applyFilters, 150);
      } else {
        applyFilters();
      }
    });
  });

  (function init(){
    const token = loadToken();
    if (token) unlockGate();
    const today = formatDateKey(new Date());
    if (dateInput) dateInput.value = today;
  })();
})();
