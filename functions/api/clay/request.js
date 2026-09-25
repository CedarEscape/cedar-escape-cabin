import { insertClayRequest, updateClayStatus, logClayEvent } from '../../_shared/clay-db.js';
import { createToken } from '../../_shared/clay-tokens.js';
import { sendEmail, renderShell, renderButton, renderPanel, renderPanelRow, formatDate, formatTime } from '../../_shared/email.js';

export const EXPERIENCES = {
  dessert_plates: 'Make Your Own Dessert Plates',
  wheel_sampler: 'Pottery Wheel Sampler',
  brunch_bowls: 'Brunch & Bowls',
  wine_and_wheel: 'Wine & Wheel',
  open_to_recs: 'Open to recommendations',
};

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

  const {
    guestFirstName, guestLastName, guestEmail, guestPhone, checkinDate,
    experienceCode, groupSize, preferredDate, preferredTime, alternateDate, alternateTime, notes,
  } = body;

  if (!guestFirstName || !guestLastName || !guestEmail || !guestPhone || !experienceCode || !preferredDate || !preferredTime) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
  }
  if (!EXPERIENCES[experienceCode]) {
    return new Response(JSON.stringify({ error: 'Invalid experience selected' }), { status: 400 });
  }
  const groupSizeInt = parseInt(groupSize, 10);
  if (!Number.isInteger(groupSizeInt) || groupSizeInt < 1) {
    return new Response(JSON.stringify({ error: 'Number of guests must be at least 1' }), { status: 400 });
  }

  const db = env.CLAY_DB;
  const requestId = await insertClayRequest(db, {
    guestFirstName, guestLastName, guestEmail, guestPhone, checkinDate,
    experienceCode, groupSize: groupSizeInt, preferredDate, preferredTime, alternateDate, alternateTime, notes,
  });
  await logClayEvent(db, requestId, 'created', { experienceCode, groupSize: groupSizeInt });

  const experienceLabel = EXPERIENCES[experienceCode];
  const respondToken = await createToken(db, requestId, 'lp_respond');
  const baseUrl = new URL(request.url).origin;
  const availableUrl = `${baseUrl}/api/clay/respond/${respondToken}?decision=available`;
  const unavailableUrl = `${baseUrl}/api/clay/respond/${respondToken}?decision=unavailable`;

  // LP notification — never shows price (there is none yet), warm tone, same
  // provider-response pattern as the massage partner email.
  const lpDetailsPanel = renderPanel(
    renderPanelRow('Guest', escapeHtml(guestFirstName), 'guests') +
      renderPanelRow('Experience', escapeHtml(experienceLabel)) +
      renderPanelRow('Group size', String(groupSizeInt), 'guests') +
      renderPanelRow('Preferred date & time', `${escapeHtml(formatDate(preferredDate))}<br>${escapeHtml(formatTime(preferredTime))}`, 'calendar') +
      (alternateDate ? renderPanelRow('Alternate date & time', `${escapeHtml(formatDate(alternateDate))}<br>${escapeHtml(formatTime(alternateTime))}`, 'calendar') : '') +
      renderPanelRow('Notes', notes ? escapeHtml(notes) : 'None provided')
  );

  const lpHtml = renderShell({
    title: 'New Cedar Escape private experience request',
    heroEyebrow: 'Friendly City Clay & Art Center',
    heroHeadline: 'Hi LP, got a moment?',
    bodyHtml: `
      <p>We have a new Cedar Escape guest interested in a private experience with Friendly City Clay &amp; Art Center.</p>
      <p>Here are the request details:</p>
      ${lpDetailsPanel}
      <p style="margin-top:10px;">Please let us know whether this request can be accommodated.</p>
      <div style="text-align:center;margin:28px 0;">
        ${renderButton({ href: availableUrl, label: 'AVAILABLE', style: 'solid' })}
        ${renderButton({ href: unavailableUrl, label: 'NOT AVAILABLE', style: 'outline' })}
      </div>
      <p style="font-size:13px;color:#6b6555;">Have a question or need to suggest something else? Just reply to this email — we're happy to coordinate.</p>
      <hr style="border:none;border-top:1px solid rgba(43,39,31,0.12);margin:26px 0;">
      <p style="font-style:italic;">Thank you!<br>Courtney<br>Cedar Escape</p>
    `,
  });

  await sendEmail(env, {
    to: env.CLAY_PARTNER_EMAIL,
    cc: env.COURTESY_EMAIL,
    subject: 'New Cedar Escape private experience request',
    html: lpHtml,
  });
  await updateClayStatus(db, requestId, 'SENT_TO_FRIENDLY_CITY_CLAY', { sent_to_provider_at: new Date().toISOString() });
  await logClayEvent(db, requestId, 'provider_notified');

  // Guest confirmation — immediate, no price, does not confirm an appointment.
  const guestDetailsPanel = renderPanel(
    renderPanelRow('Experience', escapeHtml(experienceLabel)) +
      renderPanelRow('Group size', String(groupSizeInt), 'guests') +
      renderPanelRow('Preferred date & time', `${escapeHtml(formatDate(preferredDate))}<br>${escapeHtml(formatTime(preferredTime))}`, 'calendar') +
      (alternateDate ? renderPanelRow('Alternate date & time', `${escapeHtml(formatDate(alternateDate))}<br>${escapeHtml(formatTime(alternateTime))}`, 'calendar') : '') +
      (notes ? renderPanelRow('Notes', escapeHtml(notes)) : '')
  );

  const guestHtml = renderShell({
    title: 'We received your Friendly City Clay request',
    heroEyebrow: 'Request Received',
    heroHeadline: 'Request received!',
    bodyHtml: `
      <p>Hi ${escapeHtml(guestFirstName)},</p>
      <p>We'll check availability with Friendly City Clay &amp; Art Center and follow up with you with current pricing and next steps.</p>
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-weight:700;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#8a8168;margin:22px 0 10px;">Your Request</div>
      ${guestDetailsPanel}
      <p style="font-size:13px;color:#6b6555;margin-top:10px;">Starting at $330 for up to 6 guests ($55 per additional guest). Pricing reflects current Friendly City Clay rates and is subject to change &mdash; final pricing will be confirmed once we hear back on availability.</p>
      <p style="margin-top:10px;">Nothing is booked yet, and no payment is due at this time. We'll email you as soon as we have an availability update.</p>
      <p style="margin-top:16px;font-style:italic;">Courtney<br>Cedar Escape</p>
    `,
  });
  await sendEmail(env, {
    to: guestEmail,
    cc: env.COURTESY_EMAIL,
    subject: 'We received your Friendly City Clay request',
    html: guestHtml,
  });

  return new Response(JSON.stringify({ ok: true, requestId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
