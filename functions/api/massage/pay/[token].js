import { peekToken } from '../../../_shared/tokens.js';
import { getRequest } from '../../../_shared/db.js';
import { createCheckoutSession, retrieveCheckoutSession } from '../../../_shared/stripe.js';

export async function onRequestGet({ request, env, params }) {
  const token = params.token;
  const db = env.MASSAGE_DB;
  const url = new URL(request.url);

  let tokenRow = await peekToken(db, token, 'deposit_pay');
  let purpose = 'deposit';
  if (!tokenRow) {
    tokenRow = await peekToken(db, token, 'balance_pay');
    purpose = 'balance';
  }
  if (!tokenRow) {
    return new Response('This payment link is invalid or has expired.', { status: 404 });
  }

  const req = await getRequest(db, tokenRow.request_id);
  if (!req) {
    return new Response('This request could not be found.', { status: 404 });
  }

  const expectedStatus = purpose === 'deposit' ? 'AVAILABLE_AWAITING_DEPOSIT' : 'BALANCE_DUE';
  const existingSessionId = purpose === 'deposit' ? req.deposit_checkout_session_id : req.balance_checkout_session_id;

  // Resume an existing open Checkout Session rather than double-creating one.
  if (existingSessionId) {
    try {
      const existing = await retrieveCheckoutSession(env, existingSessionId);
      if (existing.status === 'open') {
        return Response.redirect(existing.url, 302);
      }
    } catch {
      // fall through and create a new session
    }
  }

  if (tokenRow.used_at || req.status !== expectedStatus) {
    return new Response('This payment has already been processed or is no longer available.', { status: 400 });
  }

  const amountCents = purpose === 'deposit' ? req.deposit_cents : req.balance_cents;
  const baseUrl = url.origin;

  const session = await createCheckoutSession(env, {
    amountCents,
    description: purpose === 'deposit' ? 'Cedar Escape In-Home Massage — Deposit (50%)' : 'Cedar Escape In-Home Massage — Remaining Balance',
    successUrl: `${baseUrl}/add-ons.html?massage_payment=success`,
    cancelUrl: `${baseUrl}/add-ons.html?massage_payment=cancelled`,
    customerEmail: req.primary_email,
    metadata: { request_id: req.id, purpose, token },
  });

  const sessionField = purpose === 'deposit' ? 'deposit_checkout_session_id' : 'balance_checkout_session_id';
  await db
    .prepare(`UPDATE massage_requests SET ${sessionField} = ? WHERE id = ?`)
    .bind(session.id, req.id)
    .run();

  return Response.redirect(session.url, 302);
}
