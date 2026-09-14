import { consumeToken, createToken, invalidateTokens } from '../../../_shared/tokens.js';
import { getRequest, getItems, updateStatus, logEvent } from '../../../_shared/db.js';
import { sendEmail, renderShell, renderButton, formatCents, renderOrderSummary } from '../../../_shared/email.js';
import { SERVICES } from '../../../_shared/pricing.js';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function serviceLabelFor(code) {
  return SERVICES[code] ? SERVICES[code].label : code;
}

function landingPage(message) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Cedar Escape</title></head>
     <body style="font-family:Georgia,serif;background:#F6F1E6;color:#2B271F;text-align:center;padding:80px 20px;">
       <h1 style="font-style:italic;color:#232D1D;">Cedar Escape</h1>
       <p style="font-size:16px;max-width:480px;margin:20px auto;">${message}</p>
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
    return landingPage('This link is missing a valid decision.');
  }

  const tokenRow = await consumeToken(db, token, 'partner_respond');
  if (!tokenRow) {
    return landingPage('This link is invalid or has expired.');
  }

  const req = await getRequest(db, tokenRow.request_id);
  if (!req) {
    return landingPage('This request could not be found.');
  }

  if (tokenRow.alreadyUsed || req.status !== 'REQUESTED') {
    const friendly = req.status === 'UNAVAILABLE' ? 'marked Not Available' : 'marked Available';
    return landingPage(`This request has already been ${friendly}. No further action is needed.`);
  }

  await invalidateTokens(db, req.id, 'partner_respond');

  if (decision === 'unavailable') {
    await updateStatus(db, req.id, 'UNAVAILABLE');
    await logEvent(db, req.id, 'partner_unavailable');

    const staffHtml = renderShell({
      title: 'Massage Partner: Not Available',
      bodyHtml: `
        <p>Our massage partner is <strong>not available</strong> for this request:</p>
        <p><strong>${escapeHtml(req.primary_name)}</strong> (${escapeHtml(req.primary_email)}) — ${escapeHtml(req.preferred_date)} at ${escapeHtml(req.preferred_time)}</p>
        <p>Please reach out to the guest to coordinate an alternate date/time. The guest has not been notified automatically.</p>
      `,
    });
    await sendEmail(env, {
      to: env.COURTESY_EMAIL,
      subject: 'Massage Partner: Not Available — Please Follow Up',
      html: staffHtml,
    });

    return landingPage('Thanks — we\'ve recorded that you\'re not available. Cedar Escape will follow up with the guest to coordinate an alternate time.');
  }

  // decision === 'available'
  await updateStatus(db, req.id, 'AVAILABLE_AWAITING_DEPOSIT');
  await logEvent(db, req.id, 'partner_available');

  const payToken = await createToken(db, req.id, 'deposit_pay');
  const baseUrl = url.origin;
  const payUrl = `${baseUrl}/api/massage/pay/${payToken}`;
  const items = await getItems(db, req.id);
  const orderSummaryHtml = renderOrderSummary(items, serviceLabelFor);

  const guestHtml = renderShell({
    title: 'Your massage request is available',
    bodyHtml: `
      <p>Hi ${escapeHtml(req.primary_name)},</p>
      <p>Good news — our massage partner is available for the time you requested.</p>
      <p style="font-size:17px;"><strong>${escapeHtml(req.preferred_date)} at ${escapeHtml(req.preferred_time)}</strong></p>
      <div style="margin:18px 0;">${orderSummaryHtml}</div>
      <p>To hold the appointment, the 50% deposit is <strong>${formatCents(req.deposit_cents)}</strong>. The remaining <strong>${formatCents(req.balance_cents)}</strong> will be due 48 hours before your massage.</p>
      <div style="text-align:center;margin:28px 0;">${renderButton({ href: payUrl, label: 'REVIEW + PAY DEPOSIT →' })}</div>
      <p>Once the deposit is paid, your appointment is confirmed and we'll send over your confirmation and calendar invite.</p>
      <p>See you soon,<br>Cedar Escape</p>
    `,
  });
  await sendEmail(env, {
    to: req.primary_email,
    cc: env.COURTESY_EMAIL,
    subject: 'Your massage request is available',
    html: guestHtml,
  });

  return landingPage('Thanks — the guest has been sent a secure link to pay the deposit and confirm their appointment.');
}
