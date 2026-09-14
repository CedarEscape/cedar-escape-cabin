import { consumeToken } from '../../../_shared/tokens.js';
import { getRequest, updateStatus, logEvent } from '../../../_shared/db.js';
import { createRefund, retrieveCheckoutSession } from '../../../_shared/stripe.js';
import { sendEmail, renderShell, renderPanel, renderPanelRow, formatCents, formatDate, formatTime } from '../../../_shared/email.js';
import { buildIcsCancel } from '../../../_shared/ics.js';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function page(heading, bodyHtml) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cedar Escape</title>
     <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,500&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet"></head>
     <body style="margin:0;font-family:'DM Sans',sans-serif;background:#F6F1E6;color:#2B271F;">
       <div style="background:linear-gradient(155deg,#37452F 0%,#232D1D 100%);padding:48px 24px;text-align:center;">
         <div style="font-family:'Playfair Display',serif;font-style:italic;color:#F6F1E6;font-size:15px;letter-spacing:0.08em;">CEDAR ESCAPE</div>
       </div>
       <div style="max-width:480px;margin:0 auto;padding:56px 24px;text-align:center;">
         <h1 style="font-family:'Playfair Display',serif;font-style:italic;font-weight:500;font-size:28px;color:#232D1D;margin:0 0 16px;">${heading}</h1>
         ${bodyHtml}
       </div>
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
    return page(
      'Cancel your appointment?',
      `
      <p style="font-size:15px;color:#4b453b;line-height:1.6;">Are you sure you want to cancel this massage appointment?</p>
      <p style="font-size:13px;color:#6b6555;line-height:1.6;">Cancellations made at least 5 days before your scheduled massage receive a full refund of payments made. Cancellations made within 5 days are non-refundable.</p>
      <a href="?confirm=1" style="display:inline-block;margin-top:16px;padding:15px 30px;background:#232D1D;color:#F6F1E6;text-decoration:none;border-radius:30px;font-weight:600;font-size:13.5px;">Yes, Cancel My Appointment</a>
    `
    );
  }

  const tokenRow = await consumeToken(db, token, 'cancel');
  if (!tokenRow) return page('Link expired', '<p style="font-size:15px;color:#4b453b;">This cancellation link is invalid or has expired.</p>');

  const req = await getRequest(db, tokenRow.request_id);
  if (!req) return page('Request not found', '<p style="font-size:15px;color:#4b453b;">This request could not be found.</p>');

  if (tokenRow.alreadyUsed || req.status.startsWith('CANCELLED')) {
    return page('Already cancelled', '<p style="font-size:15px;color:#4b453b;">This appointment has already been cancelled.</p>');
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

  // Guest email — financial outcome included.
  const guestHtml = eligibleForRefund
    ? renderShell({
        title: 'Your massage has been canceled',
        heroEyebrow: 'Appointment Canceled',
        heroHeadline: 'Your massage has been canceled.',
        bodyHtml: `
          <p>Hi ${escapeHtml(req.primary_name)},</p>
          <p>Your massage for ${escapeHtml(formatDate(req.preferred_date))} at ${escapeHtml(formatTime(req.preferred_time))} has been canceled.</p>
          ${renderPanel(renderPanelRow('Refund amount', formatCents(refundedCents)))}
          <p>Your payment will be refunded to your original payment method.</p>
          <p>We're sorry this one didn't work out, and we hope you enjoy the rest of your time at Cedar Escape.</p>
          <p style="font-style:italic;">Cedar Escape</p>
        `,
      })
    : renderShell({
        title: 'Your massage has been canceled',
        heroEyebrow: 'Appointment Canceled',
        heroHeadline: 'Your massage has been canceled.',
        bodyHtml: `
          <p>Hi ${escapeHtml(req.primary_name)},</p>
          <p>Your massage for ${escapeHtml(formatDate(req.preferred_date))} at ${escapeHtml(formatTime(req.preferred_time))} has been canceled.</p>
          <p>Since this is within 5 days of your scheduled massage, payments already made are non-refundable, per our cancellation policy — your massage partner had reserved that time specifically for your stay.</p>
          <p>We're sorry this one didn't work out, and we hope you enjoy the rest of your time at Cedar Escape.</p>
          <p style="font-style:italic;">Cedar Escape</p>
        `,
      });
  await sendEmail(env, {
    to: req.primary_email,
    cc: env.COURTESY_EMAIL,
    subject: 'Your massage has been canceled',
    html: guestHtml,
  });

  // Partner email — logistics only, never financial detail.
  const partnerHtml = renderShell({
    title: `Cedar Escape massage canceled — ${formatDate(req.preferred_date)}`,
    heroEyebrow: 'Schedule Update',
    heroHeadline: 'This appointment has been canceled.',
    bodyHtml: `
      <p>Hi ${escapeHtml(env.PARTNER_NAME || 'there')},</p>
      <p>The Cedar Escape massage scheduled for:</p>
      <p style="font-size:17px;margin-top:10px;"><strong>${escapeHtml(formatDate(req.preferred_date))} at ${escapeHtml(formatTime(req.preferred_time))}</strong></p>
      <p style="margin-top:14px;">has been canceled. We wanted to let you know right away so the time can be reopened on your schedule.</p>
      <p>Thank you,<br>Cedar Escape Team</p>
    `,
  });

  let attachments;
  if (req.confirmed_start && req.confirmed_minutes) {
    const icsCancel = buildIcsCancel({
      uid: req.id,
      startDate: req.confirmed_start,
      minutes: req.confirmed_minutes,
      summary: 'In-Home Massage at Cedar Escape',
      location: 'Cedar Escape, Massanutten, VA',
    });
    attachments = [{ filename: 'cedar-escape-massage-cancelled.ics', content: btoa(icsCancel) }];
  }

  await sendEmail(env, {
    to: env.PARTNER_EMAIL,
    cc: env.COURTESY_EMAIL,
    subject: `Cedar Escape massage canceled — ${formatDate(req.preferred_date)}`,
    html: partnerHtml,
    attachments,
  });

  const outcomeText = eligibleForRefund
    ? `Your payments totaling ${formatCents(refundedCents)} have been refunded.`
    : 'Since this is within 5 days of your appointment, payments already made are non-refundable, per our cancellation policy.';

  return page('Appointment cancelled', `<p style="font-size:15px;color:#4b453b;line-height:1.6;">${outcomeText}</p>`);
}
