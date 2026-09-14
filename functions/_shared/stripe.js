// Stripe REST wrapper via plain fetch() — no stripe-node SDK, keeps the
// Functions bundle small since we only need ~3 endpoints.

function toFormBody(obj, prefix = '') {
  const parts = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (value === undefined || value === null) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      parts.push(toFormBody(value, fullKey));
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object') {
          parts.push(toFormBody(item, `${fullKey}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${fullKey}[${i}]`)}=${encodeURIComponent(item)}`);
        }
      });
    } else {
      parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(value)}`);
    }
  }
  return parts.join('&');
}

async function stripeRequest(env, method, path, body) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? toFormBody(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe ${path} failed: ${json.error?.message || res.status}`);
  }
  return json;
}

export async function createCheckoutSession(env, { amountCents, description, successUrl, cancelUrl, customerEmail, metadata }) {
  return stripeRequest(env, 'POST', 'checkout/sessions', {
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: customerEmail,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: { name: description },
        },
        quantity: 1,
      },
    ],
    metadata,
  });
}

export async function retrieveCheckoutSession(env, sessionId) {
  return stripeRequest(env, 'GET', `checkout/sessions/${sessionId}`);
}

export async function createRefund(env, { paymentIntentId, amountCents }) {
  return stripeRequest(env, 'POST', 'refunds', {
    payment_intent: paymentIntentId,
    amount: amountCents,
  });
}

// Verifies the Stripe-Signature header using HMAC-SHA256 over `${timestamp}.${payload}`,
// per Stripe's documented webhook signing scheme (no SDK needed for this either).
export async function verifyWebhookSignature(payload, signatureHeader, secret) {
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => p.split('='))
  );
  const timestamp = parts.t;
  const expectedSig = parts.v1;
  if (!timestamp || !expectedSig) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const computedSig = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return computedSig === expectedSig;
}
