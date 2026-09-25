import { getSessionMember } from '../../../_shared/rewards-session.js';
import { newId } from '../../../_shared/rewards-db.js';

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

  let postUrl;
  try {
    postUrl = new URL(body.postUrl).toString();
  } catch {
    return new Response(JSON.stringify({ error: 'Please paste a valid link to your post.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const id = newId();
  await db
    .prepare("INSERT INTO rewards_tagged_posts (id, member_id, post_url, status, created_at) VALUES (?, ?, ?, 'pending', ?)")
    .bind(id, member.id, postUrl, new Date().toISOString())
    .run();

  return new Response(JSON.stringify({ ok: true, id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
