import { getSessionMember } from '../../_shared/rewards-session.js';
import { getUpcomingDirectStaysForEmail } from '../../_shared/rewards-hospitable.js';

export async function onRequestGet({ request, env }) {
  const db = env.REWARDS_DB;
  const member = await getSessionMember(request, db);
  if (!member) {
    return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const stays = await getUpcomingDirectStaysForEmail(env, member.email);
    return new Response(JSON.stringify({ ok: true, stays }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('upcoming-stays lookup failed:', err.message);
    return new Response(JSON.stringify({ ok: true, stays: [], hospitableUnavailable: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}
