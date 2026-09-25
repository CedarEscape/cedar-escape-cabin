import { getSessionMember } from '../../_shared/rewards-session.js';
import { getAvailableBalance, getLedger, getLatestTaggedPost } from '../../_shared/rewards-db.js';

export async function onRequestGet({ request, env }) {
  const db = env.REWARDS_DB;
  const member = await getSessionMember(request, db);
  if (!member) {
    return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const balance = await getAvailableBalance(db, member.id);
  const ledger = await getLedger(db, member.id);
  const latestTaggedPost = await getLatestTaggedPost(db, member.id);

  return new Response(
    JSON.stringify({
      member: {
        id: member.id,
        email: member.email,
        name: member.name,
        joinedAt: member.joined_at,
        igFollowPosted: !!member.ig_follow_posted,
        fbFollowPosted: !!member.fb_follow_posted,
      },
      balance,
      recentActivity: ledger.slice(0, 20),
      latestTaggedPost: latestTaggedPost ? { status: latestTaggedPost.status, postUrl: latestTaggedPost.post_url } : null,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
