// Reference IDs avoid look-alike characters (0/O, 1/I) so they are easy to read aloud.
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRequestId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let s = 'NP-';
  for (const b of bytes) s += ID_CHARS[b % ID_CHARS.length];
  return s;
}

function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function insertRequest(db, f) {
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = generateRequestId();
    try {
      await db
        .prepare(
          `INSERT INTO neatpour_requests
            (id, status, guest_first_name, guest_last_name, guest_email, guest_phone, checkin_date,
             experience_code, group_size, class_preferences, preferred_date, preferred_time,
             alternate_date, alternate_time, notes, created_at, updated_at)
           VALUES (?, 'REQUESTED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id, f.guestFirstName, f.guestLastName, f.guestEmail, f.guestPhone, f.checkinDate || null,
          f.experienceCode, f.groupSize, f.classPreferences || null, f.preferredDate, f.preferredTime,
          f.alternateDate || null, f.alternateTime || null, f.notes || null, now, now
        )
        .run();
      return id;
    } catch (err) {
      if (attempt === 4 || !/UNIQUE|constraint/i.test(String(err && err.message))) throw err;
    }
  }
}

export async function getRequest(db, id) {
  return db.prepare('SELECT * FROM neatpour_requests WHERE id = ?').bind(id).first();
}

export async function updateStatus(db, id, status, extra = {}) {
  const fields = { status, updated_at: new Date().toISOString(), ...extra };
  const keys = Object.keys(fields);
  await db
    .prepare(`UPDATE neatpour_requests SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .bind(...keys.map((k) => fields[k]), id)
    .run();
}

// First response wins: only succeeds while no response has been recorded, so a
// double click or a second email copy can never trigger the handoff twice.
export async function recordProviderResponse(db, id, response) {
  const now = new Date().toISOString();
  const status = response === 'available' ? 'PROVIDER_AVAILABLE' : 'PROVIDER_UNAVAILABLE';
  const res = await db
    .prepare('UPDATE neatpour_requests SET provider_response = ?, provider_responded_at = ?, status = ?, updated_at = ? WHERE id = ? AND provider_response IS NULL')
    .bind(response, now, status, now, id)
    .run();
  return !!(res && res.meta && res.meta.changes > 0);
}

export async function createRespondToken(db, requestId) {
  const token = generateToken();
  await db
    .prepare('INSERT INTO neatpour_tokens (token, request_id, purpose, created_at) VALUES (?, ?, ?, ?)')
    .bind(token, requestId, 'provider_respond', new Date().toISOString())
    .run();
  return token;
}

export async function findRespondToken(db, token) {
  return db.prepare("SELECT * FROM neatpour_tokens WHERE token = ? AND purpose = 'provider_respond'").bind(token).first();
}

export async function logEvent(db, requestId, eventType, detail = null) {
  await db
    .prepare('INSERT INTO neatpour_events (request_id, event_type, detail_json, created_at) VALUES (?, ?, ?, ?)')
    .bind(requestId, eventType, detail ? JSON.stringify(detail) : null, new Date().toISOString())
    .run();
}
