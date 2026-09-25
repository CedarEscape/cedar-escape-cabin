// Single-use capability tokens for Cedar Rewards passwordless sign-in.
// Identical shape to functions/_shared/tokens.js, pointed at rewards_tokens/member_id.

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

export async function createToken(db, memberId, purpose) {
  const token = generateToken();
  await db
    .prepare('INSERT INTO rewards_tokens (token, member_id, purpose, created_at) VALUES (?, ?, ?, ?)')
    .bind(token, memberId, purpose, new Date().toISOString())
    .run();
  return token;
}

// Returns the token row if it exists, else null. `alreadyUsed` tells the
// caller whether this is a replay so it can show "already used" instead of
// "invalid link".
export async function consumeToken(db, token, expectedPurpose) {
  const row = await db
    .prepare('SELECT * FROM rewards_tokens WHERE token = ? AND purpose = ?')
    .bind(token, expectedPurpose)
    .first();
  if (!row) return null;
  if (row.used_at) return { ...row, alreadyUsed: true };
  await db.prepare('UPDATE rewards_tokens SET used_at = ? WHERE token = ?').bind(new Date().toISOString(), token).run();
  return { ...row, alreadyUsed: false };
}
