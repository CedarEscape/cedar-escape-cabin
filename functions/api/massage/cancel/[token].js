import { consumeToken } from '../../../_shared/tokens.js';
import { getRequest, updateStatus, logEvent } from '../../../_shared/db.js';
import { createRefund, retrieveCheckoutSession } from '../../../_shared/stripe.js';
import { sendEmail, renderShell, formatCents } from '../../../_shared/email.js';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function page(body) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Cedar Escape</title></head>
     <body style="font-family:Georgia,serif;background:#F6F1E6;color:#2B271F;text-align:center;padding:60px 20px;">
       <h1 style="font-style:italic;color:#232D1D;">Cedar Escape</h1>
       ${body}
     </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  const confirmed = url.searchParams.get('confirm') === '1';
  const db = env.MASSAGE_DB;
  const token = params.token;

  if (!confirmed) {
    // Show a confirmation step first — this is an irreversible action.
    return page(`
      <p style="max-width:480px;margin:20px auto;">Are you sure you want to cancel this massage appointment?</p>
      <p style="max-width:480px;margin:20px auto;font-size:13px;color:#6b6555;">Cancellations made at least 5 days before your scheduled massage receive a full refund of payments made. Cancellations made within 5 days are non-refundable.</p>
      <a href="?confirm=1" style="display:inline-block;margin-top:20px;padding:14px 26px;background:#232D1D;color:#F6F1E6;text-decoration:none;border-radius:2px;">Yes, Cancel My Appointment</a>
    `);
  }

  const tokenRow = await consumeToken(db, token, 'cancel');
  if (!tokenRow) return page('<p>This cancellation link is invalid or has expired.</p>');

  const req = await getRequest(db, tokenRow.request_id);
  if (!req) return page('<p>This request could not be found.</p>');

  if (tokenRow.alreadyUsed || req.status.startsWith('CANCELLED')) {
    return page('<p>This appointment has already been cancelled.</p>');
  }

  const referenceDate = req.confirmed_start ? new Date(req.confirmed_start) : new Date(req.preferred_date);
  const daysUntil = (referenceDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  const eligibleForRefund = daysUntil >= 5;

  let refundedCents = 0;
  if (eligibleForRefund) {
    try {
      if (req.deposit_checkout_session_id && req.deposit_paid_cents > 0) {
        const depositSession = await retrieveCheckoutSession(env, req.deposit_checkout_session_id);
        if (depositSession.payment_intent) {
          await createRefund(env, { paymentIntentId: depositSession.payment_intent, amountCents: req.deposit_paid_cents });
          refundedCents += req.deposit_paid_cents;
        }
      }
      if (req.balance_checkout_session_id && req.balance_paid_cents > 0) {
        const balanceSession = await retrieveCheckoutSession(env, req.balance_checkout_session_id);
        if (balanceSession.payment_intent) {
          await createRefund(env, { paymentIntentId: balanceSession.payment_intent, amountCents: req.balance_paid_cents });
          refundedCents += req.balance_paid_cents;
        }
      }
    } catch (e) {
      await logEvent(db, req.id, 'refund_error', { message: e.message });
    }
  }

  const newStatus = eligibleForRefund ? 'CANCELLED_REFUNDED' : 'CANCELLED_NONREFUNDABLE';
  await updateStatus(db, req.id, newStatus);
  await logEvent(db, req.id, 'cancelled', { eligibleForRefund, refundedCents });

  const outcomeText = eligibleForRefund
    ? `Your payments totaling ${formatCents(refundedCents)} have been refunded.`
    : 'Since this is within 5 days of your appointment, payments already made are non-refundable, per our cancellation policy.';

  const guestHtml = renderShell({
    title: 'Your Cedar Escape massage has been cancelled',
    bodyHtml: `
      <p>Hi ${escapeHtml(req.primary_name)},</p>
      <p>Your Cedar Escape massage appointment has been cancelled.</p>
      <p>${outcomeText}</p>
    `,
  });
  await sendEmail(env, {
    to: req.primary_email,
    cc: [env.COURTESY_EMAIL, env.PARTNER_EMAIL],
    subject: 'Your Cedar Escape massage has been cancelled',
    html: guestHtml,
  });

  return page(`<p style="max-width:480px;margin:20px auto;">Your appointment has been cancelled. ${outcomeText}</p>`);
}
