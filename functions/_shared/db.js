function uuid() {
  return crypto.randomUUID();
}

export async function insertRequest(db, fields) {
  const id = uuid();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO massage_requests
        (id, status, primary_name, primary_email, primary_phone, checkin_date,
         preferred_date, preferred_time, alternate_date, alternate_time, notes,
         subtotal_cents, deposit_cents, balance_cents, created_at, updated_at)
       VALUES (?, 'REQUESTED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      fields.primaryName,
      fields.primaryEmail,
      fields.primaryPhone,
      fields.checkinDate || null,
      fields.preferredDate,
      fields.preferredTime,
      fields.alternateDate || null,
      fields.alternateTime || null,
      fields.notes || null,
      fields.subtotalCents,
      fields.depositCents,
      fields.balanceCents,
      now,
      now
    )
    .run();
  return id;
}

export async function insertItems(db, requestId, pricedItems) {
  const stmt = db.prepare(
    `INSERT INTO massage_request_items
      (id, request_id, guest_label, service_code, service_price_cents, cbd_addon, cbd_price_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const batch = pricedItems.map((item) =>
    stmt.bind(
      uuid(),
      requestId,
      item.guestLabel,
      item.serviceCode,
      item.servicePriceCents,
      item.cbdAddon ? 1 : 0,
      item.cbdPriceCents
    )
  );
  await db.batch(batch);
}

export async function getRequest(db, requestId) {
  return db.prepare('SELECT * FROM massage_requests WHERE id = ?').bind(requestId).first();
}

export async function getItems(db, requestId) {
  const { results } = await db
    .prepare('SELECT * FROM massage_request_items WHERE request_id = ?')
    .bind(requestId)
    .all();
  return results;
}

export async function updateStatus(db, requestId, status, extraFields = {}) {
  const fields = { status, updated_at: new Date().toISOString(), ...extraFields };
  const keys = Object.keys(fields);
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  await db
    .prepare(`UPDATE massage_requests SET ${setClause} WHERE id = ?`)
    .bind(...keys.map((k) => fields[k]), requestId)
    .run();
}

export async function logEvent(db, requestId, eventType, detail = null) {
  await db
    .prepare('INSERT INTO massage_events (request_id, event_type, detail_json, created_at) VALUES (?, ?, ?, ?)')
    .bind(requestId, eventType, detail ? JSON.stringify(detail) : null, new Date().toISOString())
    .run();
}

export async function findBookingsDueForReminder(db) {
  // 47-49h out window (tolerant range; the cron itself runs hourly)
  const { results } = await db
    .prepare(
      `SELECT * FROM massage_requests
       WHERE status = 'CONFIRMED_DEPOSIT_PAID'
         AND balance_reminder_sent = 0
         AND confirmed_start IS NOT NULL
         AND datetime(confirmed_start) BETWEEN datetime('now', '+47 hours') AND datetime('now', '+49 hours')`
    )
    .all();
  return results;
}
