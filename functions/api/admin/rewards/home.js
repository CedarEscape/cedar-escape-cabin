import { getAdminHomeStats } from '../../../_shared/rewards-db.js';

// Protected by Cloudflare Access at the edge — no auth check here, per spec
// ("no admin login system to build"). Access's injected identity header is
// read where an admin action needs an attributable actor, not here.
export async function onRequestGet({ env }) {
  const stats = await getAdminHomeStats(env.REWARDS_DB);
  return new Response(JSON.stringify(stats), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
