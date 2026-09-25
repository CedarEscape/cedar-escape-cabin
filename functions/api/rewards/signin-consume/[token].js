import { consumeToken } from '../../../_shared/rewards-tokens.js';
import { getMember } from '../../../_shared/rewards-db.js';
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
         <p style="margin-top:24px;"><a href="/rewards-signin.html" style="color:#C0973F;">Request a new sign-in link</a></p>
       </div>
     </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}

export async function onRequestGet({ params, env }) {
  const db = env.REWARDS_DB;
  const tokenRow = await consumeToken(db, params.token, 'sign_in');

  if (!tokenRow || tokenRow.alreadyUsed) {
    return landingPage('Link expired', 'This sign-in link is invalid or has already been used.');
  }

  const member = await getMember(db, tokenRow.member_id);
  if (!member || member.status !== 'active') {
    return landingPage('Account not found', 'We couldn’t sign you in with this link.');
  }

  const { id: sessionId, expiresAt } = await createSession(db, member.id);
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/rewards-dashboard.html',
      'Set-Cookie': sessionCookieHeader(sessionId, expiresAt),
    },
  });
}
