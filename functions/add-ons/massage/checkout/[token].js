import { peekToken } from '../../../_shared/tokens.js';
import { getRequest, getItems } from '../../../_shared/db.js';
import { SERVICES } from '../../../_shared/pricing.js';
import { formatCents, formatDate, formatTime } from '../../../_shared/email.js';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function serviceLabelFor(code) {
  return SERVICES[code] ? SERVICES[code].label : code;
}

function page(bodyHtml) {
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Review Your Massage Appointment | Cedar Escape</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600&family=Playfair+Display:ital,wght@0,500;1,500;1,600&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root { --cream:#F6F1E6; --cream-deep:#EEE6D6; --ink:#2B271F; --forest:#37452F; --forest-deep:#232D1D; --gold:#C0973F; --gold-bright:#D6B15C; --line:rgba(43,39,31,0.14); }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--cream); color: var(--ink); font-family: 'DM Sans', sans-serif; font-size: 16px; line-height: 1.6; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 60px 24px 80px; }
  .eyebrow { font-family: 'Cinzel', serif; font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--gold); font-weight: 600; text-align: center; }
  h1 { font-family: 'Playfair Display', serif; font-style: italic; font-weight: 500; font-size: clamp(28px, 4vw, 38px); color: var(--forest-deep); text-align: center; margin: 10px 0 8px; }
  .sub { text-align: center; color: #4b453b; font-size: 15px; margin-bottom: 32px; }
  .panel { background: var(--cream-deep); border: 1px solid var(--line); border-radius: 4px; padding: 24px 26px; margin-bottom: 20px; }
  .when { font-size: 17px; font-weight: 700; color: var(--forest-deep); margin-bottom: 18px; }
  .item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 14.5px; }
  .item:last-of-type { border-bottom: none; }
  .item .name { color: var(--forest-deep); font-weight: 600; }
  .item .svc { color: #5a5346; font-size: 13px; }
  .totals { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line); }
  .totals-row { display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0; color: #4b453b; }
  .totals-row.due { font-size: 18px; font-weight: 700; color: var(--forest-deep); margin-top: 6px; }
  .btn { display: block; width: 100%; text-align: center; background: linear-gradient(180deg, var(--gold-bright), var(--gold)); color: var(--forest-deep); font-family: 'DM Sans', sans-serif; font-weight: 700; font-size: 15px; text-decoration: none; padding: 16px 20px; border-radius: 2px; box-sizing: border-box; }
  .note { text-align: center; font-size: 12.5px; color: #6b6555; margin-top: 16px; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="eyebrow">Massage Request</div>
    ${bodyHtml}
  </div>
</body>
</html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}

export async function onRequestGet({ env, params }) {
  const token = params.token;
  const db = env.MASSAGE_DB;

  let tokenRow = await peekToken(db, token, 'deposit_pay');
  let purpose = 'deposit';
  if (!tokenRow) {
    tokenRow = await peekToken(db, token, 'balance_pay');
    purpose = 'balance';
  }
  if (!tokenRow) {
    return page(`<h1>Link not found</h1><p class="sub">This review link is invalid or has expired.</p>`);
  }

  const req = await getRequest(db, tokenRow.request_id);
  if (!req) {
    return page(`<h1>Request not found</h1><p class="sub">We couldn't find this massage request.</p>`);
  }

  const expectedStatus = purpose === 'deposit' ? 'AVAILABLE_AWAITING_DEPOSIT' : 'BALANCE_DUE';
  if (tokenRow.used_at || req.status !== expectedStatus) {
    return page(`<h1>Already handled</h1><p class="sub">This payment has already been processed or is no longer available.</p>`);
  }

  const items = await getItems(db, req.id);
  const amountDue = purpose === 'deposit' ? req.deposit_cents : req.balance_cents;

  const itemsHtml = items
    .map(
      (i) =>
        `<div class="item"><div><div class="name">${escapeHtml(i.guest_label)}</div><div class="svc">${escapeHtml(serviceLabelFor(i.service_code))}${i.cbd_addon ? ' + CBD Enhancement' : ''}</div></div><div>${formatCents(i.service_price_cents + i.cbd_price_cents)}</div></div>`
    )
    .join('');

  const totalsHtml =
    purpose === 'deposit'
      ? `<div class="totals-row"><span>Total service value</span><span>${formatCents(req.subtotal_cents)}</span></div>
         <div class="totals-row"><span>Remaining balance (due 48 hrs before)</span><span>${formatCents(req.balance_cents)}</span></div>
         <div class="totals-row due"><span>Due now (50%)</span><span>${formatCents(req.deposit_cents)}</span></div>`
      : `<div class="totals-row"><span>Total service value</span><span>${formatCents(req.subtotal_cents)}</span></div>
         <div class="totals-row"><span>Already paid</span><span>${formatCents(req.deposit_paid_cents)}</span></div>
         <div class="totals-row due"><span>Remaining balance due</span><span>${formatCents(req.balance_cents)}</span></div>`;

  const payUrl = `/api/massage/pay/${token}`;

  return page(`
    <h1>Review + confirm your appointment.</h1>
    <p class="sub">${purpose === 'deposit' ? "We've confirmed availability with our massage partner. Review the details below before you pay." : 'Your remaining balance is due — review the details below before you pay.'}</p>
    <div class="panel">
      <div class="when">${escapeHtml(formatDate(req.preferred_date))} at ${escapeHtml(formatTime(req.preferred_time))}</div>
      ${itemsHtml}
      <div class="totals">${totalsHtml}</div>
    </div>
    <a href="${payUrl}" class="btn">PAY ${formatCents(amountDue)} + CONFIRM</a>
    <p class="note">${purpose === 'deposit' ? "Your appointment is not confirmed until this deposit is successfully paid." : 'Once paid, your balance will be settled in full.'}</p>
  `);
}
