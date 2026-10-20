import { verifyTurnstile } from '../_shared/rewards-turnstile.js';
import { sendEmail, renderShell, renderPanel, renderPanelRow } from '../_shared/email.js';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  // Hidden honeypot field: real visitors never fill it in. Pretend success so bots don't retry.
  if (body.website) return json({ ok: true });

  const yourName = String(body.yourName || '').trim();
  const yourEmail = String(body.yourEmail || '').trim();
  const referrerName = String(body.referrerName || '').trim();

  if (!yourName || yourName.length > 80) return json({ error: 'Please enter your name.' }, 400);
  if (!EMAIL_RE.test(yourEmail) || yourEmail.length > 120) return json({ error: 'Please enter a valid email.' }, 400);
  if (!referrerName || referrerName.length > 80) return json({ error: 'Please tell us who referred you.' }, 400);

  const ok = await verifyTurnstile(env, body.turnstileToken, request.headers.get('CF-Connecting-IP'));
  if (!ok) return json({ error: 'Verification failed. Please try again.' }, 400);

  const html = renderShell({
    title: 'Cedar Escape: new referral',
    heroEyebrow: 'Referral — Informational',
    heroHeadline: 'A guest was referred.',
    bodyHtml: `
      ${renderPanel(
        renderPanelRow('New guest', escapeHtml(yourName), 'guests') +
          renderPanelRow('Their email', escapeHtml(yourEmail), 'guests') +
          renderPanelRow('Referred by', escapeHtml(referrerName), 'guests')
      )}
      <p>When their booking comes in, match it by that email in Hospitable and add <strong>REFERRAL: ${escapeHtml(referrerName)}</strong> to the reservation's notes. The $100 credit is due after their stay is complete.</p>
    `,
  });

  try {
    await sendEmail(env, {
      to: env.COURTESY_EMAIL,
      subject: `Cedar Escape referral: ${yourName} referred by ${referrerName}`.replace(/[\r\n<>]/g, ' '),
      html,
      replyTo: yourEmail,
    });
  } catch (err) {
    console.error('referral email failed', err);
    return json({ error: 'We could not send that right now. Please reply to your booking confirmation with the name instead.' }, 500);
  }

  return json({ ok: true });
}
