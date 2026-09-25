// Hospitable public API access for Cedar Rewards. Same call shape already
// proven in scripts/sync_dashboard.py: GET /v2/reservations with
// properties[]/start_date/end_date/date_query/status[]/platforms[]/include,
// paginated via meta.has_more_pages + meta.last_page.

import { normalizeEmail } from './rewards-db.js';

const API_BASE = 'https://public.api.hospitable.com/v2';

async function apiGet(env, path, params) {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(key, v));
    } else if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${env.HOSPITABLE_API_TOKEN}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Hospitable API error (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function getReservationById(env, id) {
  const data = await apiGet(env, `/reservations/${id}`, {});
  return data.data || data;
}

async function getAllPages(env, path, params) {
  let page = 1;
  const items = [];
  for (;;) {
    const data = await apiGet(env, path, { ...params, per_page: 100, page });
    items.push(...(data.data || []));
    const meta = data.meta || {};
    if (!meta.has_more_pages && page >= (meta.last_page || 1)) break;
    page += 1;
  }
  return items;
}

// Pre-discount accommodation amount minus the (already-negative) discount
// lines = the true qualifying spend for points. Taxes and host fees are
// separate fields and are correctly excluded by not referencing them.
export function computeQualifyingSpendCents(reservation) {
  const host = (reservation.financials && reservation.financials.host) || {};
  const accommodation = (host.accommodation && host.accommodation.amount) || 0;
  const discounts = (host.discounts || []).reduce((sum, d) => sum + (d.amount || 0), 0);
  return Math.max(0, accommodation + discounts);
}

// Best-effort only — the promo code only ever shows as free text inside a
// discount line's label (e.g. "Promotion (CE-PINE26)"). A typo or reordering
// in Hospitable just leaves this blank; nothing depends on it functionally.
export function extractPromoCodeFromLabel(reservation) {
  const host = (reservation.financials && reservation.financials.host) || {};
  for (const d of host.discounts || []) {
    const match = /Promotion \(([^)]+)\)/.exec(d.label || '');
    if (match) return match[1];
  }
  return null;
}

function nightsBetween(checkIn, checkOut) {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

// Reservations for the property, checking in from `startDate` onward,
// filtered to direct/accepted only.
export async function fetchUpcomingDirectReservations(env, { startDate, endDate }) {
  const propertyId = env.HOSPITABLE_PROPERTY_ID || '4f05e11c-f631-4f21-9a9f-282819425722';
  const reservations = await getAllPages(env, '/reservations', {
    'properties[]': propertyId,
    start_date: startDate,
    end_date: endDate,
    date_query: 'checkin',
    'status[]': 'accepted',
    'platforms[]': 'direct',
    include: 'guest',
  });
  return reservations.map((r) => ({
    id: r.id,
    checkIn: r.arrival_date,
    checkOut: r.departure_date,
    nights: r.nights ?? nightsBetween(r.arrival_date, r.departure_date),
    guestEmail: normalizeEmail(r.guest && r.guest.email),
  }));
}

// The eligible upcoming direct stay(s) for a member's email — what the
// "choose your stay" step and the request-reward gate both need.
export async function getUpcomingDirectStaysForEmail(env, email) {
  const normalized = normalizeEmail(email);
  const today = new Date().toISOString().slice(0, 10);
  const oneYearOut = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const reservations = await fetchUpcomingDirectReservations(env, { startDate: today, endDate: oneYearOut });
  return reservations.filter((r) => r.guestEmail === normalized);
}

// Reservations whose checkout falls inside the lookback window, up through
// today — the full candidate set for the nightly earn/reversal job. No
// status filter: cancelled reservations must come through too, since the
// job needs to see them to reverse a stay that already earned points. A
// reservation that hasn't checked out yet can't have earned anything (the
// posting-delay gate guarantees that), so there's nothing to reverse for it
// either — no need to also pull future checkouts here.
export async function fetchReservationsForSync(env, { lookbackDays }) {
  const propertyId = env.HOSPITABLE_PROPERTY_ID || '4f05e11c-f631-4f21-9a9f-282819425722';
  const today = new Date();
  const startDate = new Date(today.getTime() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);
  const reservations = await getAllPages(env, '/reservations', {
    'properties[]': propertyId,
    start_date: startDate,
    end_date: endDate,
    date_query: 'checkout',
    'platforms[]': 'direct',
    include: 'financials,guest',
  });
  return reservations;
}
