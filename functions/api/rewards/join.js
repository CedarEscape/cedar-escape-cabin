import { findOrCreateMember, findMemberByEmail, normalizeEmail } from '../../_shared/rewards-db.js';
import { createToken } from '../../_shared/rewards-tokens.js';
import { sendVerifyEmail, sendSignInEmail } from '../../_shared/rewards-email.js';
import { verifyTurnstile } from '../../_shared/rewards-turnstile.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { email, name, turnstileToken } = body;
  if (!email || !normalizeEmail(email).includes('@')) {
    return new Response(JSON.stringify({ error: 'A valid email is required' }), { status: 400 });
  }

  const ok = await verifyTurnstile(env, turnstileToken, request.headers.get('CF-Connecting-IP'));
  if (!ok) {
    return new Response(JSON.stringify({ error: 'Verification failed — please try again' }), { status: 400 });
  }

  const db = env.REWARDS_DB;
  const baseUrl = new URL(request.url).origin;
  const existing = await findMemberByEmail(db, email);

  if (existing && existing.verified_at) {
    // Already a verified member — treat this as a sign-in rather than erroring.
    const token = await createToken(db, existing.id, 'sign_in');
    await sendSignInEmail(env, { to: existing.email, signInUrl: `${baseUrl}/api/rewards/signin-consume/${token}` });
    return new Response(JSON.stringify({ ok: true, mode: 'signin' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const member = await findOrCreateMember(db, { email, name });
  const token = await createToken(db, member.id, 'verify_email');
  await sendVerifyEmail(env, { to: member.email, verifyUrl: `${baseUrl}/api/rewards/verify/${token}` });

  return new Response(JSON.stringify({ ok: true, mode: 'verify' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
