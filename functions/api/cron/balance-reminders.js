import { findBookingsDueForReminder, getItems, updateStatus, logEvent } from '../../_shared/db.js';
import { createToken, getOrCreateToken } from '../../_shared/tokens.js';
import { sendEmail, renderShell, renderButton, formatCents, renderOrderSummary } from '../../_shared/email.js';
import { SERVICES } from '../../_shared/pricing.js';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function serviceLabelFor(code) {
  return SERVICES[code] ? SERVICES[code].label : code;
}

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const db = env.MASSAGE_DB;
  const bookings = await findBookingsDueForReminder(db);
  const baseUrl = new URL(request.url).origin;

  for (const req of bookings) {
    const payToken = await createToken(db, req.id, 'balance_pay');
    const payUrl = `${baseUrl}/api/massage/pay/${payToken}`;
    const cancelToken = await getOrCreateToken(db, req.id, 'cancel');
    const cancelUrl = `${baseUrl}/api/massage/cancel/${cancelToken}`;
    const items = await getItems(db, req.id);
    const orderSummaryHtml = renderOrderSummary(items, serviceLabelFor);

    const guestHtml = renderShell({
      title: 'Your Cedar Escape massage balance is due',
      bodyHtml: `
        <p>Hi ${escapeHtml(req.primary_name)},</p>
        <p>Your in-home massage at Cedar Escape is coming up:</p>
        <p style="font-size:17px;"><strong>${escapeHtml(req.preferred_date)} at ${escapeHtml(req.preferred_time)}</strong></p>
        <div style="margin:18px 0;">${orderSummaryHtml}</div>
        <p>Remaining balance: <strong>${formatCents(req.balance_cents)}</strong></p>
        <div style="text-align:center;margin:28px 0;">${renderButton({ href: payUrl, label: 'PAY REMAINING BALANCE →' })}</div>
        <p>Once the balance is paid, you're all set.</p>
        <p>See you soon,<br>Cedar Escape</p>
        <p style="margin-top:20px;font-size:13px;">Need to cancel? <a href="${cancelUrl}" style="color:#232D1D;">Cancel your appointment</a></p>
      `,
    });
    await sendEmail(env, {
      to: req.primary_email,
      cc: env.COURTESY_EMAIL,
      subject: 'Your Cedar Escape massage balance is due',
      html: guestHtml,
    });

    await updateStatus(db, req.id, 'BALANCE_DUE', { balance_reminder_sent: 1 });
    await logEvent(db, req.id, 'balance_reminder_sent');
  }

  return new Response(JSON.stringify({ processed: bookings.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
