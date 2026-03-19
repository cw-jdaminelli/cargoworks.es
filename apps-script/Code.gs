// Cargoworks booking API (Google Apps Script)
// Deploy as a Web App: Execute as Me, access: Anyone.

const CALENDAR_ID = 'primary';
const TIMEZONE = 'Europe/Madrid';
const DEFAULT_DURATION_MIN = 60;
const OWNER_EMAIL = 'info@cargoworks.es';
const REPLY_TO = 'info@cargoworks.es';
const STRIPE_SECRET_PROPERTY = 'STRIPE_SECRET';
const STRIPE_PUBLISHABLE_PROPERTY = 'STRIPE_PUBLISHABLE';
const LAST_ERROR_PROPERTY = 'LAST_ERROR';
const LAST_PAYLOAD_PROPERTY = 'LAST_PAYLOAD';
const ADMIN_TOKEN_PROPERTY = 'ADMIN_TOKEN';
const POD_FOLDER_PROPERTY = 'POD_FOLDER_ID';
const ORDERS_LOG_SHEET_PROPERTY = 'ORDERS_LOG_SHEET_ID';
const ORDERS_LOG_SPREADSHEET_NAME = 'Cargoworks Orders Log';
const ORDERS_LOG_TAB_NAME = 'OrdersLog';
const ADMIN_DATA_START = '--- ADMIN DATA ---';
const ADMIN_DATA_END = '--- END ADMIN DATA ---';
const DEFAULT_STATUS_LABEL = 'Confirmed';
const BUILD_ID = '2026-03-19-1';
const WHATSAPP_NUMBER = '34608081955';
const WHATSAPP_DEFAULT_MESSAGE = 'Hola Cargoworks, necesito ayuda con mi pedido numero ';
const ORDER_STATUS_VALUES = ['Confirmed', 'Assigned', 'Picked up', 'In transit', 'Delivered', 'Failed', 'Canceled', 'Delivery rejected'];
const PAYMENT_STATUS_VALUES = ['Paid', 'Pending', 'Failed'];

function normalizeOrderStatus(value){
  const raw = String(value || '').trim();
  if (!raw) return '';
  const map = {
    'confirmed': 'Confirmed',
    'assigned': 'Assigned',
    'picked up': 'Picked up',
    'picked-up': 'Picked up',
    'in transit': 'In transit',
    'in-transit': 'In transit',
    'delivered': 'Delivered',
    'failed': 'Failed',
    'canceled': 'Canceled',
    'cancelled': 'Canceled',
    'delivery rejected': 'Delivery rejected',
    'delivery-rejected': 'Delivery rejected',
    // Legacy values kept for backward compatibility.
    'pending payment': 'Confirmed',
    'issue': 'Failed'
  };
  const normalized = map[raw.toLowerCase()];
  if (!normalized) return '';
  return ORDER_STATUS_VALUES.indexOf(normalized) >= 0 ? normalized : '';
}

function normalizePaymentStatus(value, hasPaymentUrl){
  const raw = String(value || '').trim();
  // Keep unpaid orders in a recoverable state by default.
  const fallback = 'Pending';
  if (!raw) return fallback;
  const key = raw.toLowerCase();
  if (key === 'paid') return 'Paid';
  if (key === 'pending') return 'Pending';
  if (key === 'failed') return 'Failed';
  // Legacy value kept for backward compatibility.
  if (key === 'none') return fallback;
  return '';
}

function normalizePaymentOutcome(value){
  const key = String(value || '').trim().toLowerCase();
  if (!key) return '';
  if (key === 'success' || key === 'succeeded' || key === 'paid') return 'success';
  if (key === 'failed' || key === 'failure' || key === 'error') return 'failed';
  if (key === 'pending' || key === 'return' || key === 'cancel' || key === 'canceled' || key === 'cancelled') return 'pending';
  return '';
}

function paymentStatusFromOutcome(outcome){
  const normalized = normalizePaymentOutcome(outcome);
  if (normalized === 'success') return 'Paid';
  if (normalized === 'failed') return 'Failed';
  if (normalized === 'pending') return 'Pending';
  return '';
}

function doGet(e){
  try {
    const params = e && e.parameter ? e.parameter : {};
    if (String(params.debug || '') === '1') {
      if (!isAdminAuthorized(String(params.token || '').trim())) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      return jsonResponse({
        lastError: getLastError(),
        lastPayload: getLastPayload()
      }, 200);
    }
    const action = String(params.action || '').trim();
    if (action === 'track') {
      return handleTrackingGet(params);
    }
    if (action === 'adminList' || action === 'adminSheetInfo' || action === 'adminBackfillLog') {
      return jsonResponse({ error: 'Use POST for admin actions' }, 405);
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
      const action = String(payload.action || '').trim();
      if (action === 'paymentReturn') return handlePaymentReturn(payload);
      if (action === 'adminList') return handleAdminList(payload);
      if (action === 'adminSheetInfo') return handleAdminSheetInfo(payload);
      if (action === 'adminBackfillLog') return handleAdminBackfill(payload);
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
    const promoValidation = validatePromoRedemption(payload);
    if (!promoValidation.ok) {
      return jsonResponse({ error: promoValidation.error || 'Promo code redemption not allowed' }, 400);
    }
    const name = String(customer.name || '').trim() || 'Customer';
    const shortRef = buildShortRef(dateKey);
    const title = DEFAULT_STATUS_LABEL + ' - Cargoworks booking - ' + name + ' - ' + shortRef;

    const cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) return jsonResponse({ error: 'Calendar not found' }, 404);

    const location = getPickupAddress(quote);
    const trackingToken = generatePublicToken(24);
    const payment = createStripeSession(payload, shortRef, trackingToken);
    const publishableKey = getStripePublishableKey();
    const whatsappUrl = buildWhatsAppUrl(shortRef);
    const trackingUrl = buildTrackingUrl(payload, shortRef, trackingToken);
    const updatesPreference = String(payload.updatesPreference || '').trim();
    const enrichedPayload = Object.assign({}, payload, {
      reference: shortRef,
      paymentUrl: payment && payment.url ? payment.url : '',
      paymentClientSecret: payment && payment.clientSecret ? payment.clientSecret : '',
      paymentMode: payment && payment.mode ? payment.mode : '',
      paymentPublishableKey: publishableKey,
      whatsappUrl: whatsappUrl,
      trackingUrl: trackingUrl,
      updatesPreference: updatesPreference
    });
    const adminData = buildDefaultAdminData(enrichedPayload, payment, trackingUrl, updatesPreference, trackingToken);
    const description = buildEventDescription(enrichedPayload, adminData);

    const event = cal.createEvent(title, start, end, {
      description: description,
      location: location
    });

    const eventId = event.getId();
    const mailStatus = sendOwnerRequestEmail(enrichedPayload, shortRef, payment && payment.url, whatsappUrl, '');
    appendOrderLogEntry({
      action: 'booking_created',
      eventId: eventId,
      payload: enrichedPayload,
      adminData: adminData,
      status: adminData.status,
      paymentStatus: adminData.paymentStatus,
      message: 'Booking created via web app',
      build: BUILD_ID
    });
    const link = '';
    clearLastError();
    return jsonResponse({
      reference: shortRef,
      link: link,
      paymentUrl: payment && payment.url,
      paymentClientSecret: payment && payment.clientSecret,
      paymentMode: payment && payment.mode,
      paymentPublishableKey: publishableKey,
      whatsappUrl: whatsappUrl,
      trackingUrl: trackingUrl,
      paymentError: payment && payment.error ? payment.error : '',
      paymentEmbeddedError: payment && payment.embeddedError ? payment.embeddedError : '',
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
    const contentType = String((e.postData && e.postData.type) || '').toLowerCase();
    if (contentType.indexOf('application/x-www-form-urlencoded') >= 0) {
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

function buildDefaultAdminData(payload, payment, trackingUrl, updatesPreference, trackingToken){
  const paymentUrl = payload && payload.paymentUrl ? String(payload.paymentUrl) : '';
  const paymentStatus = normalizePaymentStatus('', !!paymentUrl);
  return {
    status: DEFAULT_STATUS_LABEL,
    paymentStatus: paymentStatus,
    paymentUrl: paymentUrl,
    updatesPreference: updatesPreference || '',
    trackingUrl: trackingUrl || '',
    trackingToken: String(trackingToken || '').trim(),
    rider: { name: '', phone: '' },
    internalNotes: '',
    createdBy: 'system',
    lastEditedBy: 'system',
    podUrl: '',
    timeline: [{
      ts: new Date().toISOString(),
      status: DEFAULT_STATUS_LABEL,
      message: 'Booking created',
      via: 'system'
    }]
  };
}

function buildTrackingUrl(payload, shortRef, trackingToken){
  try {
    const sourceUrl = String(payload && payload.sourceUrl || '').trim();
    const originMatch = sourceUrl.match(/^https?:\/\/[^/]+/i);
    const origin = originMatch ? originMatch[0] : '';
    const base = origin || 'https://cargoworks.es';
    const token = String(trackingToken || '').trim();
    const tokenParam = token ? ('&t=' + encodeURIComponent(token)) : '';
    return base.replace(/\/$/, '') + '/tracking.html?ref=' + encodeURIComponent(shortRef) + tokenParam;
  } catch (err) {
    const token = String(trackingToken || '').trim();
    const tokenParam = token ? ('&t=' + encodeURIComponent(token)) : '';
    return 'https://cargoworks.es/tracking.html?ref=' + encodeURIComponent(shortRef) + tokenParam;
  }
}

function generatePublicToken(length){
  const size = Math.max(8, Number(length || 24) || 24);
  try {
    const uuid = Utilities.getUuid().replace(/-/g, '');
    const now = Utilities.base64EncodeWebSafe(String(Date.now())).replace(/[^A-Za-z0-9]/g, '');
    const token = (uuid + now + uuid).slice(0, size);
    return token;
  } catch (_) {
    let out = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < size; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
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

function buildShortRef(scheduleDateKey){
  let y = '';
  let m = '';
  let d = '';
  const match = String(scheduleDateKey || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match && isValidDateParts(Number(match[1]), Number(match[2]), Number(match[3]))) {
    y = match[1];
    m = match[2];
    d = match[3];
  } else {
    const now = new Date();
    d = String(now.getDate()).padStart(2, '0');
    m = String(now.getMonth() + 1).padStart(2, '0');
    y = String(now.getFullYear());
  }
  const rand = generatePublicToken(8).toUpperCase();
  return 'CW-' + d + m + y + '-' + rand;
}

function createStripeSession(payload, shortRef, trackingToken){
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
    const tokenValue = String(trackingToken || '').trim();
    const tokenParam = tokenValue ? ('&t=' + encodeURIComponent(tokenValue)) : '';
    const successBase = origin ? (origin + '?booking=success&ref=' + encodeURIComponent(shortRef) + tokenParam) : 'https://cargoworks.es/?booking=success&ref=' + encodeURIComponent(shortRef) + tokenParam;
    const cancelBase = origin ? (origin + '?booking=cancel&ref=' + encodeURIComponent(shortRef) + tokenParam) : 'https://cargoworks.es/?booking=cancel&ref=' + encodeURIComponent(shortRef) + tokenParam;
    const returnBase = origin ? (origin + '?booking=return&ref=' + encodeURIComponent(shortRef) + tokenParam) : 'https://cargoworks.es/?booking=return&ref=' + encodeURIComponent(shortRef) + tokenParam;
    const successUrl = successBase + '&session_id={CHECKOUT_SESSION_ID}';
    const cancelUrl = cancelBase + '&session_id={CHECKOUT_SESSION_ID}';
    const returnUrl = returnBase + '&session_id={CHECKOUT_SESSION_ID}';
    const name = (payload.customer && payload.customer.name) ? String(payload.customer.name) : 'Cargoworks booking';
    const email = (payload.customer && payload.customer.email) ? String(payload.customer.email) : '';
    const baseBody = {
      mode: 'payment',
      'line_items[0][price_data][currency]': currency,
      'line_items[0][price_data][unit_amount]': String(amount),
      'line_items[0][price_data][product_data][name]': 'Cargoworks booking - ' + name,
      'line_items[0][quantity]': '1',
      'metadata[reference]': shortRef
    };
    if (email) baseBody.customer_email = email;

    const hostedBody = Object.assign({}, baseBody, {
      success_url: successUrl,
      cancel_url: cancelUrl
    });

    // Preferred flow: Embedded Checkout so the card UI can render inside the site.
    const embeddedBody = Object.assign({}, baseBody, {
      ui_mode: 'embedded',
      return_url: returnUrl,
      redirect_on_completion: 'if_required'
    });
    const embeddedAttempt = createStripeCheckoutSession(secret, embeddedBody);
    if (embeddedAttempt.ok && embeddedAttempt.session) {
      const embeddedSession = embeddedAttempt.session;
      let retryPaymentUrl = String(embeddedSession.url || '').trim();
      let retryPaymentError = '';
      // Embedded sessions may not expose a public URL. Create a hosted retry URL for tracking and payment recovery.
      if (!retryPaymentUrl) {
        const hostedRetryAttempt = createStripeCheckoutSession(secret, hostedBody);
        if (hostedRetryAttempt.ok && hostedRetryAttempt.session) {
          retryPaymentUrl = String(hostedRetryAttempt.session.url || '').trim();
        } else {
          retryPaymentError = String(hostedRetryAttempt.error || '').trim();
        }
      }
      return {
        id: embeddedSession.id || '',
        url: retryPaymentUrl,
        clientSecret: embeddedSession.client_secret || '',
        mode: 'embedded',
        embeddedError: retryPaymentError
      };
    }

    // Fallback: hosted Checkout URL.
    const hostedAttempt = createStripeCheckoutSession(secret, hostedBody);
    if (hostedAttempt.ok && hostedAttempt.session) {
      const hostedSession = hostedAttempt.session;
      return {
        id: hostedSession.id || '',
        url: hostedSession.url || '',
        clientSecret: hostedSession.client_secret || '',
        mode: 'hosted',
        error: embeddedAttempt.error || '',
        embeddedError: embeddedAttempt.error || ''
      };
    }
    return { error: hostedAttempt.error || embeddedAttempt.error || 'Stripe session could not be created' };
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err || 'Unknown error');
    return { error: 'Stripe request failed: ' + msg };
  }
}

function createStripeCheckoutSession(secret, body){
  try {
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
      return { ok: false, error: 'Stripe error ' + status + ': ' + String(errMsg || '').slice(0, 200) };
    }
    if (!json || !json.id) return { ok: false, error: 'Stripe session missing ID' };
    return { ok: true, session: json };
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err || 'Unknown error');
    return { ok: false, error: 'Stripe request failed: ' + msg };
  }
}

function fetchStripeCheckoutSession(secret, sessionId){
  try {
    const id = encodeURIComponent(String(sessionId || '').trim());
    if (!id) return { ok: false, error: 'Missing session ID' };
    const resp = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions/' + id, {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + secret },
      muteHttpExceptions: true
    });
    const status = resp.getResponseCode();
    const text = resp.getContentText();
    let json = null;
    try { json = JSON.parse(text); } catch(_) { json = null; }
    if (status < 200 || status >= 300) {
      const errMsg = (json && json.error && json.error.message) ? json.error.message : text;
      return { ok: false, error: 'Stripe error ' + status + ': ' + String(errMsg || '').slice(0, 200) };
    }
    if (!json || !json.id) return { ok: false, error: 'Stripe session missing ID' };
    return { ok: true, session: json };
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err || 'Unknown error');
    return { ok: false, error: 'Stripe request failed: ' + msg };
  }
}

function verifyStripeSessionForReference(reference, sessionId){
  const secret = getStripeSecret();
  if (!secret) return { ok: false, error: 'Stripe verification unavailable' };
  const sessionResult = fetchStripeCheckoutSession(secret, sessionId);
  if (!sessionResult.ok || !sessionResult.session) {
    return { ok: false, error: sessionResult.error || 'Stripe session unavailable' };
  }
  const session = sessionResult.session;
  const metadata = session && session.metadata ? session.metadata : {};
  const metadataRef = normalizeReference(metadata && metadata.reference || '');
  const expectedRef = normalizeReference(reference || '');
  if (!metadataRef || metadataRef !== expectedRef) {
    return { ok: false, error: 'Stripe session reference mismatch' };
  }
  const paymentStatusRaw = String(session && session.payment_status || '').trim().toLowerCase();
  const sessionStatusRaw = String(session && session.status || '').trim().toLowerCase();
  let paymentStatus = 'Pending';
  if (paymentStatusRaw === 'paid') {
    paymentStatus = 'Paid';
  } else if (sessionStatusRaw === 'expired') {
    paymentStatus = 'Failed';
  }
  return {
    ok: true,
    paymentStatus: paymentStatus,
    paymentStatusRaw: paymentStatusRaw,
    sessionStatusRaw: sessionStatusRaw,
    sessionId: String(session.id || '').trim()
  };
}

function getStripeSecret(){
  try {
    const props = PropertiesService.getScriptProperties();
    return String(props.getProperty(STRIPE_SECRET_PROPERTY) || '').trim();
  } catch (err) {
    return '';
  }
}

function getStripePublishableKey(){
  try {
    const props = PropertiesService.getScriptProperties();
    return String(props.getProperty(STRIPE_PUBLISHABLE_PROPERTY) || '').trim();
  } catch (err) {
    return '';
  }
}

function sendOwnerRequestEmail(payload, shortRef, paymentUrl, whatsappUrl, eventLink){
  const status = { ownerSent: false };
  try {
    const quote = payload.quote || {};
    const total = Number(quote.total || 0) || 0;
    const totalLabel = 'EUR ' + total.toFixed(2);
    const trackingUrl = String(payload.trackingUrl || '').trim();
    const subjectOwner = 'New booking request - ' + shortRef + ' (payment pending)';

    const linesOwner = [];
    linesOwner.push('New booking request received.');
    linesOwner.push('Reference: ' + shortRef);
    linesOwner.push('Amount: ' + totalLabel);
    if (paymentUrl) linesOwner.push('Payment: ' + paymentUrl);
    if (whatsappUrl) linesOwner.push('WhatsApp: ' + whatsappUrl);
    if (eventLink) linesOwner.push('Event: ' + eventLink);
    if (trackingUrl) linesOwner.push('Tracking: ' + trackingUrl);
    linesOwner.push('');
    linesOwner.push(buildEventDescription(Object.assign({}, payload, {
      reference: shortRef,
      paymentUrl: paymentUrl || ''
    })));

    if (OWNER_EMAIL) {
      MailApp.sendEmail({
        to: OWNER_EMAIL,
        subject: subjectOwner,
        body: linesOwner.join('\n')
      });
      status.ownerSent = true;
    }
  } catch (err) {
    status.error = 'Owner email send failed';
  }
  return status;
}

function emailLocaleFromLanguage(language){
  const key = String(language || '').trim().toLowerCase().slice(0, 2);
  if (key === 'es' || key === 'ca' || key === 'pt' || key === 'en') return key;
  return 'en';
}

function confirmationEmailCopy(locale){
  const dict = {
    en: {
      subject: 'Your Cargoworks delivery is confirmed - Order {ref}',
      header: 'Your delivery is booked 🚲',
      orderId: 'Order ID',
      trackIntro: 'You can track your delivery in real time.',
      trackButton: 'Track delivery',
      trackFallback: 'Tracking URL (if the button does not load):',
      summaryTitle: 'Delivery summary',
      pickup: 'Pickup address',
      dropoff: 'Dropoff address',
      pickupDate: 'Pickup date',
      pickupTime: 'Pickup time',
      updatesLine: 'We\'ll notify you when the rider is assigned and when the delivery is completed.',
      supportLine: 'If you need to update delivery details or have questions, contact us at info@cargoworks.es or through WhatsApp and include your order ID.'
    },
    es: {
      subject: 'Tu entrega Cargoworks está confirmada - Pedido {ref}',
      header: 'Tu entrega está reservada 🚲',
      orderId: 'ID de pedido',
      trackIntro: 'Puedes seguir tu entrega en tiempo real.',
      trackButton: 'Seguir entrega',
      trackFallback: 'URL de seguimiento (si el botón no se carga):',
      summaryTitle: 'Resumen de entrega',
      pickup: 'Dirección de recogida',
      dropoff: 'Dirección de entrega',
      pickupDate: 'Fecha de recogida',
      pickupTime: 'Hora de recogida',
      updatesLine: 'Te avisaremos cuando se asigne el rider y cuando la entrega se complete.',
      supportLine: 'Si necesitas actualizar datos de la entrega o tienes preguntas, contáctanos en info@cargoworks.es o por WhatsApp e incluye tu ID de pedido.'
    },
    ca: {
      subject: 'La teva entrega de Cargoworks està confirmada - Comanda {ref}',
      header: 'La teva entrega està reservada 🚲',
      orderId: 'ID de comanda',
      trackIntro: 'Pots fer seguiment de l\'entrega en temps real.',
      trackButton: 'Seguiment de l\'entrega',
      trackFallback: 'URL de seguiment (si el botó no es carrega):',
      summaryTitle: 'Resum de lliurament',
      pickup: 'Adreça de recollida',
      dropoff: 'Adreça d\'entrega',
      pickupDate: 'Data de recollida',
      pickupTime: 'Hora de recollida',
      updatesLine: 'T\'avisarem quan s\'assigni el rider i quan el lliurament s\'hagi completat.',
      supportLine: 'Si necessites actualitzar dades del lliurament o tens preguntes, contacta\'ns a info@cargoworks.es o per WhatsApp i inclou el teu ID de comanda.'
    },
    pt: {
      subject: 'Sua entrega da Cargoworks está confirmada - Pedido {ref}',
      header: 'Sua entrega está reservada 🚲',
      orderId: 'ID do pedido',
      trackIntro: 'Você pode acompanhar sua entrega em tempo real.',
      trackButton: 'Acompanhar entrega',
      trackFallback: 'URL de rastreamento (se o botão não carregar):',
      summaryTitle: 'Resumo da entrega',
      pickup: 'Endereço de coleta',
      dropoff: 'Endereço de entrega',
      pickupDate: 'Data da coleta',
      pickupTime: 'Horário de coleta',
      updatesLine: 'Avisaremos quando o rider for atribuído e quando a entrega for concluída.',
      supportLine: 'Se precisar atualizar detalhes da entrega ou tiver dúvidas, fale com info@cargoworks.es ou pelo WhatsApp e inclua o ID do pedido.'
    }
  };
  return dict[locale] || dict.en;
}

function formatScheduleDateForEmail(dateKey){
  const value = String(dateKey || '').trim();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return match[3] + '/' + match[2] + '/' + match[1];
}

function escapeHtml(value){
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sendClientConfirmationEmail(payload, adminData){
  try {
    const data = payload || {};
    const customer = data.customer || {};
    const email = String(customer.email || '').trim();
    if (!email) return false;

    const reference = String(data.reference || '').trim();
    const language = emailLocaleFromLanguage(data.language || 'en');
    const copy = confirmationEmailCopy(language);
    const trackingUrl = String((adminData && adminData.trackingUrl) || data.trackingUrl || '').trim();
    const route = (data.quote && data.quote.route) ? data.quote.route : {};
    const schedule = (data.quote && data.quote.schedule) ? data.quote.schedule : {};
    const pickup = String((route.pickup && route.pickup.address) || '').trim();
    const dropoff = String((route.dropoff && route.dropoff.address) || '').trim();
    const pickupDate = formatScheduleDateForEmail(schedule.date || '');
    const pickupTime = String(schedule.time || '').trim();
    const whatsappUrl = buildWhatsAppUrl(reference);
    const subjectTemplate = String(copy.subject || 'Your Cargoworks delivery is confirmed - Order {ref}');
    const subject = subjectTemplate.replace(/\{ref\}/g, reference);

    const summaryRows = [];
    if (pickup) summaryRows.push('<tr><td style="padding:4px 0;font-weight:600;">' + escapeHtml(copy.pickup) + '</td><td style="padding:4px 0;">' + escapeHtml(pickup) + '</td></tr>');
    if (dropoff) summaryRows.push('<tr><td style="padding:4px 0;font-weight:600;">' + escapeHtml(copy.dropoff) + '</td><td style="padding:4px 0;">' + escapeHtml(dropoff) + '</td></tr>');
    if (pickupDate) summaryRows.push('<tr><td style="padding:4px 0;font-weight:600;">' + escapeHtml(copy.pickupDate) + '</td><td style="padding:4px 0;">' + escapeHtml(pickupDate) + '</td></tr>');
    if (pickupTime) summaryRows.push('<tr><td style="padding:4px 0;font-weight:600;">' + escapeHtml(copy.pickupTime) + '</td><td style="padding:4px 0;">' + escapeHtml(pickupTime) + '</td></tr>');

    const summaryHtml = summaryRows.length
      ? ('<h3 style="margin:18px 0 8px;font-size:16px;color:#2b0f3a;">' + escapeHtml(copy.summaryTitle) + '</h3><table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;color:#2d1a4d;">' + summaryRows.join('') + '</table>')
      : '';

    const htmlBody = [
      '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;color:#2d1a4d;line-height:1.55;max-width:640px;">',
      '<h2 style="margin:0 0 12px;color:#2b0f3a;">' + escapeHtml(copy.header) + '</h2>',
      '<p style="margin:0 0 10px;"><strong>' + escapeHtml(copy.orderId) + ':</strong> ' + escapeHtml(reference) + '</p>',
      '<p style="margin:0 0 12px;">' + escapeHtml(copy.trackIntro) + '</p>',
      trackingUrl ? ('<p style="margin:0 0 10px;"><a href="' + escapeHtml(trackingUrl) + '" style="display:inline-block;background:#2b0f3a;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;letter-spacing:0.02em;">' + escapeHtml(copy.trackButton) + '</a></p>') : '',
      trackingUrl ? ('<p style="margin:0 0 14px;font-size:12px;color:#5a5470;">' + escapeHtml(copy.trackFallback) + '<br><a href="' + escapeHtml(trackingUrl) + '" style="color:#2b0f3a;">' + escapeHtml(trackingUrl) + '</a></p>') : '',
      summaryHtml,
      '<p style="margin:16px 0 10px;">' + escapeHtml(copy.updatesLine) + '</p>',
      '<p style="margin:0;">' + escapeHtml(copy.supportLine) + '</p>',
      '<p style="margin:8px 0 0;"><a href="mailto:info@cargoworks.es" style="color:#2b0f3a;">info@cargoworks.es</a> · <a href="' + escapeHtml(whatsappUrl) + '" style="color:#2b0f3a;">WhatsApp</a></p>',
      '</div>'
    ].join('');

    const textLines = [];
    textLines.push(copy.header);
    textLines.push('');
    textLines.push(copy.orderId + ': ' + reference);
    textLines.push(copy.trackIntro);
    if (trackingUrl) {
      textLines.push(copy.trackButton + ': ' + trackingUrl);
      textLines.push(copy.trackFallback);
      textLines.push(trackingUrl);
    }
    if (pickup || dropoff || pickupDate || pickupTime) {
      textLines.push('');
      textLines.push(copy.summaryTitle);
      if (pickup) textLines.push(copy.pickup + ': ' + pickup);
      if (dropoff) textLines.push(copy.dropoff + ': ' + dropoff);
      if (pickupDate) textLines.push(copy.pickupDate + ': ' + pickupDate);
      if (pickupTime) textLines.push(copy.pickupTime + ': ' + pickupTime);
    }
    textLines.push('');
    textLines.push(copy.updatesLine);
    textLines.push(copy.supportLine);
    textLines.push('info@cargoworks.es');
    textLines.push(whatsappUrl);

    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: textLines.join('\n'),
      htmlBody: htmlBody,
      replyTo: REPLY_TO
    });
    return true;
  } catch (err) {
    return false;
  }
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
    const token = String(params.t || '').trim();
    const event = findEventByReference(ref);
    if (!event) return jsonResponse({ error: 'Not found' }, 404);
    const summary = buildOrderSummary(event);
    if (!summary) return jsonResponse({ error: 'Not found' }, 404);
    const requiredToken = String(summary.trackingToken || '').trim();
    if (requiredToken && token && token !== requiredToken) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
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
    const scope = String(params.scope || '').trim().toLowerCase();
    const dateKey = String(params.date || '').trim();
    const refFilter = normalizeReference(String(params.ref || ''));
    const fromKey = String(params.from || '').trim();
    const toKey = String(params.to || '').trim();

    let range = null;
    if (dateKey && scope !== 'all') {
      range = dayRangeFromKey(dateKey, TIMEZONE);
      if (!range) return jsonResponse({ error: 'Invalid date parameter' }, 400);
    } else {
      const fallbackFrom = '2020-01-01';
      const fallbackTo = formatDateKey(new Date(new Date().getTime() + (3650 * 24 * 60 * 60 * 1000)));
      const finalFrom = fromKey || fallbackFrom;
      const finalTo = toKey || fallbackTo;
      const fromRange = dayRangeFromKey(finalFrom, TIMEZONE);
      const toRange = dayRangeFromKey(finalTo, TIMEZONE);
      if (!fromRange || !toRange) return jsonResponse({ error: 'Invalid from/to date parameter' }, 400);
      range = {
        start: fromRange.start,
        end: toRange.end
      };
    }

    const cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) return jsonResponse({ error: 'Calendar not found' }, 404);
    const events = cal.getEvents(range.start, range.end);
    let orders = events.map(function(event){
      return buildOrderSummary(event);
    }).filter(Boolean).sort(function(a, b){
      const aIso = String(a && a.schedule && a.schedule.startIso || '');
      const bIso = String(b && b.schedule && b.schedule.startIso || '');
      return aIso < bIso ? 1 : -1;
    });
    if (refFilter) {
      orders = orders.filter(function(order){
        return normalizeReference(order && order.reference) === refFilter;
      });
    }
    return jsonResponse({ orders: orders }, 200);
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err || 'Unknown error');
    return jsonResponse({ error: 'Server error', detail: msg }, 500);
  }
}

function handleAdminSheetInfo(params){
  try {
    if (!isAdminAuthorized(String(params.token || '').trim())) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const sheet = ensureOrdersLogSheet();
    const ss = sheet.getParent();
    return jsonResponse({
      id: ss.getId(),
      url: ss.getUrl(),
      tab: sheet.getName()
    }, 200);
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err || 'Unknown error');
    return jsonResponse({ error: 'Server error', detail: msg }, 500);
  }
}

function handleAdminBackfill(params){
  try {
    if (!isAdminAuthorized(String(params.token || '').trim())) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const fromKey = String(params.from || '').trim();
    const toKey = String(params.to || '').trim();
    const result = runOrdersLogBackfill(fromKey, toKey);
    return jsonResponse(result, 200);
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
  if (action === 'adminCreateOrder') return handleAdminCreateOrder(payload);
  if (action === 'adminEditOrder') return handleAdminEditOrder(payload);
  if (action === 'adminDuplicateOrder') return handleAdminDuplicateOrder(payload);
  if (action === 'adminCancelOrder') return handleAdminCancelOrder(payload);
  if (action === 'adminUpdate') return handleAdminUpdate(payload);
  if (action === 'adminPod') return handleAdminPod(payload);
  return jsonResponse({ error: 'Unknown action' }, 400);
}

function safeNumber(value, fallback){
  const n = Number(value);
  return Number.isFinite(n) ? n : (Number(fallback) || 0);
}

function cleanOrderText(value){
  return String(value || '').trim();
}

function normalizeStopsForOrder(stops){
  const items = Array.isArray(stops) ? stops : [];
  return items.map(function(stop){
    const address = cleanOrderText(stop && stop.address);
    if (!address) return null;
    return { address: address };
  }).filter(Boolean);
}

function normalizePricingBreakdown(input, currentTotal){
  const source = input && typeof input === 'object' ? input : {};
  const base = safeNumber(source.base, 0);
  const distance = safeNumber(source.distance, 0);
  const stops = safeNumber(source.stops, 0);
  const surcharge = safeNumber(source.surcharge, 0);
  const discount = safeNumber(source.discount, 0);
  const adjustment = safeNumber(source.adjustment, 0);
  const computedTotal = base + distance + stops + surcharge - discount + adjustment;
  const total = Number.isFinite(currentTotal) ? currentTotal : computedTotal;
  return {
    base: base,
    distance: distance,
    stops: stops,
    surcharge: surcharge,
    discount: discount,
    adjustment: adjustment,
    total: total
  };
}

function mergeAdminOrderPayload(orderInput, existingPayload){
  const base = existingPayload && typeof existingPayload === 'object' ? existingPayload : {};
  const incoming = orderInput && typeof orderInput === 'object' ? orderInput : {};
  const baseQuote = base.quote && typeof base.quote === 'object' ? base.quote : {};
  const incomingQuote = incoming.quote && typeof incoming.quote === 'object' ? incoming.quote : {};
  const baseCustomer = base.customer && typeof base.customer === 'object' ? base.customer : {};
  const incomingCustomer = incoming.customer && typeof incoming.customer === 'object' ? incoming.customer : {};
  const baseRoute = baseQuote.route && typeof baseQuote.route === 'object' ? baseQuote.route : {};
  const incomingRoute = incomingQuote.route && typeof incomingQuote.route === 'object' ? incomingQuote.route : {};
  const baseSchedule = baseQuote.schedule && typeof baseQuote.schedule === 'object' ? baseQuote.schedule : {};
  const incomingSchedule = incomingQuote.schedule && typeof incomingQuote.schedule === 'object' ? incomingQuote.schedule : {};

  const customer = {
    name: cleanOrderText(incomingCustomer.name || baseCustomer.name || ''),
    email: cleanOrderText(incomingCustomer.email || baseCustomer.email || ''),
    phone: cleanOrderText(incomingCustomer.phone || baseCustomer.phone || '')
  };

  const pickupAddress = cleanOrderText((incomingRoute.pickup && incomingRoute.pickup.address) || (baseRoute.pickup && baseRoute.pickup.address) || '');
  const dropoffAddress = cleanOrderText((incomingRoute.dropoff && incomingRoute.dropoff.address) || (baseRoute.dropoff && baseRoute.dropoff.address) || '');
  const stops = normalizeStopsForOrder(
    Array.isArray(incomingRoute.stops) ? incomingRoute.stops : (Array.isArray(baseRoute.stops) ? baseRoute.stops : [])
  );

  const schedule = {
    date: cleanOrderText(incomingSchedule.date || baseSchedule.date || ''),
    time: cleanOrderText(incomingSchedule.time || baseSchedule.time || '')
  };

  const total = safeNumber((incomingQuote.total != null ? incomingQuote.total : baseQuote.total), 0);
  const quote = {
    schedule: schedule,
    route: {
      pickup: { address: pickupAddress },
      stops: stops,
      dropoff: { address: dropoffAddress }
    },
    total: total,
    etaMins: Math.max(15, safeNumber((incomingQuote.etaMins != null ? incomingQuote.etaMins : baseQuote.etaMins), DEFAULT_DURATION_MIN)),
    totalKm: safeNumber((incomingQuote.totalKm != null ? incomingQuote.totalKm : baseQuote.totalKm), 0),
    currency: cleanOrderText(incomingQuote.currency || baseQuote.currency || 'EUR'),
    cargoType: cleanOrderText(incomingQuote.cargoType || baseQuote.cargoType || ''),
    loadType: cleanOrderText(incomingQuote.loadType || baseQuote.loadType || ''),
    vehicleType: cleanOrderText(incomingQuote.vehicleType || baseQuote.vehicleType || ''),
    packageCount: safeNumber((incomingQuote.packageCount != null ? incomingQuote.packageCount : baseQuote.packageCount), 0),
    weightKg: safeNumber((incomingQuote.weightKg != null ? incomingQuote.weightKg : baseQuote.weightKg), 0),
    volumeM3: safeNumber((incomingQuote.volumeM3 != null ? incomingQuote.volumeM3 : baseQuote.volumeM3), 0)
  };
  quote.breakdown = normalizePricingBreakdown(
    incomingQuote.breakdown || baseQuote.breakdown || {},
    Number(quote.total)
  );

  return {
    customer: customer,
    quote: quote,
    notes: cleanOrderText((incoming.notes != null ? incoming.notes : base.notes) || ''),
    updatesPreference: cleanOrderText((incoming.updatesPreference != null ? incoming.updatesPreference : base.updatesPreference) || ''),
    language: cleanOrderText((incoming.language != null ? incoming.language : base.language) || 'en'),
    sourceUrl: cleanOrderText((incoming.sourceUrl != null ? incoming.sourceUrl : base.sourceUrl) || 'https://cargoworks.es/admin/dispatcher.html')
  };
}

function validateAdminOrderPayload(payloadData){
  const quote = payloadData && payloadData.quote ? payloadData.quote : {};
  const schedule = quote.schedule || {};
  const route = quote.route || {};
  const dateKey = cleanOrderText(schedule.date);
  const timeLabel = cleanOrderText(schedule.time);
  if (!dateKey || !timeLabel) return 'Date and time are required.';
  if (!dateTimeFromKey(dateKey, timeLabel, TIMEZONE)) return 'Invalid date or time.';
  const pickup = cleanOrderText(route.pickup && route.pickup.address);
  const dropoff = cleanOrderText(route.dropoff && route.dropoff.address);
  if (!pickup || !dropoff) return 'Pickup and dropoff are required.';
  return '';
}

function buildOrderTitle(status, customerName, reference){
  const cleanStatus = normalizeOrderStatus(status) || DEFAULT_STATUS_LABEL;
  const cleanName = cleanOrderText(customerName || 'Customer') || 'Customer';
  return cleanStatus + ' - Cargoworks booking - ' + cleanName + ' - ' + String(reference || '').trim();
}

function applyOperatorMetadata(adminData, operator){
  const who = cleanOrderText(operator || 'dispatcher') || 'dispatcher';
  adminData.lastEditedBy = who;
  if (!adminData.createdBy) adminData.createdBy = who;
  return who;
}

function pushAdminTimeline(adminData, status, message, via){
  adminData.timeline = Array.isArray(adminData.timeline) ? adminData.timeline : [];
  adminData.timeline.push({
    ts: new Date().toISOString(),
    status: status || adminData.status || DEFAULT_STATUS_LABEL,
    message: cleanOrderText(message),
    via: cleanOrderText(via || 'dispatcher') || 'dispatcher'
  });
  adminData.lastUpdateAt = new Date().toISOString();
}

function handleAdminCreateOrder(payload){
  try {
    const draft = mergeAdminOrderPayload(payload.order || {}, {});
    const validation = validateAdminOrderPayload(draft);
    if (validation) return jsonResponse({ error: validation }, 400);

    const quote = draft.quote || {};
    const schedule = quote.schedule || {};
    const dateKey = cleanOrderText(schedule.date);
    const timeLabel = cleanOrderText(schedule.time);
    const start = dateTimeFromKey(dateKey, timeLabel, TIMEZONE);
    const etaMins = Math.max(15, safeNumber(quote.etaMins, DEFAULT_DURATION_MIN));
    const end = new Date(start.getTime() + (etaMins * 60000));

    const shortRef = buildShortRef(dateKey);
    const trackingToken = generatePublicToken(24);
    draft.reference = shortRef;
    draft.whatsappUrl = buildWhatsAppUrl(shortRef);
    draft.trackingUrl = buildTrackingUrl(draft, shortRef, trackingToken);
    draft.paymentUrl = cleanOrderText(payload.paymentUrl || (payload.order && payload.order.paymentUrl) || '');

    const status = normalizeOrderStatus(payload.status || (payload.order && payload.order.status) || '') || DEFAULT_STATUS_LABEL;
    const paymentStatus = normalizePaymentStatus(payload.paymentStatus || (payload.order && payload.order.paymentStatus) || '', !!draft.paymentUrl) || 'Pending';
    const updatesPreference = cleanOrderText(payload.updatesPreference || draft.updatesPreference || '');
    const adminData = buildDefaultAdminData(draft, null, draft.trackingUrl, updatesPreference, trackingToken);
    adminData.status = status;
    adminData.paymentStatus = paymentStatus;
    adminData.paymentUrl = draft.paymentUrl;
    adminData.updatesPreference = updatesPreference;
    adminData.rider = {
      name: cleanOrderText(payload.riderName || (payload.order && payload.order.riderName) || ''),
      phone: cleanOrderText(payload.riderPhone || (payload.order && payload.order.riderPhone) || '')
    };
    adminData.internalNotes = cleanOrderText(payload.internalNotes || (payload.order && payload.order.internalNotes) || '');
    const operator = applyOperatorMetadata(adminData, payload.operator);
    adminData.timeline = [];
    pushAdminTimeline(adminData, status, 'Order created manually by ' + operator, 'dispatcher');

    const description = buildEventDescription(draft, adminData);
    const cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) return jsonResponse({ error: 'Calendar not found' }, 404);
    const event = cal.createEvent(buildOrderTitle(status, draft.customer && draft.customer.name, shortRef), start, end, {
      description: description,
      location: getPickupAddress(quote)
    });

    appendOrderLogEntry({
      action: 'admin_create_order',
      eventId: event.getId(),
      payload: draft,
      adminData: adminData,
      status: adminData.status,
      paymentStatus: adminData.paymentStatus,
      message: 'Order created manually',
      build: BUILD_ID
    });

    return jsonResponse({ ok: true, order: buildOrderSummary(event) }, 200);
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err || 'Unknown error');
    return jsonResponse({ error: 'Server error', detail: msg }, 500);
  }
}

function handleAdminEditOrder(payload){
  try {
    const eventId = cleanOrderText(payload.eventId);
    if (!eventId) return jsonResponse({ error: 'Missing eventId' }, 400);
    const cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) return jsonResponse({ error: 'Calendar not found' }, 404);
    const event = cal.getEventById(eventId);
    if (!event) return jsonResponse({ error: 'Event not found' }, 404);

    const desc = String(event.getDescription() || '');
    const existingPayload = extractPayloadFromDescription(desc) || {};
    const adminData = ensureAdminData(desc, existingPayload);
    const draft = mergeAdminOrderPayload(payload.order || {}, existingPayload);
    draft.reference = cleanOrderText(existingPayload.reference || payload.reference || '');
    if (!draft.reference) draft.reference = buildShortRef(String((draft.quote && draft.quote.schedule && draft.quote.schedule.date) || ''));
    draft.trackingUrl = cleanOrderText(adminData.trackingUrl || draft.trackingUrl || buildTrackingUrl(draft, draft.reference, adminData.trackingToken));
    draft.whatsappUrl = cleanOrderText(existingPayload.whatsappUrl || buildWhatsAppUrl(draft.reference));
    draft.paymentUrl = cleanOrderText(payload.paymentUrl || (payload.order && payload.order.paymentUrl) || adminData.paymentUrl || existingPayload.paymentUrl || '');

    const validation = validateAdminOrderPayload(draft);
    if (validation) return jsonResponse({ error: validation }, 400);

    const quote = draft.quote || {};
    const schedule = quote.schedule || {};
    const start = dateTimeFromKey(cleanOrderText(schedule.date), cleanOrderText(schedule.time), TIMEZONE);
    const etaMins = Math.max(15, safeNumber(quote.etaMins, DEFAULT_DURATION_MIN));
    const end = new Date(start.getTime() + (etaMins * 60000));

    const status = normalizeOrderStatus(payload.status || (payload.order && payload.order.status) || adminData.status) || DEFAULT_STATUS_LABEL;
    const paymentStatus = normalizePaymentStatus(payload.paymentStatus || (payload.order && payload.order.paymentStatus) || adminData.paymentStatus, !!draft.paymentUrl) || adminData.paymentStatus || 'Pending';
    adminData.status = status;
    adminData.paymentStatus = paymentStatus;
    adminData.paymentUrl = draft.paymentUrl;
    adminData.updatesPreference = cleanOrderText(payload.updatesPreference || draft.updatesPreference || adminData.updatesPreference || '');
    adminData.rider = {
      name: cleanOrderText(payload.riderName || (payload.order && payload.order.riderName) || (adminData.rider && adminData.rider.name) || ''),
      phone: cleanOrderText(payload.riderPhone || (payload.order && payload.order.riderPhone) || (adminData.rider && adminData.rider.phone) || '')
    };
    adminData.internalNotes = cleanOrderText(payload.internalNotes || (payload.order && payload.order.internalNotes) || adminData.internalNotes || '');
    const operator = applyOperatorMetadata(adminData, payload.operator);
    const editMessage = cleanOrderText(payload.message || 'Order edited by ' + operator);
    pushAdminTimeline(adminData, status, editMessage, 'dispatcher');

    event.setTime(start, end);
    event.setLocation(getPickupAddress(quote));
    event.setTitle(buildOrderTitle(status, draft.customer && draft.customer.name, draft.reference));
    event.setDescription(buildEventDescription(draft, adminData));

    appendOrderLogEntry({
      action: 'admin_edit_order',
      eventId: event.getId(),
      payload: draft,
      adminData: adminData,
      status: adminData.status,
      paymentStatus: adminData.paymentStatus,
      message: editMessage,
      build: BUILD_ID
    });

    return jsonResponse({ ok: true, order: buildOrderSummary(event) }, 200);
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err || 'Unknown error');
    return jsonResponse({ error: 'Server error', detail: msg }, 500);
  }
}

function handleAdminDuplicateOrder(payload){
  try {
    const eventId = cleanOrderText(payload.eventId);
    if (!eventId) return jsonResponse({ error: 'Missing eventId' }, 400);
    const cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) return jsonResponse({ error: 'Calendar not found' }, 404);
    const event = cal.getEventById(eventId);
    if (!event) return jsonResponse({ error: 'Event not found' }, 404);

    const desc = String(event.getDescription() || '');
    const existingPayload = extractPayloadFromDescription(desc) || {};
    const existingAdminData = ensureAdminData(desc, existingPayload);
    const draft = mergeAdminOrderPayload(payload.order || {}, existingPayload);
    const validation = validateAdminOrderPayload(draft);
    if (validation) return jsonResponse({ error: validation }, 400);

    const quote = draft.quote || {};
    const schedule = quote.schedule || {};
    const start = dateTimeFromKey(cleanOrderText(schedule.date), cleanOrderText(schedule.time), TIMEZONE);
    const etaMins = Math.max(15, safeNumber(quote.etaMins, DEFAULT_DURATION_MIN));
    const end = new Date(start.getTime() + (etaMins * 60000));

    const shortRef = buildShortRef(cleanOrderText(schedule.date));
    const trackingToken = generatePublicToken(24);
    draft.reference = shortRef;
    draft.whatsappUrl = buildWhatsAppUrl(shortRef);
    draft.trackingUrl = buildTrackingUrl(draft, shortRef, trackingToken);
    draft.paymentUrl = cleanOrderText(payload.paymentUrl || '');

    const status = DEFAULT_STATUS_LABEL;
    const paymentStatus = normalizePaymentStatus(payload.paymentStatus || 'Pending', !!draft.paymentUrl) || 'Pending';
    const adminData = buildDefaultAdminData(draft, null, draft.trackingUrl, draft.updatesPreference || '', trackingToken);
    adminData.status = status;
    adminData.paymentStatus = paymentStatus;
    adminData.paymentUrl = draft.paymentUrl;
    adminData.rider = {
      name: cleanOrderText((existingAdminData.rider && existingAdminData.rider.name) || ''),
      phone: cleanOrderText((existingAdminData.rider && existingAdminData.rider.phone) || '')
    };
    adminData.internalNotes = cleanOrderText((existingAdminData.internalNotes || ''));
    const operator = applyOperatorMetadata(adminData, payload.operator);
    adminData.timeline = [];
    const fromRef = cleanOrderText(existingPayload.reference || 'order');
    pushAdminTimeline(adminData, status, 'Order duplicated from ' + fromRef + ' by ' + operator, 'dispatcher');

    const duplicateEvent = cal.createEvent(buildOrderTitle(status, draft.customer && draft.customer.name, shortRef), start, end, {
      description: buildEventDescription(draft, adminData),
      location: getPickupAddress(quote)
    });

    appendOrderLogEntry({
      action: 'admin_duplicate_order',
      eventId: duplicateEvent.getId(),
      payload: draft,
      adminData: adminData,
      status: adminData.status,
      paymentStatus: adminData.paymentStatus,
      message: 'Order duplicated from ' + fromRef,
      build: BUILD_ID
    });

    return jsonResponse({ ok: true, order: buildOrderSummary(duplicateEvent) }, 200);
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err || 'Unknown error');
    return jsonResponse({ error: 'Server error', detail: msg }, 500);
  }
}

function handleAdminCancelOrder(payload){
  try {
    const eventId = cleanOrderText(payload.eventId);
    if (!eventId) return jsonResponse({ error: 'Missing eventId' }, 400);
    const reason = cleanOrderText(payload.reason || 'Canceled by dispatcher');
    const cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) return jsonResponse({ error: 'Calendar not found' }, 404);
    const event = cal.getEventById(eventId);
    if (!event) return jsonResponse({ error: 'Event not found' }, 404);

    const desc = String(event.getDescription() || '');
    const payloadData = extractPayloadFromDescription(desc) || {};
    const adminData = ensureAdminData(desc, payloadData);
    adminData.status = 'Canceled';
    adminData.canceledAt = new Date().toISOString();
    adminData.canceledReason = reason;
    adminData.isArchived = true;
    const operator = applyOperatorMetadata(adminData, payload.operator);
    pushAdminTimeline(adminData, 'Canceled', 'Order canceled by ' + operator + '. Reason: ' + reason, 'dispatcher');

    event.setTitle(buildOrderTitle('Canceled', payloadData && payloadData.customer && payloadData.customer.name, payloadData.reference || extractReferenceFromText(event.getTitle() || '')));
    event.setDescription(upsertAdminData(desc, adminData));

    appendOrderLogEntry({
      action: 'admin_cancel_order',
      eventId: event.getId(),
      payload: payloadData,
      adminData: adminData,
      status: adminData.status,
      paymentStatus: adminData.paymentStatus,
      message: reason,
      build: BUILD_ID
    });

    return jsonResponse({ ok: true, order: buildOrderSummary(event) }, 200);
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err || 'Unknown error');
    return jsonResponse({ error: 'Server error', detail: msg }, 500);
  }
}

function handlePaymentReturn(payload){
  try {
    const reference = String(payload.reference || payload.ref || '').trim().toUpperCase();
    if (!reference) return jsonResponse({ error: 'Missing reference' }, 400);
    const sessionId = String(payload.sessionId || payload.session_id || '').trim();
    if (!sessionId) return jsonResponse({ error: 'Missing sessionId' }, 400);

    const verification = verifyStripeSessionForReference(reference, sessionId);
    if (!verification.ok) {
      return jsonResponse({ error: 'Payment verification failed', detail: verification.error || 'Stripe verification failed' }, 403);
    }
    const paymentStatus = verification.paymentStatus;

    const event = findEventByReference(reference);
    if (!event) return jsonResponse({ error: 'Not found' }, 404);

    const desc = String(event.getDescription() || '');
    const payloadData = extractPayloadFromDescription(desc) || {};
    const adminData = ensureAdminData(desc, payloadData);
    const previous = String(adminData.paymentStatus || '');
    // Do not downgrade already-paid orders from public return parameters.
    const resolvedPaymentStatus = (previous === 'Paid' && paymentStatus !== 'Paid') ? 'Paid' : paymentStatus;
    adminData.paymentStatus = resolvedPaymentStatus;
    if (!adminData.status) adminData.status = DEFAULT_STATUS_LABEL;

    const incomingPaymentUrl = String(payload.paymentUrl || '').trim();
    if (!adminData.paymentUrl && incomingPaymentUrl) adminData.paymentUrl = incomingPaymentUrl;

    adminData.timeline = Array.isArray(adminData.timeline) ? adminData.timeline : [];
    const ts = new Date().toISOString();
    const claimedOutcome = normalizePaymentOutcome(payload.outcome);
    const verifiedOutcome = String(verification.paymentStatusRaw || verification.sessionStatusRaw || '').trim() || paymentStatus.toLowerCase();
    const changed = previous !== resolvedPaymentStatus;
    if (changed) {
      adminData.timeline.push({
        ts: ts,
        status: adminData.status || DEFAULT_STATUS_LABEL,
        message: 'Payment status changed from ' + (previous || '-') + ' to ' + resolvedPaymentStatus + ' (verified: ' + verifiedOutcome + (claimedOutcome ? (', claimed: ' + claimedOutcome) : '') + ')',
        via: 'system'
      });
      adminData.lastUpdateAt = ts;
    }

    let confirmationEmailSent = false;
    if (adminData.paymentStatus === 'Paid' && !adminData.confirmationEmailSentAt) {
      if (!payloadData.reference) payloadData.reference = reference;
      if (!payloadData.trackingUrl && adminData.trackingUrl) payloadData.trackingUrl = adminData.trackingUrl;
      confirmationEmailSent = sendClientConfirmationEmail(payloadData, adminData);
      if (confirmationEmailSent) {
        adminData.confirmationEmailSentAt = ts;
        adminData.timeline.push({
          ts: ts,
          status: adminData.status || DEFAULT_STATUS_LABEL,
          message: 'Confirmation email sent to client',
          via: 'system'
        });
      } else {
        adminData.timeline.push({
          ts: ts,
          status: adminData.status || DEFAULT_STATUS_LABEL,
          message: 'Confirmation email could not be sent',
          via: 'system'
        });
      }
      adminData.lastUpdateAt = ts;
    }

    const updatedDesc = upsertAdminData(desc, adminData);
    event.setDescription(updatedDesc);

    appendOrderLogEntry({
      action: 'payment_return',
      eventId: event.getId(),
      payload: payloadData,
      adminData: adminData,
      status: adminData.status,
      paymentStatus: adminData.paymentStatus,
      message: 'Payment return verified: ' + verifiedOutcome + (claimedOutcome ? (' (claimed: ' + claimedOutcome + ')') : '') + (confirmationEmailSent ? ' (confirmation email sent)' : ''),
      build: BUILD_ID
    });

    return jsonResponse({
      ok: true,
      reference: reference,
      paymentStatus: adminData.paymentStatus,
      trackingUrl: adminData.trackingUrl || payloadData.trackingUrl || '',
      changed: changed,
      confirmationEmailSent: confirmationEmailSent
    }, 200);
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : String(err || 'Unknown error');
    return jsonResponse({ error: 'Server error', detail: msg }, 500);
  }
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
    const prevStatus = String(adminData.status || '');
    const prevPaymentStatus = String(adminData.paymentStatus || '');
    const statusInput = String(payload.status || '').trim();
    const status = statusInput ? normalizeOrderStatus(statusInput) : '';
    if (statusInput && !status) return jsonResponse({ error: 'Invalid status' }, 400);

    const paymentInput = String(payload.paymentStatus || '').trim();
    const hasPaymentUrl = !!String(adminData.paymentUrl || payloadData.paymentUrl || '').trim();
    const paymentStatus = paymentInput ? normalizePaymentStatus(paymentInput, hasPaymentUrl) : '';
    if (paymentInput && !paymentStatus) return jsonResponse({ error: 'Invalid paymentStatus' }, 400);

    const riderName = cleanOrderText(payload.riderName || '');
    const riderPhone = cleanOrderText(payload.riderPhone || '');
    const prevRiderName = cleanOrderText(adminData.rider && adminData.rider.name || '');
    const prevRiderPhone = cleanOrderText(adminData.rider && adminData.rider.phone || '');
    const internalNotes = cleanOrderText(payload.internalNotes || '');
    const operator = cleanOrderText(payload.operator || 'dispatcher') || 'dispatcher';
    const scheduleDateInput = cleanOrderText(payload.scheduleDate || '');
    const scheduleTimeInput = cleanOrderText(payload.scheduleTime || '');
    const etaInput = payload.etaMins;

    if (status) adminData.status = status;
    if (paymentStatus) adminData.paymentStatus = paymentStatus;
    if (!adminData.rider || typeof adminData.rider !== 'object') adminData.rider = { name: '', phone: '' };
    if (riderName || riderPhone) {
      adminData.rider.name = riderName || adminData.rider.name || '';
      adminData.rider.phone = riderPhone || adminData.rider.phone || '';
    }
    if (internalNotes) adminData.internalNotes = internalNotes;
    applyOperatorMetadata(adminData, operator);

    let scheduleChanged = false;
    const quoteData = (payloadData.quote && typeof payloadData.quote === 'object') ? payloadData.quote : {};
    const quoteSchedule = (quoteData.schedule && typeof quoteData.schedule === 'object') ? quoteData.schedule : {};
    const nextDate = scheduleDateInput || cleanOrderText(quoteSchedule.date || '');
    const nextTime = scheduleTimeInput || cleanOrderText(quoteSchedule.time || '');
    if ((scheduleDateInput || scheduleTimeInput) && (!nextDate || !nextTime || !dateTimeFromKey(nextDate, nextTime, TIMEZONE))) {
      return jsonResponse({ error: 'Invalid schedule date/time' }, 400);
    }
    if (scheduleDateInput || scheduleTimeInput) {
      if (!payloadData.quote || typeof payloadData.quote !== 'object') payloadData.quote = {};
      if (!payloadData.quote.schedule || typeof payloadData.quote.schedule !== 'object') payloadData.quote.schedule = {};
      payloadData.quote.schedule.date = nextDate;
      payloadData.quote.schedule.time = nextTime;
      scheduleChanged = true;
    }
    if (etaInput != null && etaInput !== '') {
      if (!payloadData.quote || typeof payloadData.quote !== 'object') payloadData.quote = {};
      payloadData.quote.etaMins = Math.max(15, safeNumber(etaInput, DEFAULT_DURATION_MIN));
      scheduleChanged = true;
    }

    const message = String(payload.message || payload.note || '').trim();
    const send = payload.send || {};
    const sendEmail = !!send.email;
    const sendWhatsApp = !!send.whatsapp;
    const now = new Date();
    const ts = now.toISOString();
    const updateResult = { emailSent: false, whatsappUrl: '' };
    adminData.timeline = Array.isArray(adminData.timeline) ? adminData.timeline : [];
    if (status && status !== prevStatus) {
      adminData.timeline.push({
        ts: ts,
        status: adminData.status || '',
        message: 'Status changed from ' + (prevStatus || '-') + ' to ' + status,
        via: 'dispatcher'
      });
      adminData.lastUpdateAt = ts;
    }
    if (paymentStatus && paymentStatus !== prevPaymentStatus) {
      adminData.timeline.push({
        ts: ts,
        status: adminData.status || '',
        message: 'Payment status changed from ' + (prevPaymentStatus || '-') + ' to ' + paymentStatus,
        via: 'dispatcher'
      });
      adminData.lastUpdateAt = ts;
    }
    if ((riderName || riderPhone) && (cleanOrderText(adminData.rider && adminData.rider.name || '') !== prevRiderName || cleanOrderText(adminData.rider && adminData.rider.phone || '') !== prevRiderPhone)) {
      adminData.timeline.push({
        ts: ts,
        status: adminData.status || '',
        message: 'Rider assignment updated',
        via: 'dispatcher'
      });
      adminData.lastUpdateAt = ts;
    }
    if (scheduleChanged) {
      adminData.timeline.push({
        ts: ts,
        status: adminData.status || '',
        message: 'Schedule updated by dispatcher',
        via: 'dispatcher'
      });
      adminData.lastUpdateAt = ts;
    }
    if (message) {
      const via = ['dispatcher'];
      if (sendEmail) via.push('email');
      if (sendWhatsApp) via.push('whatsapp');
      const noteEntry = { ts: ts, status: adminData.status || '', message: message, via: via.join('+') };
      adminData.timeline.push(noteEntry);
      ensureDispatcherNotes(adminData).push(noteEntry);
      adminData.lastUpdateAt = ts;
      if (sendEmail && canSendChannel('email', adminData, payloadData)) {
        updateResult.emailSent = sendProgressEmail(payloadData, adminData, message);
        adminData.timeline.push({
          ts: ts,
          status: adminData.status || '',
          message: updateResult.emailSent ? 'Update sent via email' : 'Update email could not be sent',
          via: 'system'
        });
      }
      if (sendWhatsApp && canSendChannel('whatsapp', adminData, payloadData)) {
        updateResult.whatsappUrl = buildCustomerWhatsAppUrl(payloadData, adminData, message);
        adminData.timeline.push({
          ts: ts,
          status: adminData.status || '',
          message: updateResult.whatsappUrl ? 'WhatsApp update prepared' : 'WhatsApp update could not be prepared',
          via: 'system'
        });
      }
    }
    const mergedPayload = Object.assign({}, payloadData);
    if (!mergedPayload.reference) mergedPayload.reference = extractReferenceFromText(event.getTitle() || '') || '';
    const updatedDesc = buildEventDescription(mergedPayload, adminData);
    event.setDescription(updatedDesc);
    if (scheduleChanged) {
      const scheduleDate = cleanOrderText(mergedPayload && mergedPayload.quote && mergedPayload.quote.schedule && mergedPayload.quote.schedule.date || '');
      const scheduleTime = cleanOrderText(mergedPayload && mergedPayload.quote && mergedPayload.quote.schedule && mergedPayload.quote.schedule.time || '');
      const start = dateTimeFromKey(scheduleDate, scheduleTime, TIMEZONE);
      if (start) {
        const etaMins = Math.max(15, safeNumber(mergedPayload && mergedPayload.quote && mergedPayload.quote.etaMins, DEFAULT_DURATION_MIN));
        const end = new Date(start.getTime() + (etaMins * 60000));
        event.setTime(start, end);
      }
      if (mergedPayload && mergedPayload.quote && mergedPayload.quote.route) {
        event.setLocation(getPickupAddress(mergedPayload.quote));
      }
    }
    if (status) setEventStatusTitle(event, status);
    appendOrderLogEntry({
      action: 'admin_update',
      eventId: event.getId(),
      payload: mergedPayload,
      adminData: adminData,
      status: adminData.status,
      paymentStatus: adminData.paymentStatus,
      message: message || 'Admin status update',
      build: BUILD_ID
    });
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
    appendOrderLogEntry({
      action: 'pod_uploaded',
      eventId: event.getId(),
      payload: payloadData,
      adminData: adminData,
      status: adminData.status,
      paymentStatus: adminData.paymentStatus,
      message: 'POD uploaded',
      build: BUILD_ID
    });
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
  const payloadPaymentUrl = payload && payload.paymentUrl ? String(payload.paymentUrl) : '';
  const adminPaymentUrl = adminData.paymentUrl ? String(adminData.paymentUrl) : '';
  const effectivePaymentUrl = adminPaymentUrl || payloadPaymentUrl;

  adminData.status = normalizeOrderStatus(adminData.status) || DEFAULT_STATUS_LABEL;
  adminData.paymentStatus = normalizePaymentStatus(adminData.paymentStatus, !!effectivePaymentUrl);
  adminData.paymentUrl = effectivePaymentUrl;
  adminData.trackingToken = String(adminData.trackingToken || '').trim();
  if (!adminData.rider || typeof adminData.rider !== 'object') adminData.rider = { name: '', phone: '' };
  adminData.rider.name = cleanOrderText(adminData.rider.name || '');
  adminData.rider.phone = cleanOrderText(adminData.rider.phone || '');
  adminData.internalNotes = cleanOrderText(adminData.internalNotes || '');
  adminData.createdBy = cleanOrderText(adminData.createdBy || 'system') || 'system';
  adminData.lastEditedBy = cleanOrderText(adminData.lastEditedBy || adminData.createdBy || 'system') || 'system';

  if (!adminData.trackingUrl) {
    const ref = payload && payload.reference ? String(payload.reference) : '';
    adminData.trackingUrl = ref ? buildTrackingUrl(payload || {}, ref, adminData.trackingToken) : '';
  }
  if (!Array.isArray(adminData.timeline)) adminData.timeline = [];
  if (!adminData.timeline.length) {
    adminData.timeline.push({
      ts: bookingSeedIso(payload),
      status: adminData.status || DEFAULT_STATUS_LABEL,
      message: 'Booking created',
      via: 'system'
    });
  }
  if (!Array.isArray(adminData.dispatcherNotes)) {
    adminData.dispatcherNotes = extractDispatcherNotes(adminData.timeline || []);
  }
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
    const reference = payload.reference
      || extractReferenceFromText(event.getTitle() || '')
      || extractReferenceFromText(desc)
      || '';
    const start = event.getStartTime();
    const end = event.getEndTime();
    const timeline = normalizeTimelineEntries(adminData.timeline || []);
    const dispatcherNotes = normalizeDispatcherNotes((adminData.dispatcherNotes && adminData.dispatcherNotes.length)
      ? adminData.dispatcherNotes
      : extractDispatcherNotes(timeline));
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
      trackingToken: adminData.trackingToken || '',
      updatesPreference: adminData.updatesPreference || payload.updatesPreference || '',
      riderName: cleanOrderText(adminData.rider && adminData.rider.name || ''),
      riderPhone: cleanOrderText(adminData.rider && adminData.rider.phone || ''),
      internalNotes: cleanOrderText(adminData.internalNotes || ''),
      canceledAt: cleanOrderText(adminData.canceledAt || ''),
      canceledReason: cleanOrderText(adminData.canceledReason || ''),
      isArchived: !!adminData.isArchived,
      createdBy: cleanOrderText(adminData.createdBy || ''),
      lastEditedBy: cleanOrderText(adminData.lastEditedBy || ''),
      podUrl: adminData.podUrl || '',
      timeline: timeline,
      dispatcherNotes: dispatcherNotes,
      deliveryNote: latestDispatcherNoteText(dispatcherNotes),
      schedule: schedule,
      quote: payload.quote && typeof payload.quote === 'object' ? payload.quote : {},
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
  const paymentStatus = normalizePaymentStatus(summary && summary.paymentStatus, !!(summary && summary.paymentUrl));
  const paymentUrl = (paymentStatus === 'Pending' || paymentStatus === 'Failed')
    ? String(summary && summary.paymentUrl || '')
    : '';
  const podUrl = String(summary && summary.status || '') === 'Delivered'
    ? String(summary && summary.podUrl || '')
    : '';
  return {
    reference: summary.reference,
    status: summary.status,
    paymentStatus: paymentStatus,
    paymentUrl: paymentUrl,
    trackingUrl: summary.trackingUrl,
    podUrl: podUrl,
    schedule: summary.schedule,
    timeline: summary.timeline || [],
    notes: summary.notes || '',
    dispatcherNotes: summary.dispatcherNotes || [],
    deliveryNote: summary.deliveryNote || ''
  };
}

function normalizeReference(ref){
  return String(ref || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function bookingSeedIso(payload){
  try {
    const schedule = payload && payload.quote && payload.quote.schedule ? payload.quote.schedule : {};
    const dateKey = String(schedule.date || '').trim();
    const timeLabel = String(schedule.time || '').trim();
    if (dateKey && timeLabel) {
      const dt = dateTimeFromKey(dateKey, timeLabel, TIMEZONE);
      if (dt) return dt.toISOString();
    }
  } catch (_) {
    // Fall through to now.
  }
  return new Date().toISOString();
}

function normalizeTimelineEntries(items){
  const list = Array.isArray(items) ? items : [];
  return list.map(function(item, idx){
    const ts = item && item.ts ? String(item.ts) : '';
    const stamp = Date.parse(ts);
    return {
      ts: ts,
      status: item && item.status ? String(item.status) : '',
      message: item && item.message ? String(item.message) : '',
      via: item && item.via ? String(item.via) : '',
      _sortKey: Number.isNaN(stamp) ? Number.MAX_SAFE_INTEGER : stamp,
      _idx: idx
    };
  }).sort(function(a, b){
    if (a._sortKey === b._sortKey) return a._idx - b._idx;
    return a._sortKey - b._sortKey;
  }).map(function(item){
    return {
      ts: item.ts,
      status: item.status,
      message: item.message,
      via: item.via
    };
  });
}

function normalizeDispatcherNotes(items){
  const list = Array.isArray(items) ? items : [];
  return list.map(function(item, idx){
    const ts = item && item.ts ? String(item.ts) : '';
    const stamp = Date.parse(ts);
    return {
      ts: ts,
      status: item && item.status ? String(item.status) : '',
      message: item && item.message ? String(item.message) : '',
      via: item && item.via ? String(item.via) : '',
      _sortKey: Number.isNaN(stamp) ? Number.MAX_SAFE_INTEGER : stamp,
      _idx: idx
    };
  }).sort(function(a, b){
    if (a._sortKey === b._sortKey) return a._idx - b._idx;
    return a._sortKey - b._sortKey;
  }).map(function(item){
    return {
      ts: item.ts,
      status: item.status,
      message: item.message,
      via: item.via
    };
  });
}

function latestDispatcherNoteText(items){
  const notes = normalizeDispatcherNotes(items);
  for (let i = notes.length - 1; i >= 0; i--) {
    const msg = String(notes[i] && notes[i].message || '').trim();
    if (msg) return msg;
  }
  return '';
}

function ensureDispatcherNotes(adminData){
  if (!adminData || typeof adminData !== 'object') return [];
  if (!Array.isArray(adminData.dispatcherNotes)) adminData.dispatcherNotes = [];
  return adminData.dispatcherNotes;
}

function extractDispatcherNotes(timeline){
  const items = Array.isArray(timeline) ? timeline : [];
  return items.filter(function(item){
    const msg = String(item && item.message || '').trim();
    if (!msg) return false;
    const via = String(item && item.via || '').toLowerCase();
    return via.indexOf('dispatcher') >= 0 || via.indexOf('email') >= 0 || via.indexOf('whatsapp') >= 0;
  }).map(function(item){
    return {
      ts: String(item && item.ts || ''),
      status: String(item && item.status || ''),
      message: String(item && item.message || ''),
      via: String(item && item.via || '')
    };
  });
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
    const match = String(ref || '').match(/CW-(\d{8})-/i);
    if (!match) return null;
    return dateFromReferenceDigits(match[1]);
  } catch (err) {
    return null;
  }
}

function dateFromReferenceDigits(digits){
  const clean = String(digits || '').trim();
  if (!/^\d{8}$/.test(clean)) return null;

  // New standard: DDMMYYYY.
  const dd = Number(clean.slice(0, 2));
  const mm = Number(clean.slice(2, 4));
  const yyyy = Number(clean.slice(4, 8));
  if (isValidDateParts(yyyy, mm, dd)) {
    return new Date(yyyy, mm - 1, dd, 0, 0, 0);
  }

  // Legacy fallback: YYYYMMDD.
  const legacyY = Number(clean.slice(0, 4));
  const legacyM = Number(clean.slice(4, 6));
  const legacyD = Number(clean.slice(6, 8));
  if (isValidDateParts(legacyY, legacyM, legacyD)) {
    return new Date(legacyY, legacyM - 1, legacyD, 0, 0, 0);
  }

  return null;
}

function isValidDateParts(year, month, day){
  if ([year, month, day].some(Number.isNaN)) return false;
  if (year < 2000 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const test = new Date(year, month - 1, day);
  return test.getFullYear() === year
    && (test.getMonth() + 1) === month
    && test.getDate() === day;
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
    const updateMessage = String(message || '').trim() || latestDispatcherNoteText(adminData && adminData.dispatcherNotes);
    const lines = [];
    if (customer.name) lines.push('Hola ' + String(customer.name || '') + ',');
    lines.push('');
    if (updateMessage) lines.push('Update: ' + updateMessage);
    if (adminData && adminData.status) lines.push('Status: ' + adminData.status);
    if (adminData && adminData.paymentStatus) lines.push('Payment: ' + adminData.paymentStatus);
    if (payload.paymentUrl && adminData && adminData.paymentStatus === 'Pending') lines.push('Payment link: ' + payload.paymentUrl);
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
    const updateMessage = String(message || '').trim() || latestDispatcherNoteText(adminData && adminData.dispatcherNotes);
    const parts = [];
    parts.push('Cargoworks update ' + reference + (updateMessage ? (': ' + updateMessage) : ''));
    if (adminData && adminData.status) parts.push('Status: ' + adminData.status);
    if (adminData && adminData.trackingUrl) parts.push('Tracking: ' + adminData.trackingUrl);
    if (adminData && adminData.podUrl) parts.push('POD: ' + adminData.podUrl);
    if (payload.paymentUrl && adminData && adminData.paymentStatus === 'Pending') parts.push('Payment: ' + payload.paymentUrl);
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

function normalizeCustomerEmail(value){
  return String(value || '').trim().toLowerCase();
}

function normalizePromoCode(value){
  return String(value || '').trim().toUpperCase();
}

function extractDiscountCodesFromPayload(payload){
  const quote = payload && payload.quote ? payload.quote : {};
  const out = [];
  const seen = {};

  function addCode(code){
    const normalized = normalizePromoCode(code);
    if (!normalized || seen[normalized]) return;
    seen[normalized] = true;
    out.push(normalized);
  }

  const discountCodes = Array.isArray(quote.discountCodes) ? quote.discountCodes : [];
  discountCodes.forEach(addCode);

  const discountItems = Array.isArray(quote.discountItems) ? quote.discountItems : [];
  discountItems.forEach(function(item){
    addCode(item && item.code);
    addCode(item && item.discount && item.discount.code);
  });

  const discounts = Array.isArray(quote.discounts) ? quote.discounts : [];
  discounts.forEach(function(item){
    addCode(item && item.code);
    addCode(item && item.discount && item.discount.code);
  });

  return out;
}

function shouldCountOrderAction(action){
  const key = String(action || '').trim();
  return key === 'booking_created' || key === 'admin_create_order' || key === 'admin_duplicate_order';
}

function forEachOrderPayloadByEmail(email, callback){
  const targetEmail = normalizeCustomerEmail(email);
  if (!targetEmail || typeof callback !== 'function') return;

  let usedSheet = false;
  let sheetHasData = false;
  try {
    const sheet = ensureOrdersLogSheet();
    const rowCount = sheet.getLastRow();
    if (rowCount >= 2) {
      usedSheet = true;
      sheetHasData = true;
      const rows = sheet.getRange(2, 1, rowCount - 1, 23).getValues();
      rows.forEach(function(row){
        if (!shouldCountOrderAction(row[1])) return;
        const rowEmail = normalizeCustomerEmail(row[7] || '');
        if (!rowEmail || rowEmail !== targetEmail) return;
        const payloadText = String(row[22] || '').trim();
        if (!payloadText) return;
        let parsed = null;
        try { parsed = JSON.parse(payloadText); } catch (_) { parsed = null; }
        if (!parsed) return;
        callback(parsed);
      });
    }
  } catch (_) {
    // If sheet read fails, fall back to calendar scan below.
  }

  // Legacy fallback only when there is no log history yet.
  if (usedSheet && sheetHasData) return;
  try {
    const cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) return;
    const start = new Date(new Date().getTime() - (3650 * 24 * 60 * 60 * 1000));
    const end = new Date(new Date().getTime() + (24 * 60 * 60 * 1000));
    const events = cal.getEvents(start, end);
    events.forEach(function(event){
      const desc = String(event.getDescription() || '');
      const parsedPayload = extractPayloadFromDescription(desc);
      if (!parsedPayload) return;
      const eventEmail = normalizeCustomerEmail(parsedPayload && parsedPayload.customer && parsedPayload.customer.email || '');
      if (!eventEmail || eventEmail !== targetEmail) return;
      callback(parsedPayload);
    });
  } catch (_) {
    // Ignore fallback failures.
  }
}

function getPromoRedemptionCountsByEmail(email){
  const counts = {};
  forEachOrderPayloadByEmail(email, function(orderPayload){
    const codes = extractDiscountCodesFromPayload(orderPayload);
    codes.forEach(function(code){
      counts[code] = Number(counts[code] || 0) + 1;
    });
  });

  return counts;
}

function countOrdersByEmail(email){
  let total = 0;
  forEachOrderPayloadByEmail(email, function(){ total += 1; });
  return total;
}

function isFirstOrderOnlyPromoCode(code, payload){
  const normalized = normalizePromoCode(code);
  if (!normalized) return false;
  if (normalized === 'FIRST50') return true;

  const quote = payload && payload.quote ? payload.quote : {};
  const collections = [];
  if (Array.isArray(quote.discountItems)) collections.push(quote.discountItems);
  if (Array.isArray(quote.discounts)) collections.push(quote.discounts);
  for (let c = 0; c < collections.length; c++) {
    const items = collections[c];
    for (let i = 0; i < items.length; i++) {
      const item = items[i] || {};
      const itemCode = normalizePromoCode(item.code || (item.discount && item.discount.code) || '');
      if (!itemCode || itemCode !== normalized) continue;
      if (item.firstOrderOnly === true) return true;
      if (item.discount && item.discount.firstOrderOnly === true) return true;
    }
  }
  return false;
}

function validatePromoRedemption(payload){
  const customer = payload && payload.customer ? payload.customer : {};
  const email = normalizeCustomerEmail(customer && customer.email || '');
  if (!email) return { ok: true };

  const appliedCodes = extractDiscountCodesFromPayload(payload);
  if (!appliedCodes.length) return { ok: true };

  const redemptionCounts = getPromoRedemptionCountsByEmail(email);
  let previousOrders = null;
  for (let i = 0; i < appliedCodes.length; i++) {
    const code = appliedCodes[i];
    if (isFirstOrderOnlyPromoCode(code, payload)) {
      if (previousOrders == null) previousOrders = countOrdersByEmail(email);
      if (previousOrders >= 1) {
        return {
          ok: false,
          error: 'Promo code "' + code + '" is only valid on your first order with this email.'
        };
      }
    }
    const usedCount = Number(redemptionCounts[code] || 0) || 0;
    if (usedCount >= 1) {
      return {
        ok: false,
        error: 'Promo code "' + code + '" has already been redeemed with this email. Each code can only be used once per email.'
      };
    }
  }
  return { ok: true };
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

function ensureOrdersLogSheet(){
  const props = PropertiesService.getScriptProperties();
  const existingId = String(props.getProperty(ORDERS_LOG_SHEET_PROPERTY) || '').trim();
  let ss = null;

  if (existingId) {
    try { ss = SpreadsheetApp.openById(existingId); } catch (_) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(ORDERS_LOG_SPREADSHEET_NAME);
    props.setProperty(ORDERS_LOG_SHEET_PROPERTY, ss.getId());
  }

  let sheet = ss.getSheetByName(ORDERS_LOG_TAB_NAME);
  if (!sheet) sheet = ss.insertSheet(ORDERS_LOG_TAB_NAME);

  const headers = [
    'LoggedAt',
    'Action',
    'EventId',
    'Reference',
    'Status',
    'PaymentStatus',
    'CustomerName',
    'CustomerEmail',
    'CustomerPhone',
    'ScheduleDate',
    'ScheduleTime',
    'UpdatesPreference',
    'Currency',
    'Total',
    'PickupAddress',
    'DropoffAddress',
    'StopsCount',
    'TrackingUrl',
    'PaymentUrl',
    'PodUrl',
    'Message',
    'Build',
    'PayloadJson',
    'AdminDataJson'
  ];

  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    const currentHeader = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const mismatch = headers.some(function(h, idx){ return String(currentHeader[idx] || '') !== h; });
    if (mismatch) {
      sheet.insertRows(1, 1);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function appendOrderLogEntry(entry){
  try {
    const row = buildOrderLogRow(entry || {});
    const sheet = ensureOrdersLogSheet();
    sheet.appendRow(row);
  } catch (_) {
    // Keep booking/update flows resilient if logging fails.
  }
}

function buildOrderLogRow(entry){
  const data = entry || {};
  const payload = data.payload || {};
  const adminData = data.adminData || {};
  const customer = payload.customer || {};
  const quote = payload.quote || {};
  const schedule = quote.schedule || {};
  const route = quote.route || {};
  const stops = Array.isArray(route.stops) ? route.stops : [];

  return [
    new Date().toISOString(),
    String(data.action || ''),
    String(data.eventId || ''),
    String(payload.reference || ''),
    String(data.status || adminData.status || ''),
    String(data.paymentStatus || adminData.paymentStatus || ''),
    String(customer.name || ''),
    String(customer.email || ''),
    String(customer.phone || ''),
    String(schedule.date || ''),
    String(schedule.time || ''),
    String(adminData.updatesPreference || payload.updatesPreference || ''),
    String(quote.currency || payload.currency || ''),
    Number(quote.total || payload.total || 0) || 0,
    String(route.pickup && route.pickup.address || ''),
    String(route.dropoff && route.dropoff.address || ''),
    stops.length,
    String(adminData.trackingUrl || payload.trackingUrl || ''),
    String(adminData.paymentUrl || payload.paymentUrl || ''),
    String(adminData.podUrl || ''),
    String(data.message || ''),
    String(data.build || BUILD_ID),
    safeJsonStringify(payload),
    safeJsonStringify(adminData)
  ];
}

function runOrdersLogBackfill(fromKey, toKey){
  const fallbackFrom = '2020-01-01';
  const fallbackTo = formatDateKey(new Date());
  const finalFrom = String(fromKey || '').trim() || fallbackFrom;
  const finalTo = String(toKey || '').trim() || fallbackTo;
  const fromRange = dayRangeFromKey(finalFrom, TIMEZONE);
  const toRange = dayRangeFromKey(finalTo, TIMEZONE);
  if (!fromRange || !toRange) throw new Error('Invalid from/to date parameter');

  const cal = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!cal) throw new Error('Calendar not found');

  const sheet = ensureOrdersLogSheet();
  const existingKeys = getOrdersLogExistingKeys(sheet);
  const events = cal.getEvents(fromRange.start, toRange.end);
  let imported = 0;
  let skipped = 0;

  events.forEach(function(event){
    const eventId = String(event && event.getId && event.getId() || '').trim();
    if (!eventId) {
      skipped += 1;
      return;
    }
    const key = makeOrdersLogKey(eventId, 'booking_created');
    if (existingKeys[key]) {
      skipped += 1;
      return;
    }
    const desc = String(event.getDescription() || '');
    const payload = extractPayloadFromDescription(desc) || {};
    const adminData = ensureAdminData(desc, payload);
    const row = buildOrderLogRow({
      action: 'booking_created',
      eventId: eventId,
      payload: payload,
      adminData: adminData,
      status: adminData.status,
      paymentStatus: adminData.paymentStatus,
      message: 'Backfill import',
      build: BUILD_ID
    });
    sheet.appendRow(row);
    existingKeys[key] = true;
    imported += 1;
  });

  return {
    ok: true,
    from: finalFrom,
    to: finalTo,
    scannedEvents: events.length,
    imported: imported,
    skipped: skipped
  };
}

function backfillOrdersLogLast365Days(){
  const to = formatDateKey(new Date());
  const from = formatDateKey(new Date(Date.now() - (365 * 24 * 60 * 60 * 1000)));
  return runOrdersLogBackfill(from, to);
}

function getOrdersLogExistingKeys(sheet){
  const keys = {};
  const rowCount = sheet.getLastRow();
  if (rowCount < 2) return keys;
  const rows = sheet.getRange(2, 1, rowCount - 1, 3).getValues();
  rows.forEach(function(row){
    const action = String(row[1] || '').trim();
    const eventId = String(row[2] || '').trim();
    if (!action || !eventId) return;
    keys[makeOrdersLogKey(eventId, action)] = true;
  });
  return keys;
}

function makeOrdersLogKey(eventId, action){
  return String(eventId || '').trim() + '::' + String(action || '').trim();
}

function safeJsonStringify(value){
  try {
    const text = JSON.stringify(value || {});
    return text.length > 49000 ? (text.slice(0, 49000) + '...') : text;
  } catch (_) {
    return '';
  }
}
