import { findBookingsDueForReminder, updateStatus, logEvent } from '../../_shared/db.js';
import { createToken } from '../../_shared/tokens.js';
import { sendEmail, renderShell, renderButton, renderPanel, renderPanelRow, formatCents, formatDate, formatTime, HERO_IMAGES } from '../../_shared/email.js';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    const checkoutUrl = `${baseUrl}/add-ons/massage/checkout/${payToken}`;

    // Guest-only — the massage partner does not receive balance/payment emails.
    const guestHtml = renderShell({
      title: 'Your massage is coming up',
      heroEyebrow: 'A Little Reminder',
      heroHeadline: 'Your massage is almost here.',
      heroImage: HERO_IMAGES.spa,
      bodyHtml: `
        <p>Hi ${escapeHtml(req.primary_name)},</p>
        <p>Your in-home massage at Cedar Escape is coming up soon! Please review the details below and take care of any remaining balance.</p>
        <p style="font-size:17px;margin-top:14px;"><strong>${escapeHtml(formatDate(req.preferred_date))} at ${escapeHtml(formatTime(req.preferred_time))}</strong></p>
        ${renderPanel(renderPanelRow('Amount due', formatCents(req.balance_cents), 'price'))}
        <div style="text-align:center;margin:28px 0;">${renderButton({ href: checkoutUrl, label: 'PAY REMAINING BALANCE →' })}</div>
        <p>Once that's taken care of, you're all set. We're looking forward to a wonderful experience!</p>
        <p style="font-style:italic;">Cedar Escape</p>
      `,
    });
    await sendEmail(env, {
      to: req.primary_email,
      cc: env.COURTESY_EMAIL,
      subject: 'Your massage is coming up',
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
