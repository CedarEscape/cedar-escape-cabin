function uuid() {
  return crypto.randomUUID();
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export async function findMemberByEmail(db, email) {
  return db.prepare('SELECT * FROM rewards_members WHERE email = ?').bind(normalizeEmail(email)).first();
}

export async function getMember(db, memberId) {
  return db.prepare('SELECT * FROM rewards_members WHERE id = ?').bind(memberId).first();
}

export async function findOrCreateMember(db, { email, name }) {
  const normalized = normalizeEmail(email);
  const existing = await findMemberByEmail(db, normalized);
  if (existing) return existing;

  const id = uuid();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO rewards_members (id, email, name, status, joined_at, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?)`
    )
    .bind(id, normalized, name || null, now, now, now)
    .run();
  return getMember(db, id);
}

// ---- Settings (every tunable value; nothing hard-coded) ----

export async function getSetting(db, key) {
  const row = await db.prepare('SELECT value FROM rewards_settings WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}

export async function getSettingInt(db, key, fallback = 0) {
  const value = await getSetting(db, key);
  return value === null ? fallback : parseInt(value, 10);
}

export async function setSetting(db, key, value) {
  await db
    .prepare(
      `INSERT INTO rewards_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .bind(key, String(value), new Date().toISOString())
    .run();
}

// ---- Balance ----
// Computed on read, from the ledger. hold_status is the one lifecycle field
// that changes after insert (open -> spent|released) — every other ledger
// row is write-once. See migrations/0002_rewards_init.sql for the schema
// comment explaining why this exception exists.

export async function getAvailableBalance(db, memberId) {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(
         CASE entry_type
           WHEN 'earn'       THEN points
           WHEN 'release'    THEN points
           WHEN 'adjustment' THEN points
           WHEN 'spend'      THEN -points
           WHEN 'reversal'   THEN -points
           WHEN 'hold'       THEN CASE WHEN hold_status = 'open' THEN -points ELSE 0 END
           ELSE 0
         END
       ), 0) AS balance
       FROM rewards_ledger WHERE member_id = ?`
    )
    .bind(memberId)
    .first();
  return row.balance;
}

export async function getLedger(db, memberId) {
  const { results } = await db
    .prepare('SELECT * FROM rewards_ledger WHERE member_id = ? ORDER BY created_at DESC')
    .bind(memberId)
    .all();
  return results;
}

// ---- Ledger writers. Every write to rewards_ledger goes through one of
// these — no route should build ad hoc INSERT/UPDATE SQL against the ledger
// directly. ----

export async function postEarn(db, { memberId, points, source, reservationId = null }) {
  const id = uuid();
  await db
    .prepare(
      `INSERT INTO rewards_ledger (id, member_id, entry_type, points, source, reservation_id, created_by, created_at)
       VALUES (?, ?, 'earn', ?, ?, ?, 'system', ?)`
    )
    .bind(id, memberId, points, source, reservationId, new Date().toISOString())
    .run();
  return id;
}

// Returns null if a hold for this member/points/redemption can't be placed
// because the batch's caller should have already verified balance — this
// function only performs the insert, atomicity is the caller's
// responsibility via db.batch() alongside the balance check statement.
export function buildHoldStatement(db, { memberId, points, redemptionId }) {
  const id = uuid();
  return {
    id,
    statement: db
      .prepare(
        `INSERT INTO rewards_ledger (id, member_id, entry_type, points, source, redemption_id, hold_status, created_by, created_at)
         VALUES (?, ?, 'hold', ?, 'redemption', ?, 'open', 'system', ?)`
      )
      .bind(id, memberId, points, redemptionId, new Date().toISOString()),
  };
}

export function buildSpendStatement(db, { memberId, points, redemptionId }) {
  const id = uuid();
  return {
    id,
    statement: db
      .prepare(
        `INSERT INTO rewards_ledger (id, member_id, entry_type, points, source, redemption_id, created_by, created_at)
         VALUES (?, ?, 'spend', ?, 'redemption', ?, 'system', ?)`
      )
      .bind(id, memberId, points, redemptionId, new Date().toISOString()),
  };
}

export async function resolveHoldToSpend(db, { holdLedgerId, memberId, points, redemptionId }) {
  const spend = buildSpendStatement(db, { memberId, points, redemptionId });
  await db.batch([
    db.prepare("UPDATE rewards_ledger SET hold_status = 'spent' WHERE id = ? AND hold_status = 'open'").bind(holdLedgerId),
    spend.statement,
  ]);
  return spend.id;
}

export async function resolveHoldToRelease(db, { holdLedgerId, memberId, points, redemptionId }) {
  const id = uuid();
  await db.batch([
    db.prepare("UPDATE rewards_ledger SET hold_status = 'released' WHERE id = ? AND hold_status = 'open'").bind(holdLedgerId),
    db
      .prepare(
        `INSERT INTO rewards_ledger (id, member_id, entry_type, points, source, redemption_id, related_ledger_id, created_by, created_at)
         VALUES (?, ?, 'release', ?, 'redemption', ?, ?, 'system', ?)`
      )
      .bind(id, memberId, points, redemptionId, holdLedgerId, new Date().toISOString()),
  ]);
  return id;
}

export async function postReversal(db, { memberId, points, reservationId, relatedLedgerId }) {
  const id = uuid();
  await db
    .prepare(
      `INSERT INTO rewards_ledger (id, member_id, entry_type, points, source, reservation_id, related_ledger_id, created_by, created_at)
       VALUES (?, ?, 'reversal', ?, 'direct_stay', ?, ?, 'system', ?)`
    )
    .bind(id, memberId, points, reservationId, relatedLedgerId, new Date().toISOString())
    .run();
  return id;
}

// points: positive for a bonus, negative for a deduction. category/note are
// required by the admin UI, not enforced here.
export async function postAdjustment(db, { memberId, points, category, note, createdBy }) {
  const id = uuid();
  await db
    .prepare(
      `INSERT INTO rewards_ledger (id, member_id, entry_type, points, source, adjustment_category, note, created_by, created_at)
       VALUES (?, ?, 'adjustment', ?, 'manual_adjustment', ?, ?, ?, ?)`
    )
    .bind(id, memberId, points, category, note, createdBy, new Date().toISOString())
    .run();
  return id;
}

export async function getOpenHoldForRedemption(db, redemptionId) {
  return db
    .prepare("SELECT * FROM rewards_ledger WHERE redemption_id = ? AND entry_type = 'hold' AND hold_status = 'open'")
    .bind(redemptionId)
    .first();
}

export async function getRedemptionsAwaitingResolution(db) {
  const { results } = await db
    .prepare(
      `SELECT r.*, m.email AS member_email, m.name AS member_name
       FROM rewards_redemptions r JOIN rewards_members m ON m.id = r.member_id
       WHERE r.status IN ('pending', 'approved') AND r.linked_reservation_id IS NOT NULL`
    )
    .all();
  return results;
}

export async function hasReservationEarn(db, reservationId) {
  const row = await db
    .prepare("SELECT id FROM rewards_ledger WHERE reservation_id = ? AND entry_type = 'earn'")
    .bind(reservationId)
    .first();
  return !!row;
}

export async function hasReservationReversal(db, reservationId) {
  const row = await db
    .prepare("SELECT id FROM rewards_ledger WHERE reservation_id = ? AND entry_type = 'reversal'")
    .bind(reservationId)
    .first();
  return !!row;
}

export async function getEarnForReservation(db, reservationId) {
  return db
    .prepare("SELECT * FROM rewards_ledger WHERE reservation_id = ? AND entry_type = 'earn'")
    .bind(reservationId)
    .first();
}

// ---- Redemptions ----

export function buildRedemptionInsertStatement(db, { id, memberId, rewardId, pointsCost, status, linkedReservationId = null, issuedCode = null, expiresAt = null }) {
  const now = new Date().toISOString();
  return db
    .prepare(
      `INSERT INTO rewards_redemptions
        (id, member_id, reward_id, points_cost, status, linked_reservation_id, issued_code, requested_at, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, memberId, rewardId, pointsCost, status, linkedReservationId, issuedCode, now, expiresAt, now, now);
}

export async function getRedemption(db, id) {
  return db.prepare('SELECT * FROM rewards_redemptions WHERE id = ?').bind(id).first();
}

export async function getMemberRedemptions(db, memberId) {
  const { results } = await db
    .prepare('SELECT * FROM rewards_redemptions WHERE member_id = ? ORDER BY requested_at DESC')
    .bind(memberId)
    .all();
  return results;
}

export async function updateRedemptionStatus(db, id, status, extraFields = {}) {
  const fields = { status, updated_at: new Date().toISOString(), ...extraFields };
  const keys = Object.keys(fields);
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  await db
    .prepare(`UPDATE rewards_redemptions SET ${setClause} WHERE id = ?`)
    .bind(...keys.map((k) => fields[k]), id)
    .run();
}

export function newId() {
  return uuid();
}

export async function logEvent(db, { memberId = null, redemptionId = null, eventType, detail = null }) {
  await db
    .prepare(
      'INSERT INTO rewards_events (member_id, redemption_id, event_type, detail_json, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(memberId, redemptionId, eventType, detail ? JSON.stringify(detail) : null, new Date().toISOString())
    .run();
}
