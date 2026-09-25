import { getSettingInt, newId } from '../../../_shared/rewards-db.js';
import { sendPendingReminderOwnerEmail } from '../../../_shared/rewards-email.js';

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get('Authorization') || '';
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const db = env.REWARDS_DB;
  const startedAt = new Date().toISOString();
  const reminderHours = await getSettingInt(db, 'pending_request_reminder_hours', 24);
  const cutoff = new Date(Date.now() - reminderHours * 60 * 60 * 1000).toISOString();

  const { results } = await db
    .prepare("SELECT id FROM rewards_redemptions WHERE status = 'pending' AND requested_at <= ?")
    .bind(cutoff)
    .all();

  if (results.length) {
    const baseUrl = new URL(request.url).origin;
    await sendPendingReminderOwnerEmail(env, { count: results.length, adminUrl: `${baseUrl}/admin-rewards.html` });
  }

  await db
    .prepare(
      `INSERT INTO rewards_job_runs (id, job_name, status, reservations_scanned, earns_posted, reversals_posted, error_detail, started_at, finished_at)
       VALUES (?, 'pending_reminders', 'success', ?, 0, 0, NULL, ?, ?)`
    )
    .bind(newId(), results.length, startedAt, new Date().toISOString())
    .run();

  return new Response(JSON.stringify({ ok: true, pendingCount: results.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
