import { sendEmail } from '../../_shared/email.js';
import { NEATPOUR_EXPERIENCES, MAX_GUESTS, STATUS, ownerEmail, providerEmail } from '../../_shared/neatpour-config.js';
import { insertRequest, getRequest, updateStatus, createRespondToken, logEvent } from '../../_shared/neatpour-db.js';
import { guestAcknowledgement, providerAvailabilityRequest, ownerNewRequest } from '../../_shared/neatpour-email.js';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const clean = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  // Honeypot: real guests never see or fill this field.
  if (clean(body.website)) return json({ ok: true });

  const f = {
    guestFirstName: clean(body.guestFirstName, 100),
    guestLastName: clean(body.guestLastName, 100),
    guestEmail: clean(body.guestEmail, 200),
    guestPhone: clean(body.guestPhone, 50),
    checkinDate: clean(body.checkinDate, 20),
    experienceCode: clean(body.experienceCode, 50),
    preferredDate: clean(body.preferredDate, 20),
    preferredTime: clean(body.preferredTime, 20),
    alternateDate: clean(body.alternateDate, 20),
    alternateTime: clean(body.alternateTime, 20),
    notes: clean(body.notes),
  };

  if (!f.guestFirstName || !f.guestLastName || !f.guestEmail || !f.guestPhone || !f.experienceCode || !f.preferredDate || !f.preferredTime) {
    return json({ error: 'Missing required fields' }, 400);
  }
  if (!EMAIL_RE.test(f.guestEmail)) return json({ error: 'Please enter a valid email address' }, 400);
  const exp = NEATPOUR_EXPERIENCES[f.experienceCode];
  if (!exp) return json({ error: 'Invalid experience selected' }, 400);
  f.groupSize = parseInt(body.groupSize, 10);
  if (!Number.isInteger(f.groupSize) || f.groupSize < 1 || f.groupSize > MAX_GUESTS) {
    return json({ error: `Number of guests must be between 1 and ${MAX_GUESTS}` }, 400);
  }
  // The class question only applies to the two hands-on experiences.
  f.classPreferences = exp.isClass ? clean(body.classPreferences) : '';

  const db = env.CLAY_DB;
  const requestId = await insertRequest(db, f);
  await logEvent(db, requestId, 'created', { experienceCode: f.experienceCode, groupSize: f.groupSize });
  let row = await getRequest(db, requestId);

  // Provider availability request first (it is the step that moves the request along).
  const providerTo = providerEmail(env);
  let providerSent = false;
  if (providerTo) {
    try {
      const token = await createRespondToken(db, requestId);
      const base = new URL(request.url).origin;
      const msg = providerAvailabilityRequest(env, row, {
        availableUrl: `${base}/api/neatpour/respond/${token}?decision=available`,
        unavailableUrl: `${base}/api/neatpour/respond/${token}?decision=unavailable`,
      });
      await sendEmail(env, { to: providerTo, subject: msg.subject, html: msg.html });
      await updateStatus(db, requestId, STATUS.SENT_TO_PROVIDER, { sent_to_provider_at: new Date().toISOString() });
      await logEvent(db, requestId, 'provider_notified');
      providerSent = true;
    } catch (err) {
      await logEvent(db, requestId, 'provider_email_failed', { error: String(err && err.message) }).catch(() => {});
    }
  } else {
    await updateStatus(db, requestId, STATUS.PROVIDER_EMAIL_NOT_CONFIGURED);
    await logEvent(db, requestId, 'provider_email_not_configured');
  }
  if (!providerSent && providerTo) await updateStatus(db, requestId, STATUS.PROVIDER_EMAIL_NOT_CONFIGURED);
  row = await getRequest(db, requestId);

  // Owner courtesy email for every request.
  try {
    const msg = ownerNewRequest(row, { providerConfigured: providerSent });
    await sendEmail(env, { to: ownerEmail(env), subject: msg.subject, html: msg.html, replyTo: f.guestEmail });
    await logEvent(db, requestId, 'owner_notified');
  } catch (err) {
    await logEvent(db, requestId, 'owner_email_failed', { error: String(err && err.message) }).catch(() => {});
  }

  // Guest acknowledgement.
  try {
    const msg = guestAcknowledgement(row);
    await sendEmail(env, { to: f.guestEmail, subject: msg.subject, html: msg.html });
    await logEvent(db, requestId, 'guest_acknowledged');
  } catch (err) {
    await logEvent(db, requestId, 'guest_email_failed', { error: String(err && err.message) }).catch(() => {});
  }

  return json({ ok: true, requestId });
}
