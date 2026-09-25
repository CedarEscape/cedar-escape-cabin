import { getRewards } from '../../../_shared/rewards-catalog.js';
import { setSetting } from '../../../_shared/rewards-db.js';

export async function onRequestGet({ env }) {
  const db = env.REWARDS_DB;
  const { results: settings } = await db.prepare('SELECT * FROM rewards_settings ORDER BY key').all();
  const rewards = await getRewards(db, { activeOnly: false });
  return new Response(JSON.stringify({ settings, rewards }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestPost({ request, env }) {
  const db = env.REWARDS_DB;
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (body.kind === 'setting') {
    if (!body.key) return new Response(JSON.stringify({ error: 'Missing key' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    await setSetting(db, body.key, body.value);
  } else if (body.kind === 'reward') {
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const fields = {};
    if (body.name !== undefined) fields.name = body.name;
    if (body.description !== undefined) fields.description = body.description;
    if (body.cost_points !== undefined) fields.cost_points = Number(body.cost_points);
    if (body.active !== undefined) fields.active = body.active ? 1 : 0;
    fields.updated_at = new Date().toISOString();
    const keys = Object.keys(fields);
    if (!keys.length) return new Response(JSON.stringify({ error: 'Nothing to update' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    await db.prepare(`UPDATE rewards_catalog SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...keys.map((k) => fields[k]), body.id).run();
  } else {
    return new Response(JSON.stringify({ error: 'Unknown kind' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
