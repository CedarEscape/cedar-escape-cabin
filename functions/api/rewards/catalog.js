import { getRewards } from '../../_shared/rewards-catalog.js';

// Public — the Rewards Shop and the marketing landing page both need this
// before a guest necessarily has an account.
export async function onRequestGet({ env }) {
  const rewards = await getRewards(env.REWARDS_DB, { activeOnly: true });
  return new Response(JSON.stringify({ rewards }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
