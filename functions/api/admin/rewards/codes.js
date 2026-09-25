import { getRewards } from '../../../_shared/rewards-catalog.js';

export async function onRequestGet({ env }) {
  const rewards = await getRewards(env.REWARDS_DB, { activeOnly: false });
  const instant = rewards.filter((r) => r.reward_type === 'instant');
  return new Response(JSON.stringify({ rewards: instant }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestPost({ request, env }) {
  const db = env.REWARDS_DB;
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }
  if (!body.rewardId || !body.sharedCode) {
    return new Response(JSON.stringify({ error: 'rewardId and sharedCode are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  await db.prepare('UPDATE rewards_catalog SET shared_code = ?, updated_at = ? WHERE id = ?').bind(body.sharedCode, new Date().toISOString(), body.rewardId).run();
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
