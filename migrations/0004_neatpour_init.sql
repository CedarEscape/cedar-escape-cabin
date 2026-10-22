-- NEAT POUR CO. private cocktail experience requests.
-- Lives in the same D1 database as Friendly City Clay (cedar-escape-clay).
-- Cedar Escape only coordinates availability and hands the guest to the provider;
-- no payment, deposit or balance fields exist here on purpose.
-- `status` is free text (no CHECK) so later steps such as booked / did-not-book /
-- commission can be added without changing this table.

CREATE TABLE neatpour_requests (
  id                    TEXT PRIMARY KEY,          -- Cedar Escape request / referral ID, e.g. NP-7K3Q9D
  status                TEXT NOT NULL DEFAULT 'REQUESTED',
  guest_first_name      TEXT NOT NULL,
  guest_last_name       TEXT NOT NULL,
  guest_email           TEXT NOT NULL,
  guest_phone           TEXT NOT NULL,
  checkin_date          TEXT,
  experience_code       TEXT NOT NULL,
  group_size            INTEGER NOT NULL,
  class_preferences     TEXT,
  preferred_date        TEXT NOT NULL,
  preferred_time        TEXT NOT NULL,
  alternate_date        TEXT,
  alternate_time        TEXT,
  notes                 TEXT,
  provider_response     TEXT,                      -- 'available' | 'unavailable' | NULL
  provider_responded_at TEXT,
  sent_to_provider_at   TEXT,
  handoff_sent_at       TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE TABLE neatpour_tokens (
  token       TEXT PRIMARY KEY,
  request_id  TEXT NOT NULL REFERENCES neatpour_requests(id),
  purpose     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE neatpour_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id   TEXT NOT NULL REFERENCES neatpour_requests(id),
  event_type   TEXT NOT NULL,
  detail_json  TEXT,
  created_at   TEXT NOT NULL
);

CREATE INDEX idx_neatpour_requests_status ON neatpour_requests(status);
CREATE INDEX idx_neatpour_tokens_request ON neatpour_tokens(request_id);
CREATE INDEX idx_neatpour_events_request ON neatpour_events(request_id);
