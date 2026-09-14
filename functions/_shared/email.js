// Resend wrapper — plain fetch(), no SDK, to keep the Functions bundle small.

const BRAND = {
  cream: '#F6F1E6',
  forestDeep: '#232D1D',
  forest: '#37452F',
  gold: '#C0973F',
  goldBright: '#D6B15C',
  ink: '#2B271F',
};

// Shared branded shell every massage email is wrapped in, matching the
// site's existing look (same colors/fonts as the rest of cedarescapecabin.com).
export function renderShell({ title, bodyHtml }) {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:600px;margin:0 auto;background:${BRAND.cream};">
    <div style="background:${BRAND.forestDeep};padding:28px 32px;text-align:center;">
      <div style="font-family:Georgia,serif;letter-spacing:0.14em;font-size:20px;font-weight:bold;color:${BRAND.cream};">CEDAR <span style="color:${BRAND.goldBright};">ESCAPE</span></div>
      <div style="font-size:11px;letter-spacing:0.18em;color:${BRAND.goldBright};margin-top:4px;">MASSANUTTEN, VA</div>
      <div style="font-size:10px;letter-spacing:0.12em;color:rgba(246,241,230,0.7);margin-top:10px;">RELAX &nbsp;&bull;&nbsp; RECONNECT &nbsp;&bull;&nbsp; MAKE MEMORIES</div>
    </div>
    <div style="padding:36px 32px;color:${BRAND.ink};font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.6;">
      ${bodyHtml}
    </div>
    <div style="background:${BRAND.forestDeep};color:rgba(246,241,230,0.75);padding:26px 32px;text-align:center;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;">
      <div style="color:${BRAND.cream};font-weight:bold;letter-spacing:0.08em;">CEDAR ESCAPE</div>
      <div style="margin-top:6px;">RELAX &bull; RECONNECT &bull; MAKE MEMORIES</div>
      <div style="margin-top:10px;"><a href="https://cedarescapecabin.com" style="color:${BRAND.goldBright};text-decoration:none;">cedarescapecabin.com</a></div>
    </div>
  </div>
</body>
</html>`;
}

export function renderButton({ href, label, style = 'solid' }) {
  const solid = `background:${BRAND.forestDeep};color:${BRAND.cream};border:1px solid ${BRAND.forestDeep};`;
  const outline = `background:transparent;color:${BRAND.forestDeep};border:1px solid ${BRAND.forestDeep};`;
  return `<a href="${href}" style="display:inline-block;padding:14px 26px;margin:6px 8px;border-radius:2px;text-decoration:none;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:bold;font-size:13.5px;letter-spacing:0.03em;${style === 'solid' ? solid : outline}">${label}</a>`;
}

export function formatCents(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// items: D1 rows from massage_request_items (snake_case columns).
export function renderOrderSummary(items, serviceLabelFor) {
  return items
    .map(
      (i) =>
        `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(43,39,31,0.1);">
           <span>${escapeHtml(i.guest_label)} — ${escapeHtml(serviceLabelFor(i.service_code))}${i.cbd_addon ? ' + CBD Oil Add-On' : ''}</span>
           <span>${formatCents(i.service_price_cents + i.cbd_price_cents)}</span>
         </div>`
    )
    .join('');
}

export async function sendEmail(env, { to, cc, subject, html, attachments }) {
  const payload = {
    from: 'Cedar Escape <onboarding@resend.dev>',
    to: Array.isArray(to) ? to : [to],
    reply_to: env.COURTESY_EMAIL,
    subject,
    html,
  };
  if (cc) payload.cc = Array.isArray(cc) ? cc : [cc];
  if (attachments) payload.attachments = attachments;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend send failed (${res.status}): ${text}`);
  }
  return res.json();
}
