// NEAT POUR CO. private cocktail experiences. The labels below are the exact
// package names supplied by the provider; do not reword them.
export const NEATPOUR_EXPERIENCES = {
  signature_sip: { label: 'The Signature Sip', isClass: true },
  private_pour: { label: 'The Private Pour', isClass: false },
  zero_proof_social: { label: 'The Zero-Proof Social', isClass: true },
};

export const MAX_GUESTS = 14;
export const PROVIDER_LABEL = 'NEAT POUR CO.';
const OWNER_FALLBACK_EMAIL = 'cedarescape.cabin@gmail.com';

export const ownerEmail = (env) => env.COURTESY_EMAIL || OWNER_FALLBACK_EMAIL;
// Not stored anywhere yet: set NEATPOUR_PROVIDER_EMAIL as a Cloudflare Pages variable.
export const providerEmail = (env) => (env.NEATPOUR_PROVIDER_EMAIL || '').trim() || null;
export const providerFirstName = (env) => (env.NEATPOUR_PROVIDER_NAME || 'Amber').trim();

// Internal statuses only; never shown to guests.
export const STATUS = {
  REQUESTED: 'REQUESTED',
  SENT_TO_PROVIDER: 'SENT_TO_PROVIDER',
  PROVIDER_EMAIL_NOT_CONFIGURED: 'PROVIDER_EMAIL_NOT_CONFIGURED',
  PROVIDER_AVAILABLE: 'PROVIDER_AVAILABLE',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  HANDED_OFF: 'HANDED_OFF',
};

// Owner-facing wording for the internal statuses above.
export const STATUS_LABEL = {
  REQUESTED: 'Request received',
  SENT_TO_PROVIDER: 'Waiting for NEAT POUR CO. to respond',
  PROVIDER_EMAIL_NOT_CONFIGURED: 'NEAT POUR CO. email not set up: forward this request manually',
  PROVIDER_AVAILABLE: 'NEAT POUR CO. is available',
  PROVIDER_UNAVAILABLE: 'NEAT POUR CO. is not available: action needed',
  HANDED_OFF: 'Handed off to NEAT POUR CO.',
};
