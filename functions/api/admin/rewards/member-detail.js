import { getMember, getAvailableBalance, getLedger, getMemberRedemptions, getMemberLifetimeStats, setMemberStatus, postAdjustment, logEvent } from '../../../_shared/rewards-db.js';

function adminActor(request) {
  return request.headers.get('Cf-Access-Authenticated-User-Email') || 'admin';
}

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const db = env.REWARDS_DB;
  const member = await getMember(db, id);
  if (!member) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const [balance, ledger, redemptions, lifetime] = await Promise.all([
    getAvailableBalance(db, id),
    getLedger(db, id),
    getMemberRedemptions(db, id),
    getMemberLifetimeStats(db, id),
  ]);

  return new Response(JSON.stringify({ member, balance, ledger, redemptions, lifetime }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestPost({ request, env }) {
  const db = env.REWARDS_DB;
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const member = await getMember(db, body.id);
  if (!member) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  if (body.action === 'adjust') {
    const points = Number(body.points);
    if (!points || !body.category || !body.note) {
      return new Response(JSON.stringify({ error: 'Points, category, and a note are all required.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    await postAdjustment(db, { memberId: member.id, points, category: body.category, note: body.note, createdBy: adminActor(request) });
    await logEvent(db, { memberId: member.id, eventType: 'admin_adjustment', detail: { points, category: body.category } });
  } else if (body.action === 'disable') {
    await setMemberStatus(db, member.id, 'disabled');
    await logEvent(db, { memberId: member.id, eventType: 'admin_disabled' });
  } else if (body.action === 'enable') {
    await setMemberStatus(db, member.id, 'active');
    await logEvent(db, { memberId: member.id, eventType: 'admin_enabled' });
  } else {
    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const balance = await getAvailableBalance(db, member.id);
  return new Response(JSON.stringify({ ok: true, balance }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
