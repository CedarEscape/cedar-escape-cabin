-- Cedar Rewards schema. Ledger is the sole source of truth for points; no
-- balance is ever stored — see functions/_shared/rewards-db.js for the
-- computed-on-read balance query and the one documented exception
-- (hold_status) to "ledger rows are never rewritten."

CREATE TABLE rewards_members (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL,                   -- normalized: lower(trim(...))
  name              TEXT,
  status            TEXT NOT NULL DEFAULT 'active',  -- active | disabled
  joined_at         TEXT NOT NULL,
  verified_at       TEXT,
  join_bonus_posted INTEGER NOT NULL DEFAULT 0,
  ig_follow_posted  INTEGER NOT NULL DEFAULT 0,
  fb_follow_posted  INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_rewards_members_email ON rewards_members(email);

CREATE TABLE rewards_catalog (
  id                     TEXT PRIMARY KEY,
  code                   TEXT NOT NULL,
  name                   TEXT NOT NULL,
  description            TEXT,
  category               TEXT NOT NULL,   -- cedar_credit | stay_perk
  reward_type            TEXT NOT NULL,   -- instant | request
  cost_points            INTEGER NOT NULL,
  active                 INTEGER NOT NULL DEFAULT 1,
  requires_upcoming_stay INTEGER NOT NULL DEFAULT 0,
  min_nights             INTEGER,
  code_mode              TEXT NOT NULL DEFAULT 'shared', -- 'shared' | 'pool' (Phase 1: always 'shared')
  shared_code            TEXT,
  sort_order             INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_rewards_catalog_code ON rewards_catalog(code);

CREATE TABLE rewards_redemptions (
  id                     TEXT PRIMARY KEY,
  member_id              TEXT NOT NULL REFERENCES rewards_members(id),
  reward_id              TEXT NOT NULL REFERENCES rewards_catalog(id),
  points_cost            INTEGER NOT NULL,
  status                 TEXT NOT NULL,   -- pending | approved | declined | expired | code_issued | delivered | completed
  linked_reservation_id  TEXT,
  issued_code            TEXT,
  code_pool_id           TEXT REFERENCES rewards_code_pool(id),
  admin_note             TEXT,
  requested_at           TEXT NOT NULL,
  decided_at             TEXT,
  expires_at             TEXT,
  fulfilled_at           TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);
CREATE INDEX idx_rewards_redemptions_member ON rewards_redemptions(member_id);
CREATE INDEX idx_rewards_redemptions_status ON rewards_redemptions(status);

-- Ledger: source of truth. Rows are inserted, never rewritten, with one
-- deliberate exception: hold_status transitions open -> spent|released in
-- the same batch that inserts the resolving spend/release row.
CREATE TABLE rewards_ledger (
  id                  TEXT PRIMARY KEY,
  member_id           TEXT NOT NULL REFERENCES rewards_members(id),
  entry_type          TEXT NOT NULL,   -- earn | hold | spend | release | reversal | adjustment
  points              INTEGER NOT NULL, -- positive, except 'adjustment' which is signed (+bonus / -deduction)
  source              TEXT NOT NULL,   -- join | ig_follow | fb_follow | tagged_post | direct_stay | redemption | manual_adjustment
  reservation_id      TEXT,            -- Hospitable reservation id; set only for source='direct_stay'
  redemption_id       TEXT REFERENCES rewards_redemptions(id),
  related_ledger_id   TEXT REFERENCES rewards_ledger(id),
  adjustment_category TEXT,            -- Courtesy Bonus | Missing Stay Credit | Promotion | Correction | Other
  note                TEXT,            -- required for entry_type='adjustment'
  created_by          TEXT,            -- 'system' or the admin's Cloudflare Access email
  hold_status         TEXT,            -- 'open' | 'spent' | 'released' — set only on entry_type='hold' rows
  created_at          TEXT NOT NULL
);
-- Idempotency: at most one earn row per Hospitable reservation, ever.
CREATE UNIQUE INDEX idx_rewards_ledger_reservation_earn
  ON rewards_ledger(reservation_id) WHERE entry_type = 'earn' AND reservation_id IS NOT NULL;
CREATE INDEX idx_rewards_ledger_member ON rewards_ledger(member_id);
CREATE INDEX idx_rewards_ledger_redemption ON rewards_ledger(redemption_id);
CREATE INDEX idx_rewards_ledger_reservation ON rewards_ledger(reservation_id);

-- Schema-ready, unused in Phase 1: lets any reward move to a unique-code pool later with no migration.
CREATE TABLE rewards_code_pool (
  id            TEXT PRIMARY KEY,
  reward_id     TEXT NOT NULL REFERENCES rewards_catalog(id),
  code          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'available', -- available | assigned | void
  redemption_id TEXT REFERENCES rewards_redemptions(id),
  assigned_at   TEXT,
  created_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_rewards_code_pool_code ON rewards_code_pool(reward_id, code);
CREATE INDEX idx_rewards_code_pool_status ON rewards_code_pool(reward_id, status);

CREATE TABLE rewards_tagged_posts (
  id         TEXT PRIMARY KEY,
  member_id  TEXT NOT NULL REFERENCES rewards_members(id),
  post_url   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending', -- pending | approved | declined
  ledger_id  TEXT REFERENCES rewards_ledger(id),
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX idx_rewards_tagged_posts_member ON rewards_tagged_posts(member_id);
CREATE INDEX idx_rewards_tagged_posts_status ON rewards_tagged_posts(status);

CREATE TABLE rewards_missing_points_requests (
  id               TEXT PRIMARY KEY,
  member_id        TEXT REFERENCES rewards_members(id),
  submitted_email  TEXT NOT NULL,
  reservation_hint TEXT,
  message          TEXT,
  status           TEXT NOT NULL DEFAULT 'open', -- open | resolved
  created_at       TEXT NOT NULL,
  resolved_at      TEXT
);
CREATE INDEX idx_rewards_missing_points_status ON rewards_missing_points_requests(status);

-- Mirrors massage_tokens exactly.
CREATE TABLE rewards_tokens (
  token      TEXT PRIMARY KEY,
  member_id  TEXT NOT NULL REFERENCES rewards_members(id),
  purpose    TEXT NOT NULL,  -- verify_email | sign_in
  used_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_rewards_tokens_member ON rewards_tokens(member_id);

CREATE TABLE rewards_sessions (
  id         TEXT PRIMARY KEY,  -- the session/cookie value itself
  member_id  TEXT NOT NULL REFERENCES rewards_members(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL      -- 30 days out
);
CREATE INDEX idx_rewards_sessions_member ON rewards_sessions(member_id);

-- Every tunable value. Nothing here is hard-coded in application logic.
CREATE TABLE rewards_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE rewards_job_runs (
  id                    TEXT PRIMARY KEY,
  job_name              TEXT NOT NULL,  -- 'hospitable_nightly_sync' | 'expire_holds' | 'pending_reminders'
  status                TEXT NOT NULL,  -- success | failed | partial
  reservations_scanned  INTEGER NOT NULL DEFAULT 0,
  earns_posted          INTEGER NOT NULL DEFAULT 0,
  reversals_posted      INTEGER NOT NULL DEFAULT 0,
  error_detail          TEXT,
  started_at            TEXT NOT NULL,
  finished_at           TEXT
);
CREATE INDEX idx_rewards_job_runs_job ON rewards_job_runs(job_name, started_at);

-- Mirrors massage_events.
CREATE TABLE rewards_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id     TEXT REFERENCES rewards_members(id),
  redemption_id TEXT REFERENCES rewards_redemptions(id),
  event_type    TEXT NOT NULL,
  detail_json   TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_rewards_events_member ON rewards_events(member_id);
CREATE INDEX idx_rewards_events_redemption ON rewards_events(redemption_id);

-- ============ Seed data ============

INSERT INTO rewards_settings (key, value, updated_at) VALUES
  ('join_bonus_points', '100', datetime('now')),
  ('ig_follow_points', '200', datetime('now')),
  ('fb_follow_points', '200', datetime('now')),
  ('tagged_post_points', '300', datetime('now')),
  ('earn_rate_points_per_dollar', '1', datetime('now')),
  ('posting_delay_hours', '48', datetime('now')),
  ('lookback_days', '60', datetime('now')),
  ('pending_request_reminder_hours', '24', datetime('now')),
  ('tier_badges_enabled', '0', datetime('now')),
  ('hospitable_property_id', '4f05e11c-f631-4f21-9a9f-282819425722', datetime('now'));

INSERT INTO rewards_catalog
  (id, code, name, description, category, reward_type, cost_points, active, requires_upcoming_stay, min_nights, code_mode, shared_code, sort_order, created_at, updated_at)
VALUES
  ('4ec9ec91-2376-401d-a0e7-51564e05d5a2', 'early_checkin', '2-Hour Early Check-In', 'Check in two hours before the standard time.', 'stay_perk', 'request', 1500, 1, 1, NULL, 'shared', NULL, 10, datetime('now'), datetime('now')),
  ('eb3383e4-89fc-476d-a5c5-71ae0e990063', 'late_checkout', '2-Hour Late Checkout', 'Check out two hours after the standard time.', 'stay_perk', 'request', 1500, 1, 1, NULL, 'shared', NULL, 20, datetime('now'), datetime('now')),
  ('e489fe39-fa72-4085-870e-8979376bdd3a', 'movie_basket', 'Movie Night Basket', 'A basket of movie-night treats waiting at the cabin.', 'stay_perk', 'request', 2000, 1, 1, NULL, 'shared', NULL, 30, datetime('now'), datetime('now')),
  ('5383233c-af97-4de2-ac05-2b8f3b21e9e4', 'credit_25', '$25 Cedar Credit', 'A $25 discount code for your next direct stay.', 'cedar_credit', 'instant', 2500, 1, 0, NULL, 'shared', 'CE-PINE26', 40, datetime('now'), datetime('now')),
  ('e22d3899-5318-47ef-b44c-de2097f5cb2a', 'credit_50', '$50 Cedar Credit', 'A $50 discount code for your next direct stay.', 'cedar_credit', 'instant', 3000, 1, 0, NULL, 'shared', 'CE-RIDGE26', 50, datetime('now'), datetime('now')),
  ('6e3750a9-8279-46a9-9fe6-9e59dd1999d1', 'credit_100', '$100 Cedar Credit', 'A $100 discount code for your next direct stay.', 'cedar_credit', 'instant', 3500, 1, 0, NULL, 'shared', 'CE-SUMMIT26', 60, datetime('now'), datetime('now')),
  ('dfdb0dbf-8831-4330-aea4-8a1329f59f17', 'free_night', '1 Free Night (up to $500)', 'A free night on an upcoming 3+ night direct stay. Availability and blackout dates apply.', 'stay_perk', 'request', 5500, 1, 1, 3, 'shared', NULL, 70, datetime('now'), datetime('now'));
