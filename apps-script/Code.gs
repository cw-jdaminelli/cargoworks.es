// Cargoworks booking API (Google Apps Script)
// Deploy as a Web App: Execute as Me, access: Anyone.

const CALENDAR_ID = 'primary';
const TIMEZONE = 'Europe/Madrid';
const DEFAULT_DURATION_MIN = 60;
const OWNER_EMAIL = 'info@cargoworks.es';
const REPLY_TO = 'info@cargoworks.es';
const STRIPE_SECRET_PROPERTY = 'STRIPE_SECRET';
const LAST_ERROR_PROPERTY = 'LAST_ERROR';
const LAST_PAYLOAD_PROPERTY = 'LAST_PAYLOAD';
const ADMIN_TOKEN_PROPERTY = 'ADMIN_TOKEN';
const POD_FOLDER_PROPERTY = 'POD_FOLDER_ID';
const ADMIN_DATA_START = '--- ADMIN DATA ---';
const ADMIN_DATA_END = '--- END ADMIN DATA ---';
const DEFAULT_STATUS_LABEL = 'Pending payment';
const BUILD_ID = '2026-02-14-1';
const WHATSAPP_NUMBER = '34608081955';
const WHATSAPP_DEFAULT_MESSAGE = 'Hola Cargoworks, necesito ayuda con mi pedido numero ';

function doGet(e){
  try {
    const params = e && e.parameter ? e.parameter : {};
    if (String(params.debug || '') === '1') {
      return jsonResponse({
        lastError: getLastError(),
        lastPayload: getLastPayload()
      }, 200);
    }
    const action = String(params.action || '').trim();
    if (action === 'track') {
      return handleTrackingGet(params);
    }
    if (action === 'adminList') {
      return handleAdminList(params);
    }
    const dateKey = String(params.date || '').trim();
    if (!dateKey) return jsonResponse({ error: 'Missing date parameter' }, 400);
    const range = dayRangeFromKey(dateKey, TIMEZONE);
    if (!range) return jsonResponse({ error: 'Invalid date parameter' }, 400);
    const cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) return jsonResponse({ error: 'Calendar not found' }, 404);
    const events = cal.getEvents(range.start, range.end);
    const blocked = eventsToBlockedMinutes(events, range.start, TIMEZONE);
    return jsonResponse({ blocked: blocked }, 200);
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err || 'Unknown error');
    return jsonResponse({ error: 'Server error', detail: msg }, 500);
  }
}

function doPost(e){
  try {
    const payload = parseJsonBody(e);
    if (!payload) return jsonResponse({ error: 'Invalid JSON body' }, 400);
    if (payload && payload.action) {
      return handleAdminPost(payload);
    }
    setLastPayload(payload);
    const quote = payload.quote || {};
    const schedule = quote.schedule || {};
    const dateKey = String(schedule.date || '').trim();
    const timeLabel = String(schedule.time || '').trim();
    if (!dateKey || !timeLabel) return jsonResponse({ error: 'Missing date or time' }, 400);

    const start = dateTimeFromKey(dateKey, timeLabel, TIMEZONE);
    if (!start) return jsonResponse({ error: 'Invalid date or time' }, 400);

    const etaMins = Number(quote.etaMins || 0) || DEFAULT_DURATION_MIN;
    const end = new Date(start.getTime() + (etaMins * 60000));

    const customer = payload.customer || {};
    const name = String(customer.name || '').trim() || 'Customer';
    const shortRef = buildShortRef();
    const title = 'Pending payment - Cargoworks booking - ' + name + ' - ' + shortRef;

    const cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) return jsonResponse({ error: 'Calendar not found' }, 404);

    const location = getPickupAddress(quote);
    const payment = createStripeSession(payload, shortRef);
    const whatsappUrl = buildWhatsAppUrl(shortRef);
    const trackingUrl = buildTrackingUrl(payload, shortRef);
    const updatesPreference = String(payload.updatesPreference || '').trim();
    const enrichedPayload = Object.assign({}, payload, {
      reference: shortRef,
      paymentUrl: payment && payment.url ? payment.url : '',
      whatsappUrl: whatsappUrl,
      trackingUrl: trackingUrl,
      updatesPreference: updatesPreference
    });
    const adminData = buildDefaultAdminData(enrichedPayload, payment, trackingUrl, updatesPreference);
    const description = buildEventDescription(enrichedPayload, adminData);

    const event = cal.createEvent(title, start, end, {
      description: description,
      location: location
    });

    const ref = event.getId();
    const mailStatus = sendEmails(enrichedPayload, shortRef, payment && payment.url, whatsappUrl, '');
    const link = '';
    clearLastError();
    return jsonResponse({
      reference: shortRef,
      link: link,
      paymentUrl: payment && payment.url,
      whatsappUrl: whatsappUrl,
      trackingUrl: trackingUrl,
      paymentError: payment && payment.error ? payment.error : '',
      mail: mailStatus
    }, 200);
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err || 'Unknown error');
    setLastError('doPost', msg);
    return jsonResponse({ error: 'Server error', detail: msg }, 500);
  }
}

function parseJsonBody(e){
  try {
    if (!e || !e.postData || !e.postData.contents) return null;
    if (e.postData.type === 'application/x-www-form-urlencoded') {
      const data = parseFormEncoded(e.postData.contents || '');
      if (data && data.payload) return JSON.parse(String(data.payload));
    }
    return JSON.parse(e.postData.contents);
  } catch (err) {
    return null;
  }
}

function parseFormEncoded(body){
  try {
    const out = {};
    const pairs = String(body || '').split('&');
    for (let i = 0; i < pairs.length; i++) {
      const part = pairs[i];
      if (!part) continue;
      const idx = part.indexOf('=');
      const key = idx >= 0 ? part.slice(0, idx) : part;
      const val = idx >= 0 ? part.slice(idx + 1) : '';
      out[decodeURIComponent(key.replace(/\+/g, ' '))] = decodeURIComponent(val.replace(/\+/g, ' '));
    }
    return out;
  } catch (err) {
    return null;
  }
}

function dayRangeFromKey(dateKey, timezone){
  try {
    const parts = String(dateKey).split('-');
    if (parts.length !== 3) return null;
    const year = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    const day = Number(parts[2]);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
    const start = new Date(year, month, day, 0, 0, 0);
    const end = new Date(year, month, day, 23, 59, 59);
    return { start: start, end: end };
  } catch (err) {
    return null;
  }
}

function dateTimeFromKey(dateKey, timeLabel, timezone){
  try {
    const parts = String(dateKey).split('-');
    if (parts.length !== 3) return null;
    const t = String(timeLabel).split(':');
    if (t.length < 2) return null;
    const year = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    const day = Number(parts[2]);
    const hour = Number(t[0]);
    const minute = Number(t[1]);
    if ([year, month, day, hour, minute].some(Number.isNaN)) return null;
    return new Date(year, month, day, hour, minute, 0);
  } catch (err) {
    return null;
  }
}

function eventsToBlockedMinutes(events, dayStart, timezone){
  const blocked = [];
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + (24 * 60 * 60 * 1000);
  events.forEach(function(event){
    const isAllDay = event.isAllDayEvent();
    if (isAllDay) {
      blocked.push({ start: 0, end: 1440 });
      return;
    }
    const start = event.getStartTime();
    const end = event.getEndTime();
    const startMin = clampMinuteRange(Math.round((start.getTime() - dayStartMs) / 60000));
    const endMin = clampMinuteRange(Math.round((end.getTime() - dayStartMs) / 60000));
    const returnMin = getReturnOverrideMinutes(event) || 0;
    const endWithReturn = Math.min(1440, endMin + returnMin);
    if (endWithReturn > 0 && startMin < 1440) {
      blocked.push({ start: Math.max(0, startMin), end: endWithReturn });
    }
  });
  return blocked;
}

function clampMinuteRange(value){
  if (value < 0) return 0;
  if (value > 1440) return 1440;
  return value;
}

function getReturnOverrideMinutes(event){
  try {
    const desc = String(event.getDescription() || '');
    const title = String(event.getTitle() || '');
    const match = (desc.match(/return\s*[:=]\s*(\d+)/i) || title.match(/return\s*[:=]\s*(\d+)/i));
    if (!match) return 0;
    return Number(match[1] || 0) || 0;
  } catch (err) {
    return 0;
  }
}

function buildEventDescription(payload, adminData){
  try {
    const customer = payload.customer || {};
    const quote = payload.quote || {};
    const route = quote.route || {};
    const lines = [];
    if (payload && payload.reference) {
      lines.push('Reference: ' + String(payload.reference || ''));
      lines.push('');
    }
    lines.push('Customer');
    lines.push('Name: ' + String(customer.name || ''));
    lines.push('Email: ' + String(customer.email || ''));
    lines.push('Phone: ' + String(customer.phone || ''));
    lines.push('');
    lines.push('Schedule');
    lines.push('Date: ' + String((quote.schedule && quote.schedule.date) || ''));
    lines.push('Time: ' + String((quote.schedule && quote.schedule.time) || ''));
    lines.push('');
    lines.push('Route');
    lines.push('Pickup: ' + String((route.pickup && route.pickup.address) || ''));
    if (Array.isArray(route.stops) && route.stops.length) {
      route.stops.forEach(function(stop, idx){
        lines.push('Stop ' + (idx + 1) + ': ' + String((stop && stop.address) || ''));
      });
    }
    lines.push('Dropoff: ' + String((route.dropoff && route.dropoff.address) || ''));
    lines.push('');
    lines.push('Quote');
    lines.push('Total: ' + String(quote.total || ''));
    lines.push('ETA (mins): ' + String(quote.etaMins || ''));
    lines.push('Distance (km): ' + String(quote.totalKm || ''));
    lines.push('');
    if (payload.notes) {
      lines.push('Notes');
      lines.push(String(payload.notes || ''));
      lines.push('');
    }
    if (payload && payload.paymentUrl) {
      lines.push('Payment');
      lines.push(String(payload.paymentUrl || ''));
      lines.push('');
    }
    if (payload && payload.whatsappUrl) {
      lines.push('WhatsApp');
      lines.push(String(payload.whatsappUrl || ''));
      lines.push('');
    }
    if (payload && payload.trackingUrl) {
      lines.push('Tracking');
      lines.push(String(payload.trackingUrl || ''));
      lines.push('');
    }
    if (adminData) {
      lines.push(ADMIN_DATA_START);
      lines.push(JSON.stringify(adminData));
      lines.push(ADMIN_DATA_END);
      lines.push('');
    }
    lines.push('Raw JSON');
    lines.push(JSON.stringify(payload));
    return lines.join('\n');
  } catch (err) {
    return 'Booking payload unavailable.';
  }
}

function buildDefaultAdminData(payload, payment, trackingUrl, updatesPreference){
  const paymentUrl = payload && payload.paymentUrl ? String(payload.paymentUrl) : '';
  const paymentStatus = paymentUrl ? 'pending' : 'none';
  return {
    status: DEFAULT_STATUS_LABEL,
    paymentStatus: paymentStatus,
    paymentUrl: paymentUrl,
    updatesPreference: updatesPreference || '',
    trackingUrl: trackingUrl || '',
    podUrl: '',
    timeline: []
  };
}

function buildTrackingUrl(payload, shortRef){
  try {
    const sourceUrl = String(payload && payload.sourceUrl || '').trim();
    const originMatch = sourceUrl.match(/^https?:\/\/[^/]+/i);
    const origin = originMatch ? originMatch[0] : '';
    const base = origin || 'https://cargoworks.es';
    return base.replace(/\/$/, '') + '/tracking.html?ref=' + encodeURIComponent(shortRef);
  } catch (err) {
    return 'https://cargoworks.es/tracking.html?ref=' + encodeURIComponent(shortRef);
  }
}

function buildWhatsAppUrl(shortRef){
  try {
    const ref = String(shortRef || '').trim();
    if (!ref) return '';
    const message = WHATSAPP_DEFAULT_MESSAGE + ref.toLowerCase() + '.';
    return 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(message);
  } catch (err) {
    return '';
  }
}

function buildShortRef(){
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return 'CW-' + y + m + d + '-' + rand;
}

function createStripeSession(payload, shortRef){
  try {
    const secret = getStripeSecret();
    if (!secret) return null;
    const quote = payload.quote || {};
    const total = Number(quote.total || 0) || 0;
    if (!total || total <= 0) return null;
    const currency = 'eur';
    const amount = Math.round(total * 100);
    const sourceUrl = String(payload.sourceUrl || '').trim();
    const origin = sourceUrl ? sourceUrl.replace(/\/#.*$/, '').replace(/\?.*$/, '') : '';
    const successUrl = origin ? (origin + '?booking=success&ref=' + encodeURIComponent(shortRef)) : 'https://cargoworks.es/?booking=success';
    const cancelUrl = origin ? (origin + '?booking=cancel&ref=' + encodeURIComponent(shortRef)) : 'https://cargoworks.es/?booking=cancel';
    const name = (payload.customer && payload.customer.name) ? String(payload.customer.name) : 'Cargoworks booking';
    const email = (payload.customer && payload.customer.email) ? String(payload.customer.email) : '';
    const body = {
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      'line_items[0][price_data][currency]': currency,
      'line_items[0][price_data][unit_amount]': String(amount),
      'line_items[0][price_data][product_data][name]': 'Cargoworks booking - ' + name,
      'line_items[0][quantity]': '1',
      'metadata[reference]': shortRef
    };
    if (email) body.customer_email = email;
    const resp = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'post',
      payload: body,
      headers: { 'Authorization': 'Bearer ' + secret },
      muteHttpExceptions: true
    });
    const status = resp.getResponseCode();
    const text = resp.getContentText();
    let json = null;
    try { json = JSON.parse(text); } catch(_) { json = null; }
    if (status < 200 || status >= 300) {
      const errMsg = (json && json.error && json.error.message) ? json.error.message : text;
      return { error: 'Stripe error ' + status + ': ' + String(errMsg || '').slice(0, 200) };
    }
    if (!json || !json.url) return { error: 'Stripe session missing URL' };
    return { url: json.url, id: json.id };
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err || 'Unknown error');
    return { error: 'Stripe request failed: ' + msg };
  }
}

function getStripeSecret(){
  try {
    const props = PropertiesService.getScriptProperties();
    return String(props.getProperty(STRIPE_SECRET_PROPERTY) || '').trim();
  } catch (err) {
    return '';
  }
}

function sendEmails(payload, shortRef, paymentUrl, whatsappUrl, eventLink){
  const status = { clientSent: false, ownerSent: false };
  try {
    const customer = payload.customer || {};
    const customerEmail = String(customer.email || '').trim();
    const name = String(customer.name || '').trim();
    const quote = payload.quote || {};
    const total = Number(quote.total || 0) || 0;
    const totalLabel = 'EUR ' + total.toFixed(2);
    const trackingUrl = String(payload.trackingUrl || '').trim();

    const subjectClient = 'Cargoworks - Solicitud recibida (' + shortRef + ')';
    const subjectOwner = 'Nueva solicitud - ' + shortRef + ' (pendiente de pago)';

    const linesClient = [];
    linesClient.push('Hola ' + (name || ''));
    linesClient.push('');
    linesClient.push('Gracias por confiar en Cargoworks. Hemos recibido tu solicitud.');
    linesClient.push('Para confirmar la reserva, completa el pago:');
    if (paymentUrl) linesClient.push(paymentUrl);
    if (whatsappUrl) {
      linesClient.push('O abre WhatsApp con tu referencia lista:');
      linesClient.push(whatsappUrl);
    }
    linesClient.push('');
    linesClient.push('Referencia: ' + shortRef);
    linesClient.push('Importe: ' + totalLabel);
    if (trackingUrl) linesClient.push('Tracking: ' + trackingUrl);
    linesClient.push('');
    linesClient.push('Si necesitas ayuda, responde a este correo.');

    const linesOwner = [];
    linesOwner.push('Nueva solicitud recibida (pendiente de pago)');
    linesOwner.push('Referencia: ' + shortRef);
    linesOwner.push('Importe: ' + totalLabel);
    if (paymentUrl) linesOwner.push('Pago: ' + paymentUrl);
    if (whatsappUrl) linesOwner.push('WhatsApp: ' + whatsappUrl);
    if (eventLink) linesOwner.push('Evento: ' + eventLink);
    if (trackingUrl) linesOwner.push('Tracking: ' + trackingUrl);
    linesOwner.push('');
    linesOwner.push(buildEventDescription(Object.assign({}, payload, {
      reference: shortRef,
      paymentUrl: paymentUrl || ''
    })));

    if (customerEmail) {
      try {
        MailApp.sendEmail({
          to: customerEmail,
          subject: subjectClient,
          body: linesClient.join('\n'),
          replyTo: REPLY_TO
        });
        status.clientSent = true;
      } catch (err) {
        status.clientSent = false;
      }
    }
    if (OWNER_EMAIL) {
      try {
        MailApp.sendEmail({
          to: OWNER_EMAIL,
          subject: subjectOwner,
          body: linesOwner.join('\n')
        });
        status.ownerSent = true;
      } catch (err) {
        status.ownerSent = false;
      }
    }
  } catch (err) {
    status.error = 'Email send failed';
  }
  return status;
}

function getPickupAddress(quote){
  try {
    const route = quote && quote.route ? quote.route : {};
    return String((route.pickup && route.pickup.address) || '');
  } catch (err) {
    return '';
  }
}

function jsonResponse(obj, statusCode){
  const payload = Object.assign({}, obj || {}, { status: statusCode || 200, build: BUILD_ID });
  const output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function handleTrackingGet(params){
  try {
    const ref = String(params.ref || '').trim();
    if (!ref) return jsonResponse({ error: 'Missing ref' }, 400);
    const event = findEventByReference(ref);
    if (!event) return jsonResponse({ error: 'Not found' }, 404);
    const summary = buildOrderSummary(event);
    if (!summary) return jsonResponse({ error: 'Not found' }, 404);
    return jsonResponse({ order: buildTrackingPayload(summary) }, 200);
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err || 'Unknown error');
    return jsonResponse({ error: 'Server error', detail: msg }, 500);
  }
}

function handleAdminList(params){
  try {
    if (!isAdminAuthorized(String(params.token || '').trim())) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const dateKey = String(params.date || '').trim();
    if (!dateKey) return jsonResponse({ error: 'Missing date parameter' }, 400);
    const range = dayRangeFromKey(dateKey, TIMEZONE);
    if (!range) return jsonResponse({ error: 'Invalid date parameter' }, 400);
    const cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) return jsonResponse({ error: 'Calendar not found' }, 404);
    const events = cal.getEvents(range.start, range.end);
    const orders = events.map(function(event){
      return buildOrderSummary(event);
    }).filter(Boolean);
    return jsonResponse({ orders: orders }, 200);
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err || 'Unknown error');
    return jsonResponse({ error: 'Server error', detail: msg }, 500);
  }
}

function handleAdminPost(payload){
  if (!isAdminAuthorized(String(payload.token || '').trim())) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  const action = String(payload.action || '').trim();
  if (action === 'adminUpdate') return handleAdminUpdate(payload);
  if (action === 'adminPod') return handleAdminPod(payload);
  return jsonResponse({ error: 'Unknown action' }, 400);
}

function handleAdminUpdate(payload){
  try {
    const eventId = String(payload.eventId || '').trim();
    if (!eventId) return jsonResponse({ error: 'Missing eventId' }, 400);
    const cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) return jsonResponse({ error: 'Calendar not found' }, 404);
    const event = cal.getEventById(eventId);
    if (!event) return jsonResponse({ error: 'Event not found' }, 404);
    const desc = String(event.getDescription() || '');
    const payloadData = extractPayloadFromDescription(desc) || {};
    const adminData = ensureAdminData(desc, payloadData);
    const status = String(payload.status || '').trim();
    const paymentStatus = String(payload.paymentStatus || '').trim();
    if (status) adminData.status = status;
    if (paymentStatus) adminData.paymentStatus = paymentStatus;
    const message = String(payload.message || '').trim();
    const send = payload.send || {};
    const sendEmail = !!send.email;
    const sendWhatsApp = !!send.whatsapp;
    const now = new Date();
    const ts = now.toISOString();
    const updateResult = { emailSent: false, whatsappUrl: '' };
    if (message) {
      const via = [];
      if (sendEmail) via.push('email');
      if (sendWhatsApp) via.push('whatsapp');
      adminData.timeline = Array.isArray(adminData.timeline) ? adminData.timeline : [];
      adminData.timeline.push({ ts: ts, status: adminData.status || '', message: message, via: via.join('+') });
      adminData.lastUpdateAt = ts;
      if (sendEmail && canSendChannel('email', adminData, payloadData)) {
        updateResult.emailSent = sendProgressEmail(payloadData, adminData, message);
      }
      if (sendWhatsApp && canSendChannel('whatsapp', adminData, payloadData)) {
        updateResult.whatsappUrl = buildCustomerWhatsAppUrl(payloadData, adminData, message);
      }
    }
    const updatedDesc = upsertAdminData(desc, adminData);
    event.setDescription(updatedDesc);
    if (status) setEventStatusTitle(event, status);
    return jsonResponse({ ok: true, adminData: adminData, send: updateResult }, 200);
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err || 'Unknown error');
    return jsonResponse({ error: 'Server error', detail: msg }, 500);
  }
}

function handleAdminPod(payload){
  try {
    const eventId = String(payload.eventId || '').trim();
    if (!eventId) return jsonResponse({ error: 'Missing eventId' }, 400);
    const data = String(payload.data || '').trim();
    if (!data) return jsonResponse({ error: 'Missing file data' }, 400);
    const cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) return jsonResponse({ error: 'Calendar not found' }, 404);
    const event = cal.getEventById(eventId);
    if (!event) return jsonResponse({ error: 'Event not found' }, 404);
    const desc = String(event.getDescription() || '');
    const payloadData = extractPayloadFromDescription(desc) || {};
    const adminData = ensureAdminData(desc, payloadData);
    const fileName = String(payload.fileName || 'pod-photo.jpg').trim();
    const contentType = String(payload.contentType || 'image/jpeg').trim();
    const base64 = data.indexOf('base64,') >= 0 ? data.split('base64,').pop() : data;
    const blob = Utilities.newBlob(Utilities.base64Decode(base64), contentType, fileName);
    const folder = ensurePodFolder();
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const podUrl = file.getUrl();
    adminData.podUrl = podUrl;
    adminData.timeline = Array.isArray(adminData.timeline) ? adminData.timeline : [];
    adminData.timeline.push({ ts: new Date().toISOString(), status: adminData.status || '', message: 'POD uploaded', via: 'system' });
    const updatedDesc = upsertAdminData(desc, adminData);
    event.setDescription(updatedDesc);
    return jsonResponse({ ok: true, podUrl: podUrl, adminData: adminData }, 200);
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err || 'Unknown error');
    return jsonResponse({ error: 'Server error', detail: msg }, 500);
  }
}

function ensurePodFolder(){
  const props = PropertiesService.getScriptProperties();
  const existingId = String(props.getProperty(POD_FOLDER_PROPERTY) || '').trim();
  if (existingId) {
    try { return DriveApp.getFolderById(existingId); } catch(_) {}
  }
  const folder = DriveApp.createFolder('Cargoworks POD');
  props.setProperty(POD_FOLDER_PROPERTY, folder.getId());
  return folder;
}

function isAdminAuthorized(token){
  const expected = String(getAdminToken() || '').trim();
  return !!expected && token === expected;
}

function getAdminToken(){
  try {
    const props = PropertiesService.getScriptProperties();
    return String(props.getProperty(ADMIN_TOKEN_PROPERTY) || '').trim();
  } catch (err) {
    return '';
  }
}

function extractPayloadFromDescription(desc){
  try {
    const lines = String(desc || '').split('\n');
    const idx = lines.indexOf('Raw JSON');
    if (idx >= 0) {
      for (let i = idx + 1; i < lines.length; i++) {
        const line = String(lines[i] || '').trim();
        if (!line) continue;
        try { return JSON.parse(line); } catch(_) {}
      }
    }
    for (let j = 0; j < lines.length; j++) {
      const line = String(lines[j] || '').trim();
      if (line.charAt(0) === '{' && line.charAt(line.length - 1) === '}') {
        try { return JSON.parse(line); } catch(_) {}
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

function extractAdminData(desc){
  try {
    const text = String(desc || '');
    const start = text.indexOf(ADMIN_DATA_START);
    const end = text.indexOf(ADMIN_DATA_END);
    if (start < 0 || end < 0 || end <= start) return null;
    const jsonText = text.slice(start + ADMIN_DATA_START.length, end).trim();
    if (!jsonText) return null;
    return JSON.parse(jsonText);
  } catch (err) {
    return null;
  }
}

function ensureAdminData(desc, payload){
  const adminData = extractAdminData(desc) || {};
  if (!adminData.status) adminData.status = DEFAULT_STATUS_LABEL;
  if (!adminData.paymentStatus) {
    const paymentUrl = payload && payload.paymentUrl ? String(payload.paymentUrl) : '';
    adminData.paymentStatus = paymentUrl ? 'pending' : 'none';
  }
  if (!adminData.paymentUrl) {
    const paymentUrl = payload && payload.paymentUrl ? String(payload.paymentUrl) : '';
    if (paymentUrl) adminData.paymentUrl = paymentUrl;
  }
  if (!adminData.trackingUrl) {
    const ref = payload && payload.reference ? String(payload.reference) : '';
    adminData.trackingUrl = ref ? buildTrackingUrl(payload || {}, ref) : '';
  }
  if (!Array.isArray(adminData.timeline)) adminData.timeline = [];
  return adminData;
}

function upsertAdminData(desc, adminData){
  const block = ADMIN_DATA_START + '\n' + JSON.stringify(adminData) + '\n' + ADMIN_DATA_END;
  const text = String(desc || '');
  if (text.indexOf(ADMIN_DATA_START) >= 0 && text.indexOf(ADMIN_DATA_END) >= 0) {
    const re = new RegExp(ADMIN_DATA_START + '[\\s\\S]*?' + ADMIN_DATA_END, 'g');
    return text.replace(re, block);
  }
  const lines = text.split('\n');
  const idx = lines.indexOf('Raw JSON');
  if (idx >= 0) {
    const head = lines.slice(0, idx).join('\n');
    const tail = lines.slice(idx).join('\n');
    return head + '\n' + block + '\n' + tail;
  }
  return text + '\n\n' + block;
}

function buildOrderSummary(event){
  try {
    const desc = String(event.getDescription() || '');
    const payload = extractPayloadFromDescription(desc) || {};
    const adminData = ensureAdminData(desc, payload);
    const reference = payload.reference || extractReferenceFromText(event.getTitle() || '') || '';
    const start = event.getStartTime();
    const end = event.getEndTime();
    const schedule = {
      date: formatDateKey(start),
      time: formatTimeLabel(start),
      startIso: start ? start.toISOString() : '',
      endIso: end ? end.toISOString() : ''
    };
    const customer = payload.customer || {};
    return {
      eventId: event.getId(),
      reference: reference,
      title: event.getTitle(),
      status: adminData.status || DEFAULT_STATUS_LABEL,
      paymentStatus: adminData.paymentStatus || '',
      paymentUrl: adminData.paymentUrl || payload.paymentUrl || '',
      trackingUrl: adminData.trackingUrl || payload.trackingUrl || '',
      updatesPreference: adminData.updatesPreference || payload.updatesPreference || '',
      podUrl: adminData.podUrl || '',
      timeline: adminData.timeline || [],
      schedule: schedule,
      customer: {
        name: String(customer.name || ''),
        email: String(customer.email || ''),
        phone: String(customer.phone || '')
      },
      route: payload.quote && payload.quote.route ? payload.quote.route : null,
      notes: String(payload.notes || '')
    };
  } catch (err) {
    return null;
  }
}

function buildTrackingPayload(summary){
  return {
    reference: summary.reference,
    status: summary.status,
    paymentStatus: summary.paymentStatus,
    paymentUrl: summary.paymentUrl,
    trackingUrl: summary.trackingUrl,
    podUrl: summary.podUrl,
    schedule: summary.schedule,
    timeline: summary.timeline || [],
    customerName: summary.customer && summary.customer.name ? summary.customer.name : ''
  };
}

function extractReferenceFromText(text){
  const match = String(text || '').match(/CW-\d{8}-[A-Z0-9]{4}/i);
  return match ? String(match[0]).toUpperCase() : '';
}

function findEventByReference(ref){
  try {
    const reference = String(ref || '').trim().toUpperCase();
    if (!reference) return null;
    const cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) return null;
    const date = dateFromRef(reference);
    if (date) {
      const range = dayRangeFromKey(formatDateKey(date), TIMEZONE);
      if (range) {
        const events = cal.getEvents(range.start, range.end, { search: reference });
        if (events && events.length) return events[0];
      }
      const start = new Date(date.getTime() - (7 * 24 * 60 * 60 * 1000));
      const end = new Date(date.getTime() + (7 * 24 * 60 * 60 * 1000));
      const more = cal.getEvents(start, end, { search: reference });
      if (more && more.length) return more[0];
    }
    const wideStart = new Date(new Date().getTime() - (90 * 24 * 60 * 60 * 1000));
    const wideEnd = new Date(new Date().getTime() + (90 * 24 * 60 * 60 * 1000));
    const events = cal.getEvents(wideStart, wideEnd, { search: reference });
    return events && events.length ? events[0] : null;
  } catch (err) {
    return null;
  }
}

function dateFromRef(ref){
  try {
    const match = String(ref || '').match(/CW-(\d{4})(\d{2})(\d{2})-/i);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    if ([year, month, day].some(Number.isNaN)) return null;
    return new Date(year, month, day, 0, 0, 0);
  } catch (err) {
    return null;
  }
}

function formatDateKey(date){
  const d = date instanceof Date ? date : new Date(date);
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function formatTimeLabel(date){
  const d = date instanceof Date ? date : new Date(date);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return h + ':' + m;
}

function setEventStatusTitle(event, status){
  try {
    const title = String(event.getTitle() || '');
    const marker = ' - Cargoworks booking - ';
    if (title.indexOf(marker) >= 0) {
      const rest = title.split(marker).slice(1).join(marker);
      event.setTitle(status + marker + rest);
      return;
    }
    event.setTitle(status + ' - ' + title);
  } catch (err) {
    // Ignore title updates
  }
}

function canSendChannel(channel, adminData, payload){
  const pref = String((adminData && adminData.updatesPreference) || (payload && payload.updatesPreference) || '').trim().toLowerCase();
  if (!pref) return true;
  if (pref === 'none') return false;
  return pref === channel;
}

function sendProgressEmail(payload, adminData, message){
  try {
    const customer = payload && payload.customer ? payload.customer : {};
    const email = String(customer.email || '').trim();
    if (!email) return false;
    const reference = String(payload.reference || '').trim();
    const subject = 'Cargoworks update (' + reference + ')';
    const lines = [];
    if (customer.name) lines.push('Hola ' + String(customer.name || '') + ',');
    lines.push('');
    lines.push('Update: ' + message);
    if (adminData && adminData.status) lines.push('Status: ' + adminData.status);
    if (adminData && adminData.paymentStatus) lines.push('Payment: ' + adminData.paymentStatus);
    if (payload.paymentUrl && adminData && adminData.paymentStatus === 'pending') lines.push('Payment link: ' + payload.paymentUrl);
    if (adminData && adminData.trackingUrl) lines.push('Tracking: ' + adminData.trackingUrl);
    if (adminData && adminData.podUrl) lines.push('POD: ' + adminData.podUrl);
    lines.push('');
    lines.push('Cargoworks');
    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: lines.join('\n'),
      replyTo: REPLY_TO
    });
    return true;
  } catch (err) {
    return false;
  }
}

function buildCustomerWhatsAppUrl(payload, adminData, message){
  try {
    const customer = payload && payload.customer ? payload.customer : {};
    const phone = normalizePhone(String(customer.phone || ''));
    if (!phone) return '';
    const reference = String(payload.reference || '').trim();
    const parts = [];
    parts.push('Cargoworks update ' + reference + ': ' + message);
    if (adminData && adminData.status) parts.push('Status: ' + adminData.status);
    if (adminData && adminData.trackingUrl) parts.push('Tracking: ' + adminData.trackingUrl);
    if (adminData && adminData.podUrl) parts.push('POD: ' + adminData.podUrl);
    if (payload.paymentUrl && adminData && adminData.paymentStatus === 'pending') parts.push('Payment: ' + payload.paymentUrl);
    const text = parts.join(' | ');
    return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text);
  } catch (err) {
    return '';
  }
}

function normalizePhone(value){
  try {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits;
  } catch (err) {
    return '';
  }
}

function setLastError(tag, message){
  try {
    const props = PropertiesService.getScriptProperties();
    props.setProperty(LAST_ERROR_PROPERTY, '[' + tag + '] ' + message);
  } catch (err) {
    // Ignore logging failures
  }
}

function clearLastError(){
  try {
    const props = PropertiesService.getScriptProperties();
    props.setProperty(LAST_ERROR_PROPERTY, '');
  } catch (err) {
    // Ignore logging failures
  }
}

function setLastPayload(payload){
  try {
    const props = PropertiesService.getScriptProperties();
    const text = JSON.stringify(payload);
    props.setProperty(LAST_PAYLOAD_PROPERTY, text.slice(0, 8000));
  } catch (err) {
    // Ignore logging failures
  }
}

function getLastError(){
  try {
    const props = PropertiesService.getScriptProperties();
    return String(props.getProperty(LAST_ERROR_PROPERTY) || '').trim();
  } catch (err) {
    return '';
  }
}

function getLastPayload(){
  try {
    const props = PropertiesService.getScriptProperties();
    return String(props.getProperty(LAST_PAYLOAD_PROPERTY) || '').trim();
  } catch (err) {
    return '';
  }
}
