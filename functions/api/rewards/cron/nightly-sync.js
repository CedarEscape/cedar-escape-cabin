import { fetchReservationsForSync, computeQualifyingSpendCents } from '../../../_shared/rewards-hospitable.js';
import { findMemberByEmail, normalizeEmail, postEarn, postReversal, hasReservationEarn, hasReservationReversal, getEarnForReservation, getSettingInt, newId } from '../../../_shared/rewards-db.js';
import { sendJobFailureOwnerEmail } from '../../../_shared/rewards-email.js';

async function insertJobRun(db, run) {
  await db
    .prepare(
      `INSERT INTO rewards_job_runs (id, job_name, status, reservations_scanned, earns_posted, reversals_posted, error_detail, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(newId(), run.jobName, run.status, run.scanned, run.earnsPosted, run.reversalsPosted, run.errorDetail, run.startedAt, run.finishedAt)
    .run();
}

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get('Authorization') || '';
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const db = env.REWARDS_DB;
  const startedAt = new Date().toISOString();
  let scanned = 0;
  let earnsPosted = 0;
  let reversalsPosted = 0;
  const itemErrors = [];

  let reservations;
  try {
    const lookbackDays = await getSettingInt(db, 'lookback_days', 60);
    reservations = await fetchReservationsForSync(env, { lookbackDays });
  } catch (err) {
    const detail = `Hospitable fetch failed: ${err.message}`;
    await insertJobRun(db, { jobName: 'hospitable_nightly_sync', status: 'failed', scanned: 0, earnsPosted: 0, reversalsPosted: 0, errorDetail: detail, startedAt, finishedAt: new Date().toISOString() });
    await sendJobFailureOwnerEmail(env, { jobName: 'Cedar Rewards nightly sync', errorDetail: detail });
    return new Response(JSON.stringify({ ok: false, error: detail }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const postingDelayHours = await getSettingInt(db, 'posting_delay_hours', 48);
  const earnRate = await getSettingInt(db, 'earn_rate_points_per_dollar', 1);
  const now = Date.now();

  for (const r of reservations) {
    scanned += 1;
    try {
      const category = (r.reservation_status && r.reservation_status.current && r.reservation_status.current.category) || r.status;

      if (category === 'cancelled') {
        if (await hasReservationEarn(db, r.id) && !(await hasReservationReversal(db, r.id))) {
          const earnRow = await getEarnForReservation(db, r.id);
          await postReversal(db, { memberId: earnRow.member_id, points: earnRow.points, reservationId: r.id, relatedLedgerId: earnRow.id });
          reversalsPosted += 1;
        }
        continue;
      }

      if (category !== 'accepted') continue;
      if (await hasReservationEarn(db, r.id)) continue;

      const checkoutMs = new Date(r.check_out || r.departure_date).getTime();
      if (now < checkoutMs + postingDelayHours * 60 * 60 * 1000) continue;

      const guestEmail = normalizeEmail(r.guest && r.guest.email);
      if (!guestEmail) continue;
      const member = await findMemberByEmail(db, guestEmail);
      if (!member) continue;

      const qualifyingCents = computeQualifyingSpendCents(r);
      const points = Math.floor((qualifyingCents / 100) * earnRate);
      if (points <= 0) continue;

      await postEarn(db, { memberId: member.id, points, source: 'direct_stay', reservationId: r.id });
      earnsPosted += 1;
    } catch (err) {
      itemErrors.push(`${r.id}: ${err.message}`);
    }
  }

  const status = itemErrors.length ? 'partial' : 'success';
  const errorDetail = itemErrors.length ? itemErrors.join('; ') : null;
  await insertJobRun(db, { jobName: 'hospitable_nightly_sync', status, scanned, earnsPosted, reversalsPosted, errorDetail, startedAt, finishedAt: new Date().toISOString() });

  if (itemErrors.length) {
    await sendJobFailureOwnerEmail(env, { jobName: 'Cedar Rewards nightly sync (partial)', errorDetail });
  }

  return new Response(
    JSON.stringify({ ok: true, scanned, earnsPosted, reversalsPosted, status }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
