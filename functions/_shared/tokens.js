function base64url(bytes) {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export async function createToken(db, requestId, purpose) {
  const token = generateToken();
  await db
    .prepare('INSERT INTO massage_tokens (token, request_id, purpose, created_at) VALUES (?, ?, ?, ?)')
    .bind(token, requestId, purpose, new Date().toISOString())
    .run();
  return token;
}

// Returns the token row if it exists and is unused, else null.
export async function consumeToken(db, token, expectedPurpose) {
  const row = await db
    .prepare('SELECT * FROM massage_tokens WHERE token = ? AND purpose = ?')
    .bind(token, expectedPurpose)
    .first();
  if (!row) return null;
  if (row.used_at) return { ...row, alreadyUsed: true };
  await db
    .prepare('UPDATE massage_tokens SET used_at = ? WHERE token = ?')
    .bind(new Date().toISOString(), token)
    .run();
  return { ...row, alreadyUsed: false };
}

// Returns an existing unused token for this request+purpose if one exists,
// otherwise mints a new one. Used for the cancel link, which stays valid and
// gets repeated across several emails (deposit confirmation, balance
// reminder, etc.) rather than minting a fresh one every time.
export async function getOrCreateToken(db, requestId, purpose) {
  const row = await db
    .prepare('SELECT token FROM massage_tokens WHERE request_id = ? AND purpose = ? AND used_at IS NULL LIMIT 1')
    .bind(requestId, purpose)
    .first();
  if (row) return row.token;
  return createToken(db, requestId, purpose);
}

// Looks up a token without consuming it (used for pay links, which stay
// re-clickable until the Stripe webhook confirms payment).
export async function peekToken(db, token, expectedPurpose) {
  return db
    .prepare('SELECT * FROM massage_tokens WHERE token = ? AND purpose = ?')
    .bind(token, expectedPurpose)
    .first();
}

export async function markTokenUsed(db, token) {
  await db
    .prepare('UPDATE massage_tokens SET used_at = ? WHERE token = ?')
    .bind(new Date().toISOString(), token)
    .run();
}

// Invalidates every unused token of a given purpose for a request (e.g. once
// the partner clicks one of the two Available/Not Available links, the other
// stale copy of the email should no longer be actionable).
export async function invalidateTokens(db, requestId, purpose) {
  await db
    .prepare("UPDATE massage_tokens SET used_at = ? WHERE request_id = ? AND purpose = ? AND used_at IS NULL")
    .bind(new Date().toISOString(), requestId, purpose)
    .run();
}
