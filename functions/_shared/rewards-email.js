import { sendEmail, renderShell, renderButton, renderPanel, renderPanelRow, formatCents } from './email.js';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------
// Cedar Rewards member email design (confirm + welcome).
// Compact cream card, deep cedar green, muted gold hairlines. Table layout,
// inline styles, system font stacks and hosted PNGs (not SVG data URIs, which
// Gmail and AOL block), so it holds up in Apple Mail, Gmail, AOL and Outlook.
// ---------------------------------------------------------------------------
export const RW_ASSET_BASE = 'https://cedarescapecabin.com/images/email';
const RW = {
  page: '#F2EBDD',
  card: '#FDF8EE', // matches the cream in the mockup's footer artwork

  green: '#1F3A2B',
  gold: '#B8913F',
  ink: '#2B271F',
  muted: '#6B6555',
  serif: "Georgia,'Times New Roman',Times,serif",
  sans: "'Helvetica Neue',Helvetica,Arial,sans-serif",
};

function rwRule(width) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr>
    <td width="${width}" style="border-top:1px solid ${RW.gold};font-size:0;line-height:0;">&nbsp;</td>
    <td style="padding:0 10px;color:${RW.gold};font-size:11px;line-height:1;">&#9670;</td>
    <td width="${width}" style="border-top:1px solid ${RW.gold};font-size:0;line-height:0;">&nbsp;</td>
  </tr></table>`;
}

function rwEyebrow() {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr>
    <td width="56" style="border-top:1px solid ${RW.gold};font-size:0;line-height:0;">&nbsp;</td>
    <td style="padding:0 16px;font-family:${RW.sans};font-size:14px;font-weight:bold;letter-spacing:0.26em;color:${RW.green};white-space:nowrap;">CEDAR REWARDS</td>
    <td width="56" style="border-top:1px solid ${RW.gold};font-size:0;line-height:0;">&nbsp;</td>
  </tr></table>`;
}

function rwButton(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr>
    <td width="300" align="center" bgcolor="${RW.green}" class="rw-btn" style="background:${RW.green};border-radius:6px;">
      <a href="${href}" style="display:block;padding:17px 24px;font-family:${RW.sans};font-size:16px;font-weight:bold;letter-spacing:0.1em;color:#FFFFFF;text-decoration:none;border-radius:6px;text-align:center;">${label}</a>
    </td>
  </tr></table>`;
}

function rwIconLine(icon, html) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr>
    <td valign="top" style="padding:2px 10px 0 0;"><img src="${RW_ASSET_BASE}/${icon}" width="18" height="18" alt="" style="display:block;border:0;"></td>
    <td style="font-family:${RW.sans};font-size:14.5px;line-height:1.5;color:${RW.ink};text-align:left;">${html}</td>
  </tr></table>`;
}

function rwShell({ title, preheader, headline, bodyHtml, contactsNote = false }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
<style>
  body, table, td, a { -webkit-text-size-adjust: 100%; }
  @media (max-width: 480px) {
    .rw-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .rw-h1 { font-size: 31px !important; }
    .rw-label { font-size: 11px !important; letter-spacing: 0.14em !important; }
    .rw-num { font-size: 52px !important; }
    .rw-btn { width: 270px !important; }
  }
  @media (prefers-color-scheme: dark) {
    body, .rw-page { background: ${RW.page} !important; }
    .rw-card { background: ${RW.card} !important; }
  }
</style>
</head>
<body class="rw-page" style="margin:0;padding:0;background:${RW.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="rw-page" bgcolor="${RW.page}" style="background:${RW.page};">
<tr><td align="center" style="padding:20px 10px;">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" class="rw-card" bgcolor="${RW.card}" style="width:100%;max-width:560px;background:${RW.card};">
    <tr><td height="10" bgcolor="${RW.green}" style="background:${RW.green};font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td height="2" bgcolor="${RW.gold}" style="background:${RW.gold};font-size:0;line-height:0;">&nbsp;</td></tr>

    <tr><td align="center" class="rw-pad" style="padding:28px 36px 0;">
      <img src="${RW_ASSET_BASE}/tree-cedar.png" width="28" height="28" alt="" style="display:block;margin:0 auto 8px;border:0;">
      <div style="font-family:${RW.serif};font-size:21px;font-weight:bold;letter-spacing:0.2em;color:${RW.green};">CEDAR ESCAPE</div>
      <div style="font-family:${RW.serif};font-size:11px;font-weight:bold;letter-spacing:0.2em;color:${RW.gold};margin:5px 0 10px;">MASSANUTTEN, VA</div>
      ${rwRule(52)}
    </td></tr>

    <tr><td align="center" class="rw-pad" style="padding:24px 30px 0;">
      ${rwEyebrow()}
      <div class="rw-h1" style="font-family:${RW.serif};font-style:italic;font-size:42px;line-height:1.12;color:${RW.green};margin:14px 0 0;">${headline}</div>
    </td></tr>

    ${bodyHtml}

    <tr><td align="center" class="rw-pad" style="padding:24px 36px 0;">${rwRule(90)}</td></tr>
    <tr><td align="center" class="rw-pad" style="padding:16px 30px 0;">
      ${rwIconLine('icon-mail.png', 'Questions? Just reply to this email &mdash; we&rsquo;re happy to help.')}
    </td></tr>
    ${contactsNote ? `<tr><td align="center" class="rw-pad" style="padding:8px 40px 0;font-family:${RW.sans};font-size:12.5px;line-height:1.5;color:${RW.muted};">Add this address to your contacts so our emails always reach your inbox.</td></tr>` : ''}

    <tr><td style="padding:22px 0 0;font-size:0;line-height:0;">
      <img src="${RW_ASSET_BASE}/rewards-mountains.jpg?v=2" width="560" alt="" style="display:block;width:100%;max-width:560px;height:auto;border:0;">
    </td></tr>
    <tr><td height="2" bgcolor="${RW.gold}" style="background:${RW.gold};font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td height="10" bgcolor="${RW.green}" style="background:${RW.green};font-size:0;line-height:0;">&nbsp;</td></tr>
  </table>
  <div style="font-family:${RW.sans};font-size:11px;color:${RW.muted};padding:14px 0 0;">Cedar Escape &middot; Massanutten, VA &middot; <a href="https://cedarescapecabin.com" style="color:${RW.muted};">cedarescapecabin.com</a></div>
</td></tr>
</table>
</body>
</html>`;
}

// EMAIL 1: account confirmation. Visual redesign only: verifyUrl, recipient,
// subject and sender are unchanged.
export async function sendVerifyEmail(env, { to, verifyUrl }) {
  const html = rwShell({
    title: 'Confirm your Cedar Rewards account',
    preheader: 'One quick step to activate your Cedar Rewards account.',
    headline: 'Confirm your account',
    contactsNote: true,
    bodyHtml: `
    <tr><td align="center" class="rw-pad" style="padding:16px 36px 0;font-family:${RW.sans};font-size:17px;line-height:1.6;color:${RW.ink};">
      You&rsquo;re one quick step away. Confirm your email to activate your Cedar Rewards account and access your member benefits.
    </td></tr>
    <tr><td align="center" class="rw-pad" style="padding:26px 36px 0;">${rwButton(verifyUrl, 'CONFIRM MY ACCOUNT')}</td></tr>
    <tr><td align="center" class="rw-pad" style="padding:18px 44px 0;font-family:${RW.sans};font-style:italic;font-size:15px;line-height:1.55;color:${RW.ink};">
      For your security, this confirmation link is single-use and expires in 15&nbsp;minutes.
    </td></tr>
`,
  });
  await sendEmail(env, { to, subject: 'Confirm your Cedar Rewards account', html });
}

// EMAIL 2: welcome / points available. Sent once, right after verification
// (the moment the account activates and the join bonus posts).
// balance = getAvailableBalance() after the bonus posts. pointsAwarded = the
// join bonus actually posted in that request, or null (line hidden).
export async function sendWelcomeGuestEmail(env, { to, balance, pointsAwarded, rewardsUrl }) {
  const bal = Number(balance || 0).toLocaleString('en-US');
  const awarded = pointsAwarded ? Number(pointsAwarded).toLocaleString('en-US') : null;
  const html = rwShell({
    title: 'Welcome to Cedar Rewards',
    preheader: `Your account is approved. You have ${bal} points.`,
    headline: 'You&rsquo;re officially in.',
    bodyHtml: `
    <tr><td align="center" class="rw-pad" style="padding:14px 36px 0;font-family:${RW.sans};font-size:17px;line-height:1.6;color:${RW.ink};">
      Welcome to Cedar Rewards. Your account is approved, and your rewards are ready.
    </td></tr>
    <tr><td align="center" class="rw-pad" style="padding:20px 30px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;margin:0 auto;border-collapse:separate;">
        <tr>
          <td height="13" style="font-size:0;line-height:0;">&nbsp;</td>
          <td rowspan="2" width="44" align="center" valign="middle" style="padding:0 6px;"><img src="${RW_ASSET_BASE}/tree-cedar.png" width="26" height="26" alt="" style="display:block;margin:0 auto;border:0;"></td>
          <td height="13" style="font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td height="13" style="border-top:1px solid ${RW.gold};border-left:1px solid ${RW.gold};border-top-left-radius:12px;font-size:0;line-height:0;">&nbsp;</td>
          <td height="13" style="border-top:1px solid ${RW.gold};border-right:1px solid ${RW.gold};border-top-right-radius:12px;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr><td colspan="3" align="center" style="border:1px solid ${RW.gold};border-top:0;border-bottom-left-radius:12px;border-bottom-right-radius:12px;padding:2px 16px 18px;">
          <div class="rw-label" style="font-family:${RW.sans};font-size:13px;font-weight:bold;letter-spacing:0.22em;color:${RW.green};white-space:nowrap;">YOUR CEDAR REWARDS BALANCE</div>
          ${awarded ? `<div style="font-family:${RW.sans};font-size:13.5px;font-weight:bold;color:${RW.gold};margin-top:8px;">+${awarded} points added</div>` : ''}
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:4px auto 0;"><tr>
            <td width="60" valign="middle"><div style="height:1px;line-height:1px;font-size:0;background:${RW.gold};">&nbsp;</div></td>
            <td class="rw-num" style="padding:0 20px;font-family:${RW.serif};font-size:64px;font-weight:bold;line-height:1.05;color:${RW.green};white-space:nowrap;">${bal}</td>
            <td width="60" valign="middle"><div style="height:1px;line-height:1px;font-size:0;background:${RW.gold};">&nbsp;</div></td>
          </tr></table>
          <div style="font-family:${RW.sans};font-size:15px;font-weight:bold;letter-spacing:0.24em;color:${RW.green};margin-top:2px;">POINTS</div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" class="rw-pad" style="padding:14px 40px 0;font-family:${RW.serif};font-style:italic;font-size:16px;line-height:1.55;color:${RW.ink};">
      Your points can be used toward eligible Cedar Escape rewards, perks and future stays.
    </td></tr>
    <tr><td align="center" class="rw-pad" style="padding:22px 36px 0;">${rwButton(rewardsUrl, 'VIEW MY REWARDS')}</td></tr>
    <tr><td align="center" class="rw-pad" style="padding:18px 36px 0;">
      ${rwIconLine('icon-calendar.png', 'Book direct with Cedar Escape to save on platform fees and make the most of your Cedar Rewards membership.')}
    </td></tr>`,
  });
  await sendEmail(env, { to, subject: 'Welcome to Cedar Rewards: you’re officially in', html });
}

export async function sendSignInEmail(env, { to, signInUrl }) {
  const html = renderShell({
    title: 'Your Cedar Rewards sign-in link',
    heroEyebrow: 'Cedar Rewards',
    heroHeadline: 'Welcome back.',
    bodyHtml: `
      <p>Click below to sign in to your Cedar Rewards account. This link is single-use and expires in 15 minutes.</p>
      <div style="text-align:center;margin:28px 0;">${renderButton({ href: signInUrl, label: 'SIGN IN' })}</div>
      <p style="font-size:13px;color:#6b6555;">If you didn't request this, you can ignore this email — no one can access your account without clicking this exact link.</p>
    `,
  });
  await sendEmail(env, { to, subject: 'Your Cedar Rewards sign-in link', html });
}

export async function sendCodeIssuedGuestEmail(env, { to, rewardName, code, bookUrl }) {
  const html = renderShell({
    title: `Your ${rewardName} code is ready`,
    heroEyebrow: 'Cedar Rewards',
    heroHeadline: 'Your code is ready.',
    bodyHtml: `
      <p>Here's your code for <strong>${escapeHtml(rewardName)}</strong>:</p>
      ${renderPanel(renderPanelRow('Code', `<span style="font-size:18px;letter-spacing:0.06em;">${escapeHtml(code)}</span>`, 'price'))}
      <p>Enter this code at checkout when you book direct.</p>
      <div style="text-align:center;margin:28px 0;">${renderButton({ href: bookUrl, label: 'BOOK DIRECT →' })}</div>
    `,
  });
  await sendEmail(env, { to, subject: `Your ${rewardName} code is ready`, html });
}

export async function sendCodeIssuedOwnerEmail(env, { memberName, memberEmail, rewardName, pointsCost }) {
  const html = renderShell({
    title: 'Cedar Rewards: code issued',
    heroEyebrow: 'Cedar Rewards — Informational',
    heroHeadline: 'A guest redeemed a code.',
    bodyHtml: `
      <p>${escapeHtml(memberName || memberEmail)} redeemed <strong>${escapeHtml(rewardName)}</strong> — ${pointsCost.toLocaleString()} points. No action required.</p>
    `,
  });
  await sendEmail(env, { to: env.COURTESY_EMAIL, subject: 'Cedar Rewards: code issued', html });
}

export async function sendRequestSubmittedOwnerEmail(env, { memberName, memberEmail, rewardName, pointsCost, adminUrl, stayDates }) {
  const html = renderShell({
    title: `Cedar Rewards request: ${rewardName}`,
    heroEyebrow: 'Needs Your Review',
    heroHeadline: 'A reward request is waiting.',
    bodyHtml: `
      ${renderPanel(
        renderPanelRow('Guest', `${escapeHtml(memberName || '')}<br>${escapeHtml(memberEmail)}`, 'guests') +
          renderPanelRow('Reward', escapeHtml(rewardName), 'price') +
          renderPanelRow('Points held', String(pointsCost), 'price') +
          (stayDates ? renderPanelRow('Stay', escapeHtml(stayDates), 'calendar') : '')
      )}
      <div style="text-align:center;margin:28px 0;">${renderButton({ href: adminUrl, label: 'REVIEW IN ADMIN →' })}</div>
      <p style="font-size:13px;color:#6b6555;">Approval only happens in admin — there's no one-click approve in this email.</p>
    `,
  });
  await sendEmail(env, { to: env.COURTESY_EMAIL, subject: `Cedar Rewards request: ${rewardName}`, html });
}

export async function sendRequestDecidedGuestEmail(env, { to, rewardName, approved }) {
  const html = renderShell({
    title: approved ? `Your ${rewardName} request is approved` : `Update on your ${rewardName} request`,
    heroEyebrow: 'Cedar Rewards',
    heroHeadline: approved ? "You're all set." : "Here's an update.",
    bodyHtml: approved
      ? `<p>Your request for <strong>${escapeHtml(rewardName)}</strong> is approved. We'll take care of the rest for your stay.</p>`
      : `<p>We're not able to fulfill your request for <strong>${escapeHtml(rewardName)}</strong> this time, and your points have been returned to your balance.</p>`,
  });
  await sendEmail(env, { to, subject: approved ? `Your ${rewardName} request is approved` : `Update on your ${rewardName} request`, html });
}

export async function sendPendingReminderOwnerEmail(env, { count, adminUrl }) {
  const html = renderShell({
    title: 'Cedar Rewards: requests waiting',
    heroEyebrow: 'Reminder',
    heroHeadline: `${count} request${count === 1 ? '' : 's'} still pending.`,
    bodyHtml: `
      <p>${count} Cedar Rewards request${count === 1 ? ' has' : 's have'} been waiting for a decision.</p>
      <div style="text-align:center;margin:28px 0;">${renderButton({ href: adminUrl, label: 'REVIEW REQUESTS →' })}</div>
    `,
  });
  await sendEmail(env, { to: env.COURTESY_EMAIL, subject: 'Cedar Rewards: requests waiting', html });
}

export async function sendNewMemberOwnerEmail(env, { memberName, memberEmail }) {
  const html = renderShell({
    title: 'Cedar Rewards: new member',
    heroEyebrow: 'Cedar Rewards — Informational',
    heroHeadline: 'Someone just joined.',
    bodyHtml: `
      <p><strong>${escapeHtml(memberName || 'A new guest')}</strong> (${escapeHtml(memberEmail)}) confirmed their email and is now a Cedar Rewards member. No action required.</p>
    `,
  });
  await sendEmail(env, { to: env.COURTESY_EMAIL, subject: 'Cedar Rewards: new member', html });
}

export async function sendJobFailureOwnerEmail(env, { jobName, errorDetail }) {
  const html = renderShell({
    title: `Cedar Rewards: ${jobName} failed`,
    heroEyebrow: 'Needs Attention',
    heroHeadline: 'A scheduled job failed.',
    bodyHtml: `<p><strong>${escapeHtml(jobName)}</strong> did not complete successfully.</p><p style="font-size:13px;color:#6b6555;">${escapeHtml(errorDetail)}</p>`,
  });
  await sendEmail(env, { to: env.COURTESY_EMAIL, subject: `Cedar Rewards: ${jobName} failed`, html });
}

export async function sendMissingPointsOwnerEmail(env, { submittedEmail, reservationHint, message }) {
  const html = renderShell({
    title: 'Cedar Rewards: Missing Points? submission',
    heroEyebrow: 'Needs Your Review',
    heroHeadline: 'A guest is missing points.',
    bodyHtml: `
      ${renderPanel(
        renderPanelRow('Email', escapeHtml(submittedEmail), 'guests') +
          (reservationHint ? renderPanelRow('Reservation hint', escapeHtml(reservationHint), 'calendar') : '')
      )}
      ${message ? `<p><strong>Message:</strong> ${escapeHtml(message)}</p>` : ''}
    `,
  });
  await sendEmail(env, { to: env.COURTESY_EMAIL, subject: 'Cedar Rewards: Missing Points? submission', html });
}
