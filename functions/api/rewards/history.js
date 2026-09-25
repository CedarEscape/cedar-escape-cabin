import { getSessionMember } from '../../_shared/rewards-session.js';
import { getLedger, getAvailableBalance, getMemberRedemptions } from '../../_shared/rewards-db.js';

export async function onRequestGet({ request, env }) {
  const db = env.REWARDS_DB;
  const member = await getSessionMember(request, db);
  if (!member) {
    return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const [ledger, redemptions, balance] = await Promise.all([
    getLedger(db, member.id),
    getMemberRedemptions(db, member.id),
    getAvailableBalance(db, member.id),
  ]);

  return new Response(JSON.stringify({ balance, ledger, redemptions }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
