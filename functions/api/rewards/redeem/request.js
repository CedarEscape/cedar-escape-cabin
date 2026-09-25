import { getSessionMember } from '../../../_shared/rewards-session.js';
import { getAvailableBalance, buildRedemptionInsertStatement, buildHoldStatement, newId, logEvent } from '../../../_shared/rewards-db.js';
import { getRewardByCode } from '../../../_shared/rewards-catalog.js';
import { getUpcomingDirectStaysForEmail } from '../../../_shared/rewards-hospitable.js';
import { sendRequestSubmittedOwnerEmail } from '../../../_shared/rewards-email.js';

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
  if (!reward || !reward.active || reward.reward_type !== 'request') {
    return new Response(JSON.stringify({ error: 'Reward not available' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  const balance = await getAvailableBalance(db, member.id);
  if (balance < reward.cost_points) {
    return new Response(JSON.stringify({ error: 'Not enough points', balance, needed: reward.cost_points }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  let matchedStay = null;
  if (reward.requires_upcoming_stay) {
    if (!body.reservationId) {
      return new Response(JSON.stringify({ error: 'Choose an upcoming direct stay for this reward.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    // Re-verify server-side against Hospitable rather than trusting the
    // client-supplied reservationId.
    let stays;
    try {
      stays = await getUpcomingDirectStaysForEmail(env, member.email);
    } catch (err) {
      console.error('request-reward stay lookup failed:', err.message);
      return new Response(JSON.stringify({ error: 'Could not verify your upcoming stay right now — please try again shortly.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    matchedStay = stays.find((s) => s.id === body.reservationId);
    if (!matchedStay) {
      return new Response(
        JSON.stringify({ error: "You'll need an upcoming direct stay to use this reward.", needsBooking: true }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (reward.min_nights && matchedStay.nights < reward.min_nights) {
      return new Response(
        JSON.stringify({ error: `This reward needs a stay of at least ${reward.min_nights} nights.` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  const redemptionId = newId();
  const hold = buildHoldStatement(db, { memberId: member.id, points: reward.cost_points, redemptionId });

  await db.batch([
    buildRedemptionInsertStatement(db, {
      id: redemptionId,
      memberId: member.id,
      rewardId: reward.id,
      pointsCost: reward.cost_points,
      status: 'pending',
      linkedReservationId: matchedStay ? matchedStay.id : null,
      expiresAt: matchedStay ? matchedStay.checkIn : null,
    }),
    hold.statement,
  ]);

  await logEvent(db, { memberId: member.id, redemptionId, eventType: 'request_submitted', detail: { rewardCode: reward.code, points: reward.cost_points } });

  const baseUrl = new URL(request.url).origin;
  await sendRequestSubmittedOwnerEmail(env, {
    memberName: member.name,
    memberEmail: member.email,
    rewardName: reward.name,
    pointsCost: reward.cost_points,
    adminUrl: `${baseUrl}/admin-rewards.html?redemption=${redemptionId}`,
    stayDates: matchedStay ? `${matchedStay.checkIn} → ${matchedStay.checkOut}` : null,
  });

  return new Response(
    JSON.stringify({ ok: true, redemptionId, status: 'pending', newBalance: balance - reward.cost_points }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
