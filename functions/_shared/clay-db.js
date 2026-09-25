function uuid() {
  return crypto.randomUUID();
}

export async function insertClayRequest(db, fields) {
  const id = uuid();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO clay_requests
        (id, status, guest_first_name, guest_last_name, guest_email, guest_phone, checkin_date,
         experience_code, group_size, preferred_date, preferred_time, alternate_date, alternate_time,
         notes, created_at, updated_at)
       VALUES (?, 'REQUESTED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      fields.guestFirstName,
      fields.guestLastName,
      fields.guestEmail,
      fields.guestPhone,
      fields.checkinDate || null,
      fields.experienceCode,
      fields.groupSize,
      fields.preferredDate,
      fields.preferredTime,
      fields.alternateDate || null,
      fields.alternateTime || null,
      fields.notes || null,
      now,
      now
    )
    .run();
  return id;
}

export async function getClayRequest(db, requestId) {
  return db.prepare('SELECT * FROM clay_requests WHERE id = ?').bind(requestId).first();
}

export async function listClayRequests(db) {
  const { results } = await db.prepare('SELECT * FROM clay_requests ORDER BY created_at DESC').all();
  return results;
}

export async function updateClayStatus(db, requestId, status, extraFields = {}) {
  const fields = { status, updated_at: new Date().toISOString(), ...extraFields };
  const keys = Object.keys(fields);
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  await db
    .prepare(`UPDATE clay_requests SET ${setClause} WHERE id = ?`)
    .bind(...keys.map((k) => fields[k]), requestId)
    .run();
}

export async function logClayEvent(db, requestId, eventType, detail = null) {
  await db
    .prepare('INSERT INTO clay_events (request_id, event_type, detail_json, created_at) VALUES (?, ?, ?, ?)')
    .bind(requestId, eventType, detail ? JSON.stringify(detail) : null, new Date().toISOString())
    .run();
}
