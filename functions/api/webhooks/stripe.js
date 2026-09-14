import { verifyWebhookSignature } from '../../_shared/stripe.js';
import { getRequest, getItems, updateStatus, logEvent } from '../../_shared/db.js';
import { markTokenUsed, getOrCreateToken } from '../../_shared/tokens.js';
import { calculateMinutes, SERVICES } from '../../_shared/pricing.js';
import { sendEmail, renderShell, renderPanel, renderPanelRow, formatCents, formatDate, formatTime, renderOrderSummary } from '../../_shared/email.js';
import { buildIcs } from '../../_shared/ics.js';

function serviceLabelFor(code) {
  return SERVICES[code] ? SERVICES[code].label : code;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function onRequestPost({ request, env }) {
  const payload = await request.text();
  const signature = request.headers.get('Stripe-Signature');

  if (!signature || !(await verifyWebhookSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET))) {
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(payload);
  const db = env.MASSAGE_DB;

  if (event.type !== 'checkout.session.completed') {
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  const session = event.data.object;
  const { request_id: requestId, purpose } = session.metadata || {};
  if (!requestId || !purpose) {
    return new Response(JSON.stringify({ received: true, ignored: 'missing metadata' }), { status: 200 });
  }

  const req = await getRequest(db, requestId);
  if (!req) {
    return new Response(JSON.stringify({ received: true, ignored: 'unknown request' }), { status: 200 });
  }

  if (purpose === 'deposit') {
    // Idempotency guard against Stripe's at-least-once webhook delivery.
    if (req.ics_sent) {
      return new Response(JSON.stringify({ received: true, ignored: 'already processed' }), { status: 200 });
    }

    const items = await getItems(db, requestId);
    const minutes = calculateMinutes(items);
    const confirmedStart = `${req.preferred_date}T${to24Hour(req.preferred_time)}:00`;

    await updateStatus(db, requestId, 'CONFIRMED_DEPOSIT_PAID', {
      deposit_paid_cents: session.amount_total,
      ics_sent: 1,
      confirmed_start: confirmedStart,
      confirmed_minutes: minutes,
    });
    if (session.metadata.token) await markTokenUsed(db, session.metadata.token);
    await logEvent(db, requestId, 'deposit_paid', { sessionId: session.id, amount: session.amount_total });

    const icsDescription = `${items.length} guest(s): ${items.map((i) => i.guest_label + ' - ' + serviceLabelFor(i.service_code)).join(', ')}`;
    const ics = buildIcs({
      uid: requestId,
      startDate: confirmedStart,
      minutes,
      summary: 'In-Home Massage at Cedar Escape',
      description: icsDescription,
      location: 'Cedar Escape, Massanutten, VA',
    });
    const icsBase64 = btoa(ics);

    const orderSummaryHtml = renderOrderSummary(items, serviceLabelFor);
    const cancelToken = await getOrCreateToken(db, requestId, 'cancel');
    const cancelUrl = `${new URL(request.url).origin}/api/massage/cancel/${cancelToken}`;

    // Guest email — full financial detail + calendar invite.
    const guestHtml = renderShell({
      title: 'Your Cedar Escape massage is confirmed',
      heroEyebrow: 'Massage Confirmed',
      heroHeadline: "You're all set!",
      bodyHtml: `
        <p>Hi ${escapeHtml(req.primary_name)},</p>
        <p>We're so glad you'll be enjoying an in-home massage at Cedar Escape. Here are your details for reference:</p>
        <p style="font-size:17px;margin-top:14px;"><strong>${escapeHtml(formatDate(req.preferred_date))} at ${escapeHtml(formatTime(req.preferred_time))}</strong></p>
        ${orderSummaryHtml}
        ${renderPanel(
          renderPanelRow('Total service value', formatCents(req.subtotal_cents)) +
            renderPanelRow('Deposit paid (50%)', formatCents(req.deposit_cents)) +
            renderPanelRow('Remaining balance (50%)', formatCents(req.balance_cents))
        )}
        <p>We'll send a secure reminder 48 hours before your massage to take care of the remaining balance.</p>
        <p>Your calendar invite is attached for easy reference.</p>
        <p style="font-size:13px;color:#6b6555;margin-top:20px;"><strong>Cancellation Policy:</strong> Plans change — we understand. Cancellations made at least 5 days before your scheduled massage will receive a full refund of any amount paid. See our full policy for details.</p>
        <p style="margin-top:16px;">Thank you for choosing Cedar Escape! We look forward to helping you relax and recharge.</p>
        <p style="font-style:italic;">Cedar Escape Team</p>
        <p style="margin-top:16px;font-size:12px;color:#8a8168;">Need to cancel? <a href="${cancelUrl}" style="color:#8a8168;">Cancel your appointment</a></p>
      `,
    });
    await sendEmail(env, {
      to: req.primary_email,
      cc: env.COURTESY_EMAIL,
      subject: 'Your Cedar Escape massage is confirmed',
      html: guestHtml,
      attachments: [{ filename: 'cedar-escape-massage.ics', content: icsBase64 }],
    });

    // Partner email — logistics + calendar invite only, never payment info.
    const partnerServicesPanel = renderPanel(
      items.map((i) => renderPanelRow(escapeHtml(i.guest_label), `${escapeHtml(serviceLabelFor(i.service_code))}${i.cbd_addon ? ' + CBD Enhancement' : ''}`)).join('')
    );
    const partnerHtml = renderShell({
      title: `Confirmed — Cedar Escape massage — ${formatDate(req.preferred_date)}`,
      heroEyebrow: 'Final Confirmation',
      heroHeadline: 'Thanks for being part of it!',
      bodyHtml: `
        <p>Hi ${escapeHtml(env.PARTNER_NAME || 'there')},</p>
        <p>This is a final confirmation for your upcoming massage at Cedar Escape.</p>
        <p style="font-size:17px;margin-top:14px;"><strong>${escapeHtml(formatDate(req.preferred_date))} at ${escapeHtml(formatTime(req.preferred_time))}</strong></p>
        ${partnerServicesPanel}
        <p style="margin-top:16px;">The appointment is confirmed and your calendar invite is attached.</p>
        <p>Thank you for helping make our guests' stays so special. We appreciate you!</p>
        <p>See you soon,<br>Cedar Escape Team</p>
      `,
    });
    await sendEmail(env, {
      to: env.PARTNER_EMAIL,
      cc: env.COURTESY_EMAIL,
      subject: `Confirmed — Cedar Escape massage — ${formatDate(req.preferred_date)}`,
      html: partnerHtml,
      attachments: [{ filename: 'cedar-escape-massage.ics', content: icsBase64 }],
    });
  } else if (purpose === 'balance') {
    if (req.status === 'PAID_IN_FULL') {
      return new Response(JSON.stringify({ received: true, ignored: 'already paid in full' }), { status: 200 });
    }
    await updateStatus(db, requestId, 'PAID_IN_FULL', { balance_paid_cents: session.amount_total });
    if (session.metadata.token) await markTokenUsed(db, session.metadata.token);
    await logEvent(db, requestId, 'balance_paid', { sessionId: session.id, amount: session.amount_total });

    // Guest-only — the massage partner does not receive a paid-in-full email.
    const guestHtml = renderShell({
      title: "You're all set for your massage",
      heroEyebrow: 'Paid in Full',
      heroHeadline: 'See you soon!',
      bodyHtml: `
        <p>Hi ${escapeHtml(req.primary_name)},</p>
        <p>Your massage is paid in full and everything is set for:</p>
        <p style="font-size:17px;margin-top:14px;"><strong>${escapeHtml(formatDate(req.preferred_date))} at ${escapeHtml(formatTime(req.preferred_time))}</strong></p>
        ${renderPanel(renderPanelRow('Total paid', formatCents(req.subtotal_cents)))}
        <p>Nothing else to take care of — enjoy the rest of your stay.</p>
        <p style="font-style:italic;">Cedar Escape</p>
      `,
    });
    await sendEmail(env, {
      to: req.primary_email,
      cc: env.COURTESY_EMAIL,
      subject: "You're all set for your massage",
      html: guestHtml,
    });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}

function to24Hour(timeStr) {
  // Best-effort parse of a guest-entered time like "2:00 PM" into "14:00".
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec((timeStr || '').trim());
  if (!m) return '12:00';
  let [, h, min, ampm] = m;
  h = parseInt(h, 10);
  if (ampm) {
    if (/pm/i.test(ampm) && h !== 12) h += 12;
    if (/am/i.test(ampm) && h === 12) h = 0;
  }
  return String(h).padStart(2, '0') + ':' + min;
}
