import { csvResponse } from '../../../_shared/rewards-csv.js';

const QUERIES = {
  members: 'SELECT id, email, name, status, joined_at, verified_at, created_at FROM rewards_members ORDER BY joined_at',
  ledger: 'SELECT id, member_id, entry_type, points, source, reservation_id, redemption_id, adjustment_category, note, created_by, created_at FROM rewards_ledger ORDER BY created_at',
  redemptions: 'SELECT id, member_id, reward_id, points_cost, status, linked_reservation_id, issued_code, requested_at, decided_at, fulfilled_at FROM rewards_redemptions ORDER BY requested_at',
  codes: 'SELECT code, name, shared_code, updated_at FROM rewards_catalog WHERE reward_type = "instant" ORDER BY sort_order',
};

export async function onRequestGet({ request, env }) {
  const table = new URL(request.url).searchParams.get('table');
  const query = QUERIES[table];
  if (!query) {
    return new Response(JSON.stringify({ error: 'Unknown table. Use one of: ' + Object.keys(QUERIES).join(', ') }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const { results } = await env.REWARDS_DB.prepare(query).all();
  return csvResponse(`cedar-rewards-${table}.csv`, results);
}
