import { clearSessionCookieHeader, isSecureRequest } from '../../_shared/rewards-session.js';

export async function onRequestPost({ request }) {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookieHeader(isSecureRequest(request)) },
  });
}
