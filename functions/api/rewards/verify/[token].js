import { consumeToken } from '../../../_shared/rewards-tokens.js';
import { getMember, postEarn, getSettingInt } from '../../../_shared/rewards-db.js';
import { createSession, sessionCookieHeader } from '../../../_shared/rewards-session.js';

function landingPage(heading, message) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cedar Rewards</title>
     <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,500&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet"></head>
     <body style="margin:0;font-family:'DM Sans',sans-serif;background:#F6F1E6;color:#2B271F;">
       <div style="background:linear-gradient(155deg,#37452F 0%,#232D1D 100%);padding:48px 24px;text-align:center;">
         <div style="font-family:'Playfair Display',serif;font-style:italic;color:#F6F1E6;font-size:15px;letter-spacing:0.08em;">CEDAR ESCAPE</div>
       </div>
       <div style="max-width:480px;margin:0 auto;padding:56px 24px;text-align:center;">
         <h1 style="font-family:'Playfair Display',serif;font-style:italic;font-weight:500;font-size:28px;color:#232D1D;margin:0 0 16px;">${heading}</h1>
         <p style="font-size:15.5px;color:#4b453b;line-height:1.6;">${message}</p>
         <p style="margin-top:24px;"><a href="/rewards.html" style="color:#C0973F;">Back to Cedar Rewards</a></p>
       </div>
     </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}

async function signInAndRedirect(db, memberId, redirectPath) {
  const { id: sessionId, expiresAt } = await createSession(db, memberId);
  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectPath,
      'Set-Cookie': sessionCookieHeader(sessionId, expiresAt),
    },
  });
}

export async function onRequestGet({ params, env }) {
  const db = env.REWARDS_DB;
  const tokenRow = await consumeToken(db, params.token, 'verify_email');

  if (!tokenRow) {
    return landingPage('Link expired', 'This link is invalid or has expired. Please request a new one.');
  }

  const member = await getMember(db, tokenRow.member_id);
  if (!member) {
    return landingPage('Account not found', 'We couldn’t find this account. Please try joining again.');
  }

  if (tokenRow.alreadyUsed) {
    // Likely an email-scanner prefetch or a double click. If the account is
    // already verified, sign them in gracefully rather than showing an error.
    if (member.verified_at) {
      return signInAndRedirect(db, member.id, '/rewards-dashboard.html');
    }
    return landingPage('Link expired', 'This link is invalid or has expired. Please request a new one.');
  }

  if (!member.verified_at) {
    const now = new Date().toISOString();
    await db.prepare('UPDATE rewards_members SET verified_at = ?, updated_at = ? WHERE id = ?').bind(now, now, member.id).run();

    if (!member.join_bonus_posted) {
      const joinBonus = await getSettingInt(db, 'join_bonus_points', 100);
      await postEarn(db, { memberId: member.id, points: joinBonus, source: 'join' });
      await db.prepare('UPDATE rewards_members SET join_bonus_posted = 1 WHERE id = ?').bind(member.id).run();
    }
  }

  return signInAndRedirect(db, member.id, '/rewards-welcome.html');
}
