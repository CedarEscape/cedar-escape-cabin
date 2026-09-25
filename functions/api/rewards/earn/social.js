import { getSessionMember } from '../../../_shared/rewards-session.js';
import { postEarn, getSettingInt } from '../../../_shared/rewards-db.js';

const PLATFORM_CONFIG = {
  instagram: { flagColumn: 'ig_follow_posted', pointsSetting: 'ig_follow_points', source: 'ig_follow' },
  facebook: { flagColumn: 'fb_follow_posted', pointsSetting: 'fb_follow_points', source: 'fb_follow' },
};

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

  const config = PLATFORM_CONFIG[body.platform];
  if (!config) {
    return new Response(JSON.stringify({ error: 'Unknown platform' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (member[config.flagColumn]) {
    return new Response(JSON.stringify({ error: 'Already claimed' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const points = await getSettingInt(db, config.pointsSetting, 200);
  await postEarn(db, { memberId: member.id, points, source: config.source });
  await db.prepare(`UPDATE rewards_members SET ${config.flagColumn} = 1, updated_at = ? WHERE id = ?`).bind(new Date().toISOString(), member.id).run();

  return new Response(JSON.stringify({ ok: true, pointsEarned: points }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
