import { getRequestsQueue, getFulfillmentQueue, getPendingTaggedPosts, getRedemption, getOpenHoldForRedemption, resolveHoldToSpend, resolveHoldToRelease, updateRedemptionStatus, postEarn, getSettingInt, getMember, logEvent } from '../../../_shared/rewards-db.js';
import { sendRequestDecidedGuestEmail } from '../../../_shared/rewards-email.js';

export async function onRequestGet({ env }) {
  const db = env.REWARDS_DB;
  const [queue, fulfillment, taggedPosts] = await Promise.all([
    getRequestsQueue(db),
    getFulfillmentQueue(db),
    getPendingTaggedPosts(db),
  ]);
  return new Response(JSON.stringify({ queue, fulfillment, taggedPosts }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestPost({ request, env }) {
  const db = env.REWARDS_DB;
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (body.kind === 'tagged_post') {
    const row = await db.prepare('SELECT * FROM rewards_tagged_posts WHERE id = ?').bind(body.id).first();
    if (!row) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    if (body.action === 'approve') {
      const points = await getSettingInt(db, 'tagged_post_points', 300);
      const ledgerId = await postEarn(db, { memberId: row.member_id, points, source: 'tagged_post' });
      await db.prepare("UPDATE rewards_tagged_posts SET status = 'approved', ledger_id = ?, decided_at = ? WHERE id = ?").bind(ledgerId, new Date().toISOString(), row.id).run();
    } else if (body.action === 'decline') {
      await db.prepare("UPDATE rewards_tagged_posts SET status = 'declined', decided_at = ? WHERE id = ?").bind(new Date().toISOString(), row.id).run();
    } else {
      return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // kind === 'redemption' (default)
  const redemption = await getRedemption(db, body.id);
  if (!redemption) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  const member = await getMember(db, redemption.member_id);

  if (body.action === 'approve') {
    if (redemption.status !== 'pending') return new Response(JSON.stringify({ error: 'Not pending' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const hold = await getOpenHoldForRedemption(db, redemption.id);
    if (hold) await resolveHoldToSpend(db, { holdLedgerId: hold.id, memberId: redemption.member_id, points: redemption.points_cost, redemptionId: redemption.id });
    await updateRedemptionStatus(db, redemption.id, 'approved', { decided_at: new Date().toISOString() });
    await logEvent(db, { memberId: redemption.member_id, redemptionId: redemption.id, eventType: 'admin_approved' });
    await sendRequestDecidedGuestEmail(env, { to: member.email, rewardName: body.rewardName || 'your reward', approved: true });
  } else if (body.action === 'decline') {
    if (redemption.status !== 'pending') return new Response(JSON.stringify({ error: 'Not pending' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const hold = await getOpenHoldForRedemption(db, redemption.id);
    if (hold) await resolveHoldToRelease(db, { holdLedgerId: hold.id, memberId: redemption.member_id, points: redemption.points_cost, redemptionId: redemption.id });
    await updateRedemptionStatus(db, redemption.id, 'declined', { decided_at: new Date().toISOString(), admin_note: body.note || null });
    await logEvent(db, { memberId: redemption.member_id, redemptionId: redemption.id, eventType: 'admin_declined' });
    await sendRequestDecidedGuestEmail(env, { to: member.email, rewardName: body.rewardName || 'your reward', approved: false });
  } else if (body.action === 'deliver') {
    if (redemption.status !== 'approved') return new Response(JSON.stringify({ error: 'Not approved' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    await updateRedemptionStatus(db, redemption.id, 'delivered', { fulfilled_at: new Date().toISOString() });
    await logEvent(db, { memberId: redemption.member_id, redemptionId: redemption.id, eventType: 'admin_delivered' });
  } else {
    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
