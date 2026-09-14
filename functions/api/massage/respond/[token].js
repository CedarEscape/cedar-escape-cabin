import { consumeToken, createToken, invalidateTokens } from '../../../_shared/tokens.js';
import { getRequest, getItems, updateStatus, logEvent } from '../../../_shared/db.js';
import { sendEmail, renderShell, renderButton, renderPanel, renderPanelRow, formatCents, formatDate, formatTime, renderOrderSummary } from '../../../_shared/email.js';
import { SERVICES } from '../../../_shared/pricing.js';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function serviceLabelFor(code) {
  return SERVICES[code] ? SERVICES[code].label : code;
}

function landingPage(heading, message) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cedar Escape</title>
     <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,500&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet"></head>
     <body style="margin:0;font-family:'DM Sans',sans-serif;background:#F6F1E6;color:#2B271F;">
       <div style="background:linear-gradient(155deg,#37452F 0%,#232D1D 100%);padding:48px 24px;text-align:center;">
         <div style="font-family:'Playfair Display',serif;font-style:italic;color:#F6F1E6;font-size:15px;letter-spacing:0.08em;">CEDAR ESCAPE</div>
       </div>
       <div style="max-width:480px;margin:0 auto;padding:56px 24px;text-align:center;">
         <h1 style="font-family:'Playfair Display',serif;font-style:italic;font-weight:500;font-size:28px;color:#232D1D;margin:0 0 16px;">${heading}</h1>
         <p style="font-size:15.5px;color:#4b453b;line-height:1.6;">${message}</p>
       </div>
     </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}

export async function onRequestGet({ request, env, params }) {
  const token = params.token;
  const url = new URL(request.url);
  const decision = url.searchParams.get('decision');
  const db = env.MASSAGE_DB;

  if (decision !== 'available' && decision !== 'unavailable') {
    return landingPage('Something went wrong', 'This link is missing a valid decision.');
  }

  const tokenRow = await consumeToken(db, token, 'partner_respond');
  if (!tokenRow) {
    return landingPage('Link expired', 'This link is invalid or has expired.');
  }

  const req = await getRequest(db, tokenRow.request_id);
  if (!req) {
    return landingPage('Request not found', 'This request could not be found.');
  }

  if (tokenRow.alreadyUsed || req.status !== 'REQUESTED') {
    return landingPage('Already handled', 'This request has already been responded to — no further action is needed.');
  }

  await invalidateTokens(db, req.id, 'partner_respond');

  if (decision === 'unavailable') {
    await updateStatus(db, req.id, 'UNAVAILABLE');
    await logEvent(db, req.id, 'partner_unavailable');

    // Operational alert to Cedar Escape only — the guest is not auto-notified.
    const staffHtml = renderShell({
      title: `Massage request needs another option — ${req.primary_name}`,
      heroEyebrow: 'Needs Attention',
      heroHeadline: 'Time to find another option.',
      bodyHtml: `
        <p>Our massage partner isn't available for this request.</p>
        ${renderPanel(
          renderPanelRow('Guest', `${escapeHtml(req.primary_name)}<br>${escapeHtml(req.primary_email)}`) +
            renderPanelRow('Preferred', `${escapeHtml(formatDate(req.preferred_date))} at ${escapeHtml(formatTime(req.preferred_time))}`) +
            (req.alternate_date ? renderPanelRow('Alternate', `${escapeHtml(formatDate(req.alternate_date))} at ${escapeHtml(formatTime(req.alternate_time))}`) : '')
        )}
        <p><strong>The guest has not been contacted.</strong> Please follow up to coordinate an alternate date or time.</p>
      `,
    });
    await sendEmail(env, {
      to: env.COURTESY_EMAIL,
      subject: `Massage request needs another option — ${req.primary_name}`,
      html: staffHtml,
    });

    return landingPage('Response received.', "You marked this request as not available. Cedar Escape will follow up with the guest to coordinate another option — thank you for letting us know so quickly.");
  }

  // decision === 'available'
  await updateStatus(db, req.id, 'AVAILABLE_AWAITING_DEPOSIT');
  await logEvent(db, req.id, 'partner_available');

  const payToken = await createToken(db, req.id, 'deposit_pay');
  const baseUrl = url.origin;
  const checkoutUrl = `${baseUrl}/add-ons/massage/checkout/${payToken}`;
  const items = await getItems(db, req.id);
  const orderSummaryHtml = renderOrderSummary(items, serviceLabelFor);

  const guestHtml = renderShell({
    title: 'Your massage time works',
    heroEyebrow: 'Availability Update',
    heroHeadline: "You're all set!",
    bodyHtml: `
      <p>Hi ${escapeHtml(req.primary_name)},</p>
      <p>Great news — our massage partner is available for your requested time. Please review the details below and submit your 50% deposit to confirm your appointment.</p>
      <p style="font-size:17px;margin-top:16px;"><strong>${escapeHtml(formatDate(req.preferred_date))} at ${escapeHtml(formatTime(req.preferred_time))}</strong></p>
      ${orderSummaryHtml}
      <p>Due now to confirm (50%): <strong>${formatCents(req.deposit_cents)}</strong><br>Remaining balance: <strong>${formatCents(req.balance_cents)}</strong> &mdash; due 48 hours before your appointment.</p>
      <div style="text-align:center;margin:28px 0;">${renderButton({ href: checkoutUrl, label: 'REVIEW + PAY DEPOSIT →' })}</div>
      <p>We can't wait for you to enjoy this special in-home experience!</p>
      <p style="margin-top:16px;">Thank you,<br>Cedar Escape Team</p>
    `,
  });
  await sendEmail(env, {
    to: req.primary_email,
    cc: env.COURTESY_EMAIL,
    subject: 'Your massage time works',
    html: guestHtml,
  });

  // Partner-facing acknowledgment: availability logistics only, no payment info.
  return landingPage(
    'Availability received.',
    `Thanks! We have you marked as available for <strong>${escapeHtml(formatDate(req.preferred_date))} at ${escapeHtml(formatTime(req.preferred_time))}</strong>. We'll take it from here and will send you a confirmation once everything is finalized. Cedar Escape`
  );
}
