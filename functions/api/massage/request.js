import { priceRequest } from '../../_shared/pricing.js';
import { insertRequest, insertItems, logEvent } from '../../_shared/db.js';
import { createToken } from '../../_shared/tokens.js';
import { sendEmail, renderShell, renderButton, formatCents } from '../../_shared/email.js';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { primaryName, primaryEmail, primaryPhone, checkinDate, preferredDate, preferredTime, alternateDate, alternateTime, notes, guests } = body;

  if (!primaryName || !primaryEmail || !primaryPhone || !preferredDate || !preferredTime) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
  }
  if (!Array.isArray(guests) || guests.length === 0) {
    return new Response(JSON.stringify({ error: 'At least one guest/service is required' }), { status: 400 });
  }

  let priced, subtotalCents, depositCents, balanceCents;
  try {
    ({ priced, subtotalCents, depositCents, balanceCents } = priceRequest(guests));
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }

  const db = env.MASSAGE_DB;
  const requestId = await insertRequest(db, {
    primaryName,
    primaryEmail,
    primaryPhone,
    checkinDate,
    preferredDate,
    preferredTime,
    alternateDate,
    alternateTime,
    notes,
    subtotalCents,
    depositCents,
    balanceCents,
  });
  await insertItems(db, requestId, priced);
  await logEvent(db, requestId, 'created', { subtotalCents });

  const respondToken = await createToken(db, requestId, 'partner_respond');

  const itemsHtml = priced
    .map(
      (i) =>
        `<div style="margin-bottom:10px;"><strong>${escapeHtml(i.guestLabel)}</strong><br>${escapeHtml(i.serviceLabel)}${i.cbdAddon ? '<br>+ ' + escapeHtml('CBD Oil Add-On') : ''}</div>`
    )
    .join('');

  const baseUrl = new URL(request.url).origin;
  const availableUrl = `${baseUrl}/api/massage/respond/${respondToken}?decision=available`;
  const unavailableUrl = `${baseUrl}/api/massage/respond/${respondToken}?decision=unavailable`;

  const partnerHtml = renderShell({
    title: 'New Cedar Escape Massage Request',
    bodyHtml: `
      <p>Hi there,</p>
      <p>We have a new in-home massage request at Cedar Escape and wanted to check your availability. If you're available, we'll send the guest a secure link to confirm the appointment.</p>
      <div style="background:rgba(43,39,31,0.05);padding:18px 20px;border-radius:4px;margin:20px 0;">
        <strong>Preferred:</strong> ${escapeHtml(preferredDate)} at ${escapeHtml(preferredTime)}<br>
        ${alternateDate ? `<strong>Alternate:</strong> ${escapeHtml(alternateDate)} at ${escapeHtml(alternateTime || '')}<br>` : ''}
        <strong>${priced.length} Guest${priced.length > 1 ? 's' : ''}</strong>
      </div>
      <div style="margin:16px 0;">${itemsHtml}</div>
      ${notes ? `<p><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ''}
      <div style="text-align:center;margin:28px 0;">
        ${renderButton({ href: availableUrl, label: 'AVAILABLE', style: 'solid' })}
        ${renderButton({ href: unavailableUrl, label: 'NOT AVAILABLE', style: 'outline' })}
      </div>
      <p style="font-size:13px;color:#6b6555;">Have a question or need to suggest a different time? Just reply to this email — we're happy to coordinate.</p>
    `,
  });

  await sendEmail(env, {
    to: env.PARTNER_EMAIL,
    cc: env.COURTESY_EMAIL,
    subject: 'New Cedar Escape Massage Request',
    html: partnerHtml,
  });
  await logEvent(db, requestId, 'partner_notified');

  const guestHtml = renderShell({
    title: 'Thanks for submitting your massage request',
    bodyHtml: `
      <p>Hi ${escapeHtml(primaryName)},</p>
      <p>Thanks for submitting your massage request.</p>
      <p>We've sent it over to our massage partner and will follow up as soon as we have an availability update.</p>
      <p>Your massage is not confirmed just yet. Once availability is approved, we'll send the next steps your way.</p>
      <p style="font-size:13px;color:#6b6555;">Massage services are subject to therapist availability, and advance notice is strongly encouraged.</p>
    `,
  });
  await sendEmail(env, {
    to: primaryEmail,
    cc: env.COURTESY_EMAIL,
    subject: 'Your Cedar Escape Massage Request',
    html: guestHtml,
  });

  return new Response(JSON.stringify({ ok: true, requestId, subtotalCents, depositCents }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
