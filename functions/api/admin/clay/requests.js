import { listClayRequests, getClayRequest, updateClayStatus, logClayEvent } from '../../../_shared/clay-db.js';

export async function onRequestGet({ env }) {
  const requests = await listClayRequests(env.CLAY_DB);
  return new Response(JSON.stringify({ requests }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestPost({ request, env }) {
  const db = env.CLAY_DB;
  const body = await request.json();
  const req = await getClayRequest(db, body.id);
  if (!req) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  if (body.action === 'mark_complete') {
    await updateClayStatus(db, req.id, 'COMPLETE');
    await logClayEvent(db, req.id, 'admin_marked_complete');
  } else if (body.action === 'mark_referred') {
    await updateClayStatus(db, req.id, 'REFERRED_TO_FRIENDLY_CITY_CLAY');
    await logClayEvent(db, req.id, 'admin_marked_referred');
  } else {
    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
