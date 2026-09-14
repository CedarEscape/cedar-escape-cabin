// Resend wrapper — plain fetch(), no SDK, to keep the Functions bundle small.

const BRAND = {
  cream: '#FAF6EE',
  creamDeep: '#F2EBDD',
  forestDeep: '#232D1D',
  forest: '#37452F',
  gold: '#C0973F',
  goldBright: '#D6B15C',
  ink: '#2B271F',
};

// Hosted on the production domain regardless of which environment sends the
// email (local dev / preview / prod) — Resend's servers need a real public
// HTTPS URL, and these static images are already live there.
export const HERO_IMAGES = {
  spa: 'https://cedarescapecabin.com/images/email/hero-spa.jpg',
  mountain: 'https://cedarescapecabin.com/images/email/hero-mountain.jpg',
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
export function renderShell({ title, heroEyebrow, heroHeadline, heroImage, bodyHtml }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
<style>
  :root { color-scheme: light; supported-color-schemes: light; }
  body, table, td { -webkit-text-size-adjust: 100%; }
  /* Force light backgrounds even when a mail client's dark mode tries to
     invert colors it doesn't recognize as intentionally light. */
  @media (prefers-color-scheme: dark) {
    body, .ce-body, .ce-panel { background: ${BRAND.cream} !important; }
    .ce-panel { background: ${BRAND.creamDeep} !important; }
    .ce-ink { color: ${BRAND.ink} !important; }
  }
  [data-ogsc] body, [data-ogsc] .ce-body { background: ${BRAND.cream} !important; }
  [data-ogsc] .ce-panel { background: ${BRAND.creamDeep} !important; }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.creamDeep};font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.creamDeep};">
  <tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${BRAND.cream};">

    <tr><td align="center" bgcolor="${BRAND.cream}" style="padding:26px 32px 14px;">
      <img src="${TREE_DARK}" width="26" height="26" alt="" style="display:block;margin:0 auto 8px;">
      <div style="font-family:Georgia,serif;letter-spacing:0.16em;font-size:19px;font-weight:bold;color:${BRAND.forestDeep};">CEDAR ESCAPE</div>
      <div style="font-size:11px;letter-spacing:0.16em;color:${BRAND.gold};font-weight:bold;margin-top:4px;">MASSANUTTEN, VA</div>
      <div style="margin:14px auto 0;width:120px;font-size:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="border-top:1px solid ${BRAND.gold};width:44%;"></td>
          <td style="width:12%;text-align:center;color:${BRAND.gold};font-size:13px;line-height:1;">&#9670;</td>
          <td style="border-top:1px solid ${BRAND.gold};width:44%;"></td>
        </tr></table>
      </div>
    </td></tr>

    <tr><td align="center" bgcolor="${BRAND.forestDeep}" background="${heroImage || ''}" style="background-color:${BRAND.forestDeep};${heroImage ? `background-image:linear-gradient(rgba(35,45,29,0.6),rgba(35,45,29,0.8)),url('${heroImage}');background-size:cover;background-position:center;` : `background-image:linear-gradient(155deg, ${BRAND.forest} 0%, ${BRAND.forestDeep} 100%);`}padding:46px 32px;border-top:4px solid ${BRAND.gold};">
      <!--[if gte mso 9]>
      <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:220px;">
      <v:fill type="${heroImage ? 'frame' : 'gradient'}" src="${heroImage || ''}" color="${BRAND.forestDeep}" color2="${BRAND.forest}" />
      <v:textbox inset="0,0,0,0">
      <![endif]-->
      <div>
      ${heroEyebrow ? `<div style="font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:${BRAND.goldBright};font-weight:bold;margin-bottom:12px;">${heroEyebrow}</div>` : ''}
      <div style="font-family:Georgia,serif;font-style:italic;font-size:30px;line-height:1.25;color:${BRAND.cream};">${heroHeadline}</div>
      </div>
      <!--[if gte mso 9]>
      </v:textbox>
      </v:rect>
      <![endif]-->
    </td></tr>

    <tr><td class="ce-body ce-ink" bgcolor="${BRAND.cream}" style="background:${BRAND.cream};padding:36px 32px;color:${BRAND.ink};font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.65;">
      ${bodyHtml}
    </td></tr>

    <tr><td align="center" bgcolor="${BRAND.forestDeep}" style="color:rgba(250,246,238,0.8);padding:30px 32px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;">
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

function svgIcon(path) {
  return (
    'data:image/svg+xml;base64,' +
    btoa(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="%23C0973F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`.replace(/%23/g, '#')
    )
  );
}
export const ICONS = {
  calendar: svgIcon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>'),
  clock: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>'),
  guests: svgIcon('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.3"/><path d="M2 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1M15.5 14.2A4.3 4.3 0 0 1 19 18v2"/>'),
  price: svgIcon('<path d="M20.6 12.3 12.7 20a2 2 0 0 1-2.8 0l-6-6a2 2 0 0 1 0-2.8l7.7-7.9a2 2 0 0 1 1.5-.6l5.5.2a2 2 0 0 1 1.9 1.9l.2 5.5a2 2 0 0 1-.1 1.6Z"/><circle cx="14.5" cy="9.5" r="1.2"/>'),
};
function iconImg(name) {
  return name && ICONS[name] ? `<img src="${ICONS[name]}" width="15" height="15" style="vertical-align:-2px;margin-right:6px;" alt="">` : '';
}

export function renderPanel(rowsHtml) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td class="ce-panel" bgcolor="${BRAND.creamDeep}" style="background:${BRAND.creamDeep};border-radius:6px;border-top:3px solid ${BRAND.gold};padding:20px 22px;">${rowsHtml}</td></tr></table>`;
}

// Table-based (not flexbox) for real email-client compatibility — Outlook's
// Word rendering engine and several mobile mail apps don't support flexbox.
export function renderPanelRow(label, value, icon) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;"><tr>
    <td style="padding:7px 0;color:#6b6555;vertical-align:top;width:42%;">${iconImg(icon)}${label}</td>
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
    from: 'Cedar Escape <massage@cedarescapecabin.com>',
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
