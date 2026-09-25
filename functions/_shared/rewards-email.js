import { sendEmail, renderShell, renderButton, renderPanel, renderPanelRow, formatCents } from './email.js';

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function sendVerifyEmail(env, { to, verifyUrl }) {
  const html = renderShell({
    title: 'Confirm your Cedar Rewards account',
    heroEyebrow: 'Cedar Rewards',
    heroHeadline: "You're almost in.",
    bodyHtml: `
      <p>Click below to confirm your email and activate your Cedar Rewards account. This link is single-use and expires in 15 minutes.</p>
      <div style="text-align:center;margin:28px 0;">${renderButton({ href: verifyUrl, label: 'CONFIRM MY ACCOUNT' })}</div>
      <p style="font-size:13px;color:#6b6555;">If you didn't request this, you can ignore this email.</p>
    `,
  });
  await sendEmail(env, { to, subject: 'Confirm your Cedar Rewards account', html });
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
