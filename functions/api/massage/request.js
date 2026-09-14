import { priceRequest } from '../../_shared/pricing.js';
import { insertRequest, insertItems, logEvent } from '../../_shared/db.js';
import { createToken } from '../../_shared/tokens.js';
import { sendEmail, renderShell, renderButton, renderPanel, renderPanelRow, formatCents, formatDate, formatTime, HERO_IMAGES } from '../../_shared/email.js';

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

  // Partner email: availability/logistics only — never guest payment info.
  const itemsHtmlNoPrice = renderPanel(
    priced
      .map((i) => renderPanelRow(`<strong>${escapeHtml(i.guestLabel)}</strong>`, `${escapeHtml(i.serviceLabel)}${i.cbdAddon ? ' + CBD Enhancement' : ''}`))
      .join('')
  );

  const baseUrl = new URL(request.url).origin;
  const availableUrl = `${baseUrl}/api/massage/respond/${respondToken}?decision=available`;
  const unavailableUrl = `${baseUrl}/api/massage/respond/${respondToken}?decision=unavailable`;

  const partnerDetailsPanel = renderPanel(
    renderPanelRow('Preferred date', escapeHtml(formatDate(preferredDate)), 'calendar') +
      renderPanelRow('Preferred time', escapeHtml(formatTime(preferredTime)), 'clock') +
      (alternateDate ? renderPanelRow('Alternate date', escapeHtml(formatDate(alternateDate)), 'calendar') : '') +
      (alternateTime ? renderPanelRow('Alternate time', escapeHtml(formatTime(alternateTime)), 'clock') : '') +
      renderPanelRow('Guests', String(priced.length), 'guests')
  );

  const partnerHtml = renderShell({
    title: `New Cedar Escape massage request — ${formatDate(preferredDate)} at ${formatTime(preferredTime)}`,
    heroEyebrow: 'Wellness Is Always a Good Idea',
    heroHeadline: `Hi ${escapeHtml(env.PARTNER_NAME || 'there')}, got a moment?`,
    heroImage: HERO_IMAGES.spa,
    bodyHtml: `
      <p>Hope you're having a great week! We have a new in-home massage request at Cedar Escape and wanted to check your availability. The guest is interested in the details below.</p>
      ${partnerDetailsPanel}
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-weight:700;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#8a8168;margin:22px 0 10px;">Requested Services</div>
      ${itemsHtmlNoPrice}
      ${notes ? `<p><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ''}
      <p style="margin-top:10px;">Please let us know if you're available for this request.</p>
      <div style="text-align:center;margin:28px 0;">
        ${renderButton({ href: availableUrl, label: "YES, I'M AVAILABLE", style: 'solid' })}
        ${renderButton({ href: unavailableUrl, label: 'NOT AVAILABLE', style: 'outline' })}
      </div>
      <p style="font-size:13px;color:#6b6555;">Have a question or need to suggest a different time? Just reply to this email — we're happy to coordinate.</p>
      <hr style="border:none;border-top:1px solid rgba(43,39,31,0.12);margin:26px 0;">
      <p>Thank you for being part of the Cedar Escape experience! We truly appreciate you and love being able to offer our guests this special add-on.</p>
      <p style="font-style:italic;">With gratitude,<br>The Cedar Escape Team</p>
    `,
  });

  await sendEmail(env, {
    to: env.PARTNER_EMAIL,
    cc: env.COURTESY_EMAIL,
    subject: `New Cedar Escape massage request — ${formatDate(preferredDate)} at ${formatTime(preferredTime)}`,
    html: partnerHtml,
  });
  await logEvent(db, requestId, 'partner_notified');

  // Guest email: request-received confirmation, with the estimated total (guest-facing, price OK here).
  const guestDetailsPanel = renderPanel(
    renderPanelRow('Requested time', `${escapeHtml(formatDate(preferredDate))}<br>${escapeHtml(formatTime(preferredTime))}`, 'calendar') +
      (alternateDate ? renderPanelRow('Alternate time', `${escapeHtml(formatDate(alternateDate))}<br>${escapeHtml(formatTime(alternateTime))}`, 'calendar') : '') +
      renderPanelRow('Estimated total', formatCents(subtotalCents), 'price')
  );

  const guestHtml = renderShell({
    title: "We've got your massage request",
    heroEyebrow: 'Request Received',
    heroHeadline: "We've got your request.",
    heroImage: HERO_IMAGES.spa,
    bodyHtml: `
      <p>Hi ${escapeHtml(primaryName)},</p>
      <p>Thanks for choosing Cedar Escape! We're checking your requested date and time with our massage partner now. Once we hear back, we'll send the next step to your inbox.</p>
      ${guestDetailsPanel}
      <p style="font-size:13px;color:#6b6555;">No payment is due yet — we'll be in touch soon.</p>
      <p style="margin-top:20px;font-style:italic;">Relax. Reconnect. Make memories.<br>Cedar Escape</p>
    `,
  });
  await sendEmail(env, {
    to: primaryEmail,
    cc: env.COURTESY_EMAIL,
    subject: "We've got your massage request",
    html: guestHtml,
  });

  return new Response(JSON.stringify({ ok: true, requestId, subtotalCents, depositCents }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
