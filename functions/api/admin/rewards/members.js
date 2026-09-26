import { searchMembers, getAvailableBalance } from '../../../_shared/rewards-db.js';

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams.get('q') || '';
  const db = env.REWARDS_DB;
  const members = await searchMembers(db, q);
  const withBalance = await Promise.all(
    members.map(async (m) => ({ ...m, balance: await getAvailableBalance(db, m.id) }))
  );

  return new Response(JSON.stringify({ members: withBalance }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
