import { findMemberByEmail, normalizeEmail, newId } from '../../_shared/rewards-db.js';
import { sendMissingPointsOwnerEmail } from '../../_shared/rewards-email.js';

export async function onRequestPost({ request, env }) {
  const db = env.REWARDS_DB;
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!email || !email.includes('@')) {
    return new Response(JSON.stringify({ error: 'A valid email is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const member = await findMemberByEmail(db, email);
  const id = newId();
  await db
    .prepare(
      `INSERT INTO rewards_missing_points_requests (id, member_id, submitted_email, reservation_hint, message, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?)`
    )
    .bind(id, member ? member.id : null, email, body.reservationHint || null, body.message || null, new Date().toISOString())
    .run();

  await sendMissingPointsOwnerEmail(env, { submittedEmail: email, reservationHint: body.reservationHint, message: body.message });

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
