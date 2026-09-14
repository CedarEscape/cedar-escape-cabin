// Resend wrapper — plain fetch(), no SDK, to keep the Functions bundle small.

const BRAND = {
  cream: '#F6F1E6',
  creamDeep: '#EEE6D6',
  forestDeep: '#232D1D',
  forest: '#37452F',
  gold: '#C0973F',
  goldBright: '#D6B15C',
  ink: '#2B271F',
};

function treeSvg(color) {
  return (
    'data:image/svg+xml;base64,' +
    btoa(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="26" height="26"><path fill="${color}" d="M20 2 12 14h4l-7 10h6l-6 9h22l-6-9h6l-7-10h4z"/></svg>`
    )
  );
}
const TREE_DARK = treeSvg('%23232D1D');
const TREE_LIGHT = treeSvg('%23F6F1E6');

// Shared branded shell every massage email is wrapped in: a plain cream/dark-green
// logo lockup, a warm "hero" band with an italic headline (no stock photos, per
// project policy — this project never uses unlicensed imagery), rounded detail
// panels, and a matching footer, echoing the approved Cedar Escape mockup.
// Built with nested <table> (not div/flexbox/CSS gradients as the only signal)
// for real compatibility with Outlook's Word rendering engine and older mail apps.
export function renderShell({ title, heroEyebrow, heroHeadline, bodyHtml }) {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:${BRAND.creamDeep};font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.creamDeep};">
  <tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${BRAND.cream};">

    <tr><td align="center" bgcolor="${BRAND.cream}" style="padding:26px 32px 18px;">
      <img src="${TREE_DARK}" width="26" height="26" alt="" style="display:block;margin:0 auto 8px;">
      <div style="font-family:Georgia,serif;letter-spacing:0.16em;font-size:19px;font-weight:bold;color:${BRAND.forestDeep};">CEDAR ESCAPE</div>
      <div style="font-size:11px;letter-spacing:0.16em;color:${BRAND.gold};margin-top:4px;">MASSANUTTEN, VA</div>
    </td></tr>

    <tr><td align="center" bgcolor="${BRAND.forestDeep}" style="background:linear-gradient(155deg, ${BRAND.forest} 0%, ${BRAND.forestDeep} 100%);padding:44px 32px;">
      ${heroEyebrow ? `<div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND.goldBright};margin-bottom:10px;">${heroEyebrow}</div>` : ''}
      <div style="font-family:Georgia,serif;font-style:italic;font-size:28px;line-height:1.25;color:${BRAND.cream};">${heroHeadline}</div>
    </td></tr>

    <tr><td style="padding:36px 32px;color:${BRAND.ink};font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.65;">
      ${bodyHtml}
    </td></tr>

    <tr><td align="center" bgcolor="${BRAND.forestDeep}" style="color:rgba(246,241,230,0.8);padding:30px 32px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;">
      <img src="${TREE_LIGHT}" width="20" height="20" alt="" style="display:block;margin:0 auto 8px;">
      <div style="color:${BRAND.cream};font-weight:bold;letter-spacing:0.1em;">CEDAR ESCAPE</div>
      <div style="margin-top:8px;letter-spacing:0.06em;">RELAX &nbsp;&bull;&nbsp; RECONNECT &nbsp;&bull;&nbsp; MAKE MEMORIES</div>
      <div style="margin-top:12px;"><a href="https://cedarescapecabin.com" style="color:${BRAND.goldBright};text-decoration:none;">cedarescapecabin.com</a></div>
    </td></tr>

  </table>
  </td></tr>
  </table>
</body>
</html>`;
}

export function renderPanel(rowsHtml) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BRAND.creamDeep}" style="background:${BRAND.creamDeep};border-radius:6px;margin:22px 0;"><tr><td style="padding:20px 22px;">${rowsHtml}</td></tr></table>`;
}

// Table-based (not flexbox) for real email-client compatibility — Outlook's
// Word rendering engine and several mobile mail apps don't support flexbox.
export function renderPanelRow(label, value) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;"><tr>
    <td style="padding:7px 0;color:#6b6555;vertical-align:top;width:42%;">${label}</td>
    <td style="padding:7px 0;color:${BRAND.forestDeep};font-weight:600;text-align:right;vertical-align:top;">${value}</td>
  </tr></table>`;
}

export function renderButton({ href, label, style = 'solid' }) {
  const solid = `background:${BRAND.forestDeep};color:${BRAND.cream};border:1px solid ${BRAND.forestDeep};`;
  const outline = `background:transparent;color:${BRAND.forestDeep};border:1px solid ${BRAND.forestDeep};`;
  return `<a href="${href}" style="display:inline-block;padding:15px 30px;margin:6px 8px;border-radius:30px;text-decoration:none;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:bold;font-size:13.5px;letter-spacing:0.04em;${style === 'solid' ? solid : outline}">${label}</a>`;
}

export function formatCents(cents) {
  return '$' + (cents / 100).toFixed(2);
}

// Guest-entered date/time come from <input type="date"> / <input type="time">
// as raw "2026-11-16" / "14:00" — format for friendly display everywhere a
// human reads them (emails, landing pages). Falls back to the raw string if
// it isn't in the expected shape rather than throwing.
export function formatDate(isoDate) {
  if (!isoDate) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export function formatTime(time24) {
  if (!time24) return '';
  const m = /^(\d{1,2}):(\d{2})$/.exec(time24);
  if (!m) return time24;
  let h = +m[1];
  const min = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${ampm}`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// items: D1 rows from massage_request_items (snake_case columns).
export function renderOrderSummary(items, serviceLabelFor) {
  const rows = items
    .map((i) => renderPanelRow(`${escapeHtml(i.guest_label)}<br><span style="font-size:12.5px;color:#9a917a;">${escapeHtml(serviceLabelFor(i.service_code))}${i.cbd_addon ? ' + CBD Enhancement' : ''}</span>`, formatCents(i.service_price_cents + i.cbd_price_cents)))
    .join('');
  return renderPanel(rows);
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
