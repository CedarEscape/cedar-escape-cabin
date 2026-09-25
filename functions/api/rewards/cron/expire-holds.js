import { getReservationById } from '../../../_shared/rewards-hospitable.js';
import { getRedemptionsAwaitingResolution, getOpenHoldForRedemption, resolveHoldToRelease, updateRedemptionStatus, postAdjustment, newId, logEvent } from '../../../_shared/rewards-db.js';
import { sendRequestDecidedGuestEmail, sendJobFailureOwnerEmail } from '../../../_shared/rewards-email.js';

async function insertJobRun(db, run) {
  await db
    .prepare(
      `INSERT INTO rewards_job_runs (id, job_name, status, reservations_scanned, earns_posted, reversals_posted, error_detail, started_at, finished_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?)`
    )
    .bind(newId(), run.jobName, run.status, run.scanned, run.errorDetail, run.startedAt, run.finishedAt)
    .run();
}

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get('Authorization') || '';
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const db = env.REWARDS_DB;
  const startedAt = new Date().toISOString();
  const redemptions = await getRedemptionsAwaitingResolution(db);
  let scanned = 0;
  let declined = 0;
  let expired = 0;
  let returned = 0;
  const itemErrors = [];

  for (const redemption of redemptions) {
    scanned += 1;
    try {
      const reservation = await getReservationById(env, redemption.linked_reservation_id);
      const category = (reservation.reservation_status && reservation.reservation_status.current && reservation.reservation_status.current.category) || reservation.status;
      const checkIn = reservation.check_in || reservation.arrival_date;

      if (redemption.status === 'pending') {
        if (category === 'cancelled') {
          const hold = await getOpenHoldForRedemption(db, redemption.id);
          if (hold) await resolveHoldToRelease(db, { holdLedgerId: hold.id, memberId: redemption.member_id, points: redemption.points_cost, redemptionId: redemption.id });
          await updateRedemptionStatus(db, redemption.id, 'declined', { decided_at: new Date().toISOString() });
          await logEvent(db, { memberId: redemption.member_id, redemptionId: redemption.id, eventType: 'auto_declined_stay_cancelled' });
          declined += 1;
        } else if (checkIn && Date.now() >= new Date(checkIn).getTime()) {
          const hold = await getOpenHoldForRedemption(db, redemption.id);
          if (hold) await resolveHoldToRelease(db, { holdLedgerId: hold.id, memberId: redemption.member_id, points: redemption.points_cost, redemptionId: redemption.id });
          await updateRedemptionStatus(db, redemption.id, 'expired', { decided_at: new Date().toISOString() });
          await logEvent(db, { memberId: redemption.member_id, redemptionId: redemption.id, eventType: 'auto_expired' });
          expired += 1;
        }
      } else if (redemption.status === 'approved' && category === 'cancelled') {
        // Points were already spent when approved; return them via a
        // system adjustment rather than a hold release (the hold is long
        // since resolved).
        await postAdjustment(db, {
          memberId: redemption.member_id,
          points: redemption.points_cost,
          category: 'Correction',
          note: `Stay cancelled after approval (redemption ${redemption.id}) — points returned automatically.`,
          createdBy: 'system',
        });
        await updateRedemptionStatus(db, redemption.id, 'declined', { decided_at: new Date().toISOString(), admin_note: 'Auto-declined: linked stay was cancelled after approval.' });
        await logEvent(db, { memberId: redemption.member_id, redemptionId: redemption.id, eventType: 'auto_returned_after_cancel' });
        await sendRequestDecidedGuestEmail(env, { to: redemption.member_email, rewardName: 'your reward', approved: false });
        returned += 1;
      }
    } catch (err) {
      itemErrors.push(`${redemption.id}: ${err.message}`);
    }
  }

  const status = itemErrors.length ? 'partial' : 'success';
  const errorDetail = itemErrors.length ? itemErrors.join('; ') : null;
  await insertJobRun(db, { jobName: 'expire_holds', status, scanned, errorDetail, startedAt, finishedAt: new Date().toISOString() });
  if (itemErrors.length) {
    await sendJobFailureOwnerEmail(env, { jobName: 'Cedar Rewards expire-holds (partial)', errorDetail });
  }

  return new Response(JSON.stringify({ ok: true, scanned, declined, expired, returned, status }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
