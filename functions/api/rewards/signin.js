import { findMemberByEmail, normalizeEmail } from '../../_shared/rewards-db.js';
import { createToken } from '../../_shared/rewards-tokens.js';
import { sendSignInEmail } from '../../_shared/rewards-email.js';
import { verifyTurnstile } from '../../_shared/rewards-turnstile.js';

const GENERIC_RESPONSE = JSON.stringify({ ok: true, message: 'If an account exists for that email, a sign-in link is on its way.' });

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { email, turnstileToken } = body;
  if (!email || !normalizeEmail(email).includes('@')) {
    return new Response(JSON.stringify({ error: 'A valid email is required' }), { status: 400 });
  }

  const ok = await verifyTurnstile(env, turnstileToken, request.headers.get('CF-Connecting-IP'));
  if (!ok) {
    return new Response(JSON.stringify({ error: 'Verification failed — please try again' }), { status: 400 });
  }

  const db = env.REWARDS_DB;
  const member = await findMemberByEmail(db, email);

  // Always return the same generic response whether or not an account
  // exists, to avoid leaking which emails are registered.
  if (!member || member.status !== 'active') {
    return new Response(GENERIC_RESPONSE, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // Light rate limit: skip minting a new link if one was sent in the last 60s.
  const recent = await db
    .prepare("SELECT created_at FROM rewards_tokens WHERE member_id = ? AND purpose = 'sign_in' ORDER BY created_at DESC LIMIT 1")
    .bind(member.id)
    .first();
  if (recent && Date.now() - new Date(recent.created_at).getTime() < 60000) {
    return new Response(GENERIC_RESPONSE, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const token = await createToken(db, member.id, 'sign_in');
  const baseUrl = new URL(request.url).origin;
  await sendSignInEmail(env, { to: member.email, signInUrl: `${baseUrl}/api/rewards/signin-consume/${token}` });

  return new Response(GENERIC_RESPONSE, { status: 200, headers: { 'Content-Type': 'application/json' } });
}
