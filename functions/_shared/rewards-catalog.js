export async function getRewards(db, { activeOnly = true } = {}) {
  const query = activeOnly
    ? 'SELECT * FROM rewards_catalog WHERE active = 1 ORDER BY sort_order'
    : 'SELECT * FROM rewards_catalog ORDER BY sort_order';
  const { results } = await db.prepare(query).all();
  return results;
}

export async function getRewardByCode(db, code) {
  return db.prepare('SELECT * FROM rewards_catalog WHERE code = ?').bind(code).first();
}

export async function getReward(db, id) {
  return db.prepare('SELECT * FROM rewards_catalog WHERE id = ?').bind(id).first();
}
