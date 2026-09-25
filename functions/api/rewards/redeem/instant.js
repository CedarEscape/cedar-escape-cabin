import { getSessionMember } from '../../../_shared/rewards-session.js';
import { getAvailableBalance, buildRedemptionInsertStatement, buildSpendStatement, newId, logEvent } from '../../../_shared/rewards-db.js';
import { getRewardByCode } from '../../../_shared/rewards-catalog.js';
import { sendCodeIssuedGuestEmail, sendCodeIssuedOwnerEmail } from '../../../_shared/rewards-email.js';

export async function onRequestPost({ request, env }) {
  const db = env.REWARDS_DB;
  const member = await getSessionMember(request, db);
  if (!member) {
    return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const reward = await getRewardByCode(db, body.rewardCode);
  if (!reward || !reward.active || reward.reward_type !== 'instant') {
    return new Response(JSON.stringify({ error: 'Reward not available' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  if (!reward.shared_code) {
    return new Response(JSON.stringify({ error: 'This reward has no code configured yet' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const balance = await getAvailableBalance(db, member.id);
  if (balance < reward.cost_points) {
    return new Response(JSON.stringify({ error: 'Not enough points', balance, needed: reward.cost_points }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const redemptionId = newId();
  const spend = buildSpendStatement(db, { memberId: member.id, points: reward.cost_points, redemptionId });

  // Atomic: the redemption record and the point deduction land in the same
  // D1 batch, so a double-click can't produce two spends off one balance
  // check.
  await db.batch([
    buildRedemptionInsertStatement(db, {
      id: redemptionId,
      memberId: member.id,
      rewardId: reward.id,
      pointsCost: reward.cost_points,
      status: 'code_issued',
      issuedCode: reward.shared_code,
    }),
    spend.statement,
  ]);

  await logEvent(db, { memberId: member.id, redemptionId, eventType: 'instant_redeemed', detail: { rewardCode: reward.code, points: reward.cost_points } });

  const baseUrl = new URL(request.url).origin;
  await sendCodeIssuedGuestEmail(env, {
    to: member.email,
    rewardName: reward.name,
    code: reward.shared_code,
    bookUrl: `${baseUrl}/check-availability.html`,
  });
  await sendCodeIssuedOwnerEmail(env, {
    memberName: member.name,
    memberEmail: member.email,
    rewardName: reward.name,
    pointsCost: reward.cost_points,
  });

  return new Response(
    JSON.stringify({ ok: true, redemptionId, code: reward.shared_code, newBalance: balance - reward.cost_points }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
