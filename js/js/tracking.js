(function(){
  const API_BASE = (window.CARGOWORKS_BOOKING_API || '').replace(/\/$/, '');
  const refInput = document.getElementById('trackingRef');
  const loadBtn = document.getElementById('trackingLoad');
  const statusEl = document.getElementById('trackingStatus');
  const detailsEl = document.getElementById('trackingDetails');

  function setStatus(msg){ if (statusEl) statusEl.textContent = msg || ''; }

  function qsRef(){
    try {
      const params = new URLSearchParams(location.search);
      return String(params.get('ref') || '').trim();
    } catch(_) { return ''; }
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

  function renderTimeline(items){
    if (!Array.isArray(items) || !items.length) {
      const div = document.createElement('div');
      div.textContent = 'No updates yet.';
      return div;
    }
    const ul = document.createElement('ul');
    ul.className = 'tracking-timeline';
    items.slice().reverse().forEach(item => {
      const li = document.createElement('li');
      const ts = item && item.ts ? String(item.ts).replace('T', ' ').replace('Z', '') : '';
      const status = item && item.status ? String(item.status) : '';
      const msg = item && item.message ? String(item.message) : '';
      li.textContent = (ts ? (ts + ' - ') : '') + (status ? (status + ': ') : '') + msg;
      ul.appendChild(li);
    });
    return ul;
  }

  function renderDetails(order){
    if (!detailsEl) return;
    detailsEl.innerHTML = '';
    if (!order) return;

    const summary = document.createElement('div');
    summary.className = 'tracking-summary';
    const when = order.schedule && order.schedule.time ? order.schedule.time : '-';
    const s1 = document.createElement('span');
    s1.textContent = 'Reference: ' + (order.reference || '-');
    const s2 = document.createElement('span');
    s2.textContent = 'Status: ' + (order.status || '-');
    const s3 = document.createElement('span');
    s3.textContent = 'Time: ' + when;
    const s4 = document.createElement('span');
    s4.textContent = 'Payment: ' + (order.paymentStatus || '-');
    summary.appendChild(s1);
    summary.appendChild(s2);
    summary.appendChild(s3);
    summary.appendChild(s4);
    detailsEl.appendChild(summary);

    const links = document.createElement('div');
    links.className = 'tracking-links';
    links.appendChild(document.createTextNode('Tracking: '));
    links.appendChild(buildLink(order.trackingUrl, 'Tracking link'));
    links.appendChild(document.createTextNode(' | Payment: '));
    links.appendChild(buildLink(order.paymentUrl, 'Payment link'));
    links.appendChild(document.createTextNode(' | POD: '));
    links.appendChild(buildLink(order.podUrl, 'POD link'));
    detailsEl.appendChild(links);

    detailsEl.appendChild(renderTimeline(order.timeline || []));
  }

  async function loadTracking(ref){
    if (!API_BASE) { setStatus('Tracking is not configured.'); return; }
    if (!ref) { setStatus('Enter your reference.'); return; }
    try {
      setStatus('Loading...');
      const url = API_BASE + '?action=track&ref=' + encodeURIComponent(ref);
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Request failed');
      renderDetails(json.order || null);
      setStatus('');
    } catch(err) {
      renderDetails(null);
      setStatus(err && err.message ? err.message : 'Tracking not available.');
    }
  }

  if (loadBtn) loadBtn.addEventListener('click', function(){
    const ref = String(refInput && refInput.value || '').trim();
    loadTracking(ref);
  });

  if (refInput) refInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter') { e.preventDefault(); loadTracking(String(refInput.value || '').trim()); }
  });

  (function init(){
    const ref = qsRef();
    if (refInput && ref) refInput.value = ref;
    if (ref) loadTracking(ref);
  })();
})();
