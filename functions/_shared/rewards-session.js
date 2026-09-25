// 30-day, cookie-backed sessions for Cedar Rewards members.

const COOKIE_NAME = 'ce_rewards_session';
const SESSION_DAYS = 30;

function base64url(bytes) {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateSessionId() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export async function createSession(db, memberId) {
  const id = generateSessionId();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db
    .prepare('INSERT INTO rewards_sessions (id, member_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(id, memberId, now.toISOString(), expires.toISOString())
    .run();
  return { id, expiresAt: expires };
}

export function sessionCookieHeader(sessionId, expiresAt) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return `${COOKIE_NAME}=${sessionId}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  const match = header.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

// Returns the member row for a valid, unexpired session cookie, or null.
export async function getSessionMember(request, db) {
  const sessionId = readCookie(request, COOKIE_NAME);
  if (!sessionId) return null;

  const row = await db
    .prepare(
      `SELECT m.* FROM rewards_sessions s
       JOIN rewards_members m ON m.id = s.member_id
       WHERE s.id = ? AND s.expires_at > ? AND m.status = 'active'`
    )
    .bind(sessionId, new Date().toISOString())
    .first();
  return row || null;
}
