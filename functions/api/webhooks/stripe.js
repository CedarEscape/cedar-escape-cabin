import { verifyWebhookSignature } from '../../_shared/stripe.js';
import { getRequest, getItems, updateStatus, logEvent } from '../../_shared/db.js';
import { markTokenUsed, getOrCreateToken } from '../../_shared/tokens.js';
import { calculateMinutes, SERVICES } from '../../_shared/pricing.js';
import { sendEmail, renderShell, formatCents, renderOrderSummary } from '../../_shared/email.js';
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

    const ics = buildIcs({
      uid: requestId,
      startDate: confirmedStart,
      minutes,
      summary: 'In-Home Massage at Cedar Escape',
      description: `${items.length} guest(s): ${items.map((i) => i.guest_label + ' - ' + i.service_code).join(', ')}`,
      location: 'Cedar Escape, Massanutten, VA',
    });
    const icsBase64 = btoa(ics);

    const cancelToken = await getOrCreateToken(db, requestId, 'cancel');
    const baseUrl = new URL(request.url).origin;
    const cancelUrl = `${baseUrl}/api/massage/cancel/${cancelToken}`;

    const orderSummaryHtml = renderOrderSummary(items, serviceLabelFor);

    const guestHtml = renderShell({
      title: 'Your Cedar Escape massage is confirmed',
      bodyHtml: `
        <p>Hi ${escapeHtml(req.primary_name)},</p>
        <p><strong>Your Cedar Escape massage is confirmed!</strong></p>
        <p>Date: ${escapeHtml(req.preferred_date)}<br>Time: ${escapeHtml(req.preferred_time)}</p>
        <div style="margin:18px 0;">${orderSummaryHtml}</div>
        <p>Remaining balance: ${formatCents(req.balance_cents)}</p>
        <p>Your remaining balance will be due 48 hours before your massage. We'll send the secure payment reminder automatically.</p>
        <p>Your massage will be with ${escapeHtml(env.PARTNER_NAME || 'our local massage partner')}. To help her settle in, please have a clear, open space ready for her table before she arrives — she'll take care of the rest.</p>
        <p style="font-size:13px;color:#6b6555;margin-top:20px;"><strong>Cancellation Policy:</strong> Plans change — we understand. Cancellations made at least 5 days before your scheduled massage will receive a full refund of payments made. Cancellations made within 5 days are non-refundable, as your massage partner has reserved that appointment time specifically for your stay.</p>
        <p>A calendar invite is attached to this email.</p>
        <p style="margin-top:20px;font-size:13px;">Need to cancel? <a href="${cancelUrl}" style="color:#232D1D;">Cancel your appointment</a></p>
      `,
    });
    await sendEmail(env, {
      to: req.primary_email,
      cc: [env.COURTESY_EMAIL, env.PARTNER_EMAIL],
      subject: 'Your Cedar Escape massage is confirmed',
      html: guestHtml,
      attachments: [{ filename: 'cedar-escape-massage.ics', content: icsBase64 }],
    });
  } else if (purpose === 'balance') {
    if (req.status === 'PAID_IN_FULL') {
      return new Response(JSON.stringify({ received: true, ignored: 'already paid in full' }), { status: 200 });
    }
    await updateStatus(db, requestId, 'PAID_IN_FULL', { balance_paid_cents: session.amount_total });
    if (session.metadata.token) await markTokenUsed(db, session.metadata.token);
    await logEvent(db, requestId, 'balance_paid', { sessionId: session.id, amount: session.amount_total });

    const items = await getItems(db, requestId);
    const orderSummaryHtml = renderOrderSummary(items, serviceLabelFor);

    const guestHtml = renderShell({
      title: 'Your Cedar Escape massage is paid in full',
      bodyHtml: `
        <p>Hi ${escapeHtml(req.primary_name)},</p>
        <p>Once the balance is paid, you're all set. Your Cedar Escape massage on ${escapeHtml(req.preferred_date)} at ${escapeHtml(req.preferred_time)} is paid in full.</p>
        <div style="margin:18px 0;">${orderSummaryHtml}</div>
        <p>See you soon,<br>Cedar Escape</p>
      `,
    });
    await sendEmail(env, {
      to: req.primary_email,
      cc: [env.COURTESY_EMAIL, env.PARTNER_EMAIL],
      subject: 'Your Cedar Escape massage balance is paid in full',
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
