(function(){
  const API_BASE = (window.CARGOWORKS_BOOKING_API || '').replace(/\/$/, '');
  const refInput = document.getElementById('trackingRef');
  const loadBtn = document.getElementById('trackingLoad');
  const statusEl = document.getElementById('trackingStatus');
  const detailsEl = document.getElementById('trackingDetails');

  function activeLanguage(){
    try {
      const saved = String(localStorage.getItem('lang') || '').trim().toLowerCase();
      if (saved) return saved;
    } catch(_) {}
    return String(document.documentElement.lang || 'en').trim().toLowerCase() || 'en';
  }

  const lang = activeLanguage();
  document.documentElement.lang = lang;

  function i18n(key, params){
    try {
      const translations = window.CARGOWORKS_TRANSLATIONS || {};
      const dict = Object.assign({}, translations.en || {}, translations[lang] || {});
      let text = String(dict[key] || '');
      if (params && text) {
        Object.keys(params).forEach(function(name){
          text = text.replace(new RegExp('\\{' + name + '\\}', 'g'), String(params[name]));
        });
      }
      return text;
    } catch(_) {
      return '';
    }
  }

  function applyStaticCopy(){
    document.querySelectorAll('[data-i18n]').forEach(function(node){
      const key = node.getAttribute('data-i18n');
      const text = i18n(key);
      if (text) node.textContent = text;
    });
    if (refInput) {
      const placeholder = i18n('trackingRefPlaceholder') || 'Reference (CW-DDMMYYYY-XXXX)';
      const aria = i18n('trackingRefAria') || 'Reference';
      refInput.placeholder = placeholder;
      refInput.setAttribute('aria-label', aria);
    }
    if (loadBtn) {
      loadBtn.textContent = i18n('trackingLoadButton') || 'Track';
    }
    const title = i18n('trackingDocumentTitle') || 'CARGOWORKS - Order Tracking';
    document.title = title;
  }

  function setStatus(msg, isError){
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('is-error', !!isError);
  }

  function qsRef(){
    try {
      const params = new URLSearchParams(location.search);
      return String(params.get('ref') || '').trim();
    } catch(_) {
      return '';
    }
  }

  function qsToken(){
    try {
      const params = new URLSearchParams(location.search);
      return String(params.get('t') || '').trim();
    } catch(_) {
      return '';
    }
  }

  function normalizeRef(value){
    return String(value || '').trim().toUpperCase();
  }

  const queryRef = normalizeRef(qsRef());
  const queryToken = qsToken();

  function tokenForRef(ref){
    const normalized = normalizeRef(ref);
    if (!queryToken) return '';
    if (!queryRef) return '';
    return normalized && normalized === queryRef ? queryToken : '';
  }

  function sortByTimestamp(items){
    const list = Array.isArray(items) ? items.slice() : [];
    return list.map(function(item, idx){
      const ts = item && item.ts ? String(item.ts) : '';
      const stamp = Date.parse(ts);
      return {
        item: item || {},
        idx: idx,
        sortKey: Number.isNaN(stamp) ? Number.MIN_SAFE_INTEGER : stamp
      };
    }).sort(function(a, b){
      if (a.sortKey === b.sortKey) return b.idx - a.idx;
      return b.sortKey - a.sortKey;
    }).map(function(entry){
      return entry.item;
    });
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

  async function copyToClipboard(text){
    const value = String(text || '').trim();
    if (!value) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch(_) {}
    try {
      const helper = document.createElement('textarea');
      helper.value = value;
      helper.setAttribute('readonly', 'readonly');
      helper.style.position = 'absolute';
      helper.style.left = '-9999px';
      document.body.appendChild(helper);
      helper.select();
      const ok = document.execCommand('copy');
      helper.remove();
      return !!ok;
    } catch(_) {
      return false;
    }
  }

  async function shareOrCopyLink(url){
    const value = String(url || '').trim();
    if (!value) return false;
    try {
      if (navigator.share) {
        await navigator.share({
          title: i18n('trackingPageTitle') || 'Order tracking',
          text: i18n('trackingPageIntro') || 'Track your order with this link.',
          url: value
        });
        return true;
      }
    } catch(_) {
      // Fall back to clipboard when native share is unavailable or canceled.
    }
    return copyToClipboard(value);
  }

  function buildShareButton(url){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--ghost tracking-copy-btn';
    btn.textContent = i18n('trackingCopyLink') || 'Share link';
    btn.addEventListener('click', async function(){
      const ok = await shareOrCopyLink(url);
      if (ok) {
        setStatus(i18n('trackingCopySuccess') || 'Link ready to share.', false);
      } else {
        setStatus(i18n('trackingCopyError') || 'Could not prepare share link.', true);
      }
    });
    return btn;
  }

  function summaryItem(label, value){
    const wrap = document.createElement('div');
    wrap.className = 'tracking-summary-item';
    const l = document.createElement('span');
    l.className = 'tracking-summary-label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'tracking-summary-value';
    v.textContent = value || '-';
    wrap.appendChild(l);
    wrap.appendChild(v);
    return wrap;
  }

  function normalizePaymentStatus(value){
    const key = String(value || '').trim().toLowerCase();
    if (key === 'paid') return 'Paid';
    if (key === 'pending') return 'Pending';
    if (key === 'failed') return 'Failed';
    return String(value || '').trim();
  }

  function localizeOrderStatus(value){
    const key = String(value || '').trim().toLowerCase();
    if (key === 'confirmed') return i18n('orderStatusConfirmed') || 'Confirmed';
    if (key === 'assigned') return i18n('orderStatusAssigned') || 'Assigned';
    if (key === 'picked up') return i18n('orderStatusPickedUp') || 'Picked up';
    if (key === 'in transit') return i18n('orderStatusInTransit') || 'In transit';
    if (key === 'delivered') return i18n('orderStatusDelivered') || 'Delivered';
    if (key === 'failed') return i18n('orderStatusFailed') || 'Failed';
    if (key === 'canceled') return i18n('orderStatusCanceled') || 'Canceled';
    if (key === 'delivery rejected') return i18n('orderStatusDeliveryRejected') || 'Delivery rejected';
    return String(value || '').trim() || '-';
  }

  function localizePaymentStatus(value){
    const status = normalizePaymentStatus(value);
    const key = String(status || '').trim().toLowerCase();
    if (key === 'paid') return i18n('paymentStatusPaid') || 'Paid';
    if (key === 'pending') return i18n('paymentStatusPending') || 'Pending';
    if (key === 'failed') return i18n('paymentStatusFailed') || 'Failed';
    return status || '-';
  }

  function shouldShowPaymentLink(paymentStatus){
    const status = normalizePaymentStatus(paymentStatus);
    return status === 'Pending' || status === 'Failed';
  }

  function linkRow(label, url, linkLabel, options){
    const opts = options || {};
    const includeLink = opts.includeLink !== false;
    const includeShare = !!opts.includeShare;
    const row = document.createElement('div');
    row.className = 'tracking-link-row';
    const title = document.createElement('span');
    title.className = 'tracking-link-label';
    title.textContent = label;
    row.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'tracking-link-actions';
    if (!url) {
      actions.appendChild(document.createTextNode('-'));
    } else {
      if (includeLink) actions.appendChild(buildLink(url, linkLabel));
      if (includeShare) actions.appendChild(buildShareButton(url));
    }
    row.appendChild(actions);
    return row;
  }

  function renderTimeline(items){
    if (!Array.isArray(items) || !items.length) {
      const div = document.createElement('div');
      div.textContent = i18n('trackingNoUpdates') || 'No updates yet.';
      return div;
    }
    const ul = document.createElement('ul');
    ul.className = 'tracking-timeline';
    sortByTimestamp(items).forEach(function(item){
      const li = document.createElement('li');
      const ts = item && item.ts ? String(item.ts).replace('T', ' ').replace('Z', '') : '';
      const status = localizeOrderStatus(item && item.status ? String(item.status) : '');
      const msg = item && item.message ? String(item.message) : '';
      li.textContent = (ts ? (ts + ' - ') : '') + (status ? (status + ': ') : '') + msg;
      ul.appendChild(li);
    });
    return ul;
  }

  function renderDispatcherNotes(items){
    const list = Array.isArray(items) ? sortByTimestamp(items) : [];
    if (!list.length) return null;
    const wrap = document.createElement('div');
    wrap.className = 'tracking-notes';
    const title = document.createElement('h3');
    title.textContent = i18n('trackingDispatcherNotesTitle') || 'Dispatcher notes';
    wrap.appendChild(title);
    list.forEach(function(item){
      const note = document.createElement('p');
      note.className = 'tracking-notes-item';
      const ts = item && item.ts ? String(item.ts).replace('T', ' ').replace('Z', '') : '';
      const status = localizeOrderStatus(item && item.status ? String(item.status) : '');
      const message = item && item.message ? String(item.message) : '';
      note.textContent = (ts ? (ts + ' - ') : '') + (status ? (status + ': ') : '') + message;
      wrap.appendChild(note);
    });
    return wrap;
  }

  function renderDeliveryNote(noteText){
    const note = String(noteText || '').trim();
    if (!note) return null;
    const wrap = document.createElement('div');
    wrap.className = 'tracking-delivery-note';
    const title = document.createElement('h3');
    title.textContent = i18n('trackingLatestUpdateTitle') || 'Latest delivery update';
    const body = document.createElement('p');
    body.className = 'tracking-delivery-note-text';
    body.textContent = note;
    wrap.appendChild(title);
    wrap.appendChild(body);
    return wrap;
  }

  function renderDetails(order){
    if (!detailsEl) return;
    detailsEl.innerHTML = '';
    if (!order) return;

    const paymentStatus = normalizePaymentStatus(order.paymentStatus || '-');
    const when = order.schedule && order.schedule.time ? order.schedule.time : '-';

    const summary = document.createElement('div');
    summary.className = 'tracking-summary';
    summary.appendChild(summaryItem(i18n('trackingLabelReference') || 'Reference', String(order.reference || '-')));
    summary.appendChild(summaryItem(i18n('trackingLabelStatus') || 'Status', localizeOrderStatus(order.status || '-')));
    summary.appendChild(summaryItem(i18n('trackingLabelPickupTime') || 'Pickup time', when));
    summary.appendChild(summaryItem(i18n('trackingLabelPayment') || 'Payment', localizePaymentStatus(paymentStatus || '-')));
    detailsEl.appendChild(summary);

    const links = document.createElement('div');
    links.className = 'tracking-links';
    links.appendChild(linkRow(
      i18n('trackingLabelTracking') || 'Tracking',
      order.trackingUrl,
      i18n('trackingLinkOpen') || 'Open tracking link',
      { includeLink: false, includeShare: true }
    ));
    if (shouldShowPaymentLink(paymentStatus) && order.paymentUrl) {
      links.appendChild(linkRow(
        i18n('trackingLabelPaymentLink') || 'Payment',
        order.paymentUrl,
        i18n('trackingLinkPayNow') || 'Complete payment',
        { includeLink: true, includeShare: false }
      ));
    }
    if (order.podUrl) {
      links.appendChild(linkRow(
        i18n('trackingLabelPod') || 'POD',
        order.podUrl,
        i18n('trackingLinkPod') || 'Open proof of delivery',
        { includeLink: true, includeShare: false }
      ));
    }
    detailsEl.appendChild(links);

    const deliveryNote = renderDeliveryNote(order.deliveryNote || '');
    if (deliveryNote) detailsEl.appendChild(deliveryNote);

    const notesBlock = renderDispatcherNotes(order.dispatcherNotes || []);
    if (notesBlock) detailsEl.appendChild(notesBlock);

    detailsEl.appendChild(renderTimeline(order.timeline || []));
  }

  async function loadTracking(ref, trackingToken){
    if (!API_BASE) {
      setStatus(i18n('trackingNotConfigured') || 'Tracking is not configured.', true);
      return;
    }
    if (!ref) {
      setStatus(i18n('trackingEnterReference') || 'Enter your reference.', true);
      return;
    }
    try {
      setStatus(i18n('trackingLoading') || 'Loading...', false);
      const token = String(trackingToken || '').trim();
      const tokenParam = token ? ('&t=' + encodeURIComponent(token)) : '';
      const url = API_BASE + '?action=track&ref=' + encodeURIComponent(ref) + tokenParam;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Request failed');
      renderDetails(json.order || null);
      setStatus('', false);
    } catch(err) {
      renderDetails(null);
      setStatus(err && err.message ? err.message : (i18n('trackingUnavailable') || 'Tracking not available.'), true);
    }
  }

  if (loadBtn) {
    loadBtn.addEventListener('click', function(){
      const ref = String(refInput && refInput.value || '').trim();
      loadTracking(ref, tokenForRef(ref));
    });
  }

  if (refInput) {
    refInput.addEventListener('keydown', function(e){
      if (e.key === 'Enter') {
        e.preventDefault();
        const ref = String(refInput.value || '').trim();
        loadTracking(ref, tokenForRef(ref));
      }
    });
  }

  (function init(){
    applyStaticCopy();
    const ref = queryRef;
    const token = queryToken;
    if (refInput && ref) refInput.value = ref;
    if (ref) loadTracking(ref, token);
  })();
})();
