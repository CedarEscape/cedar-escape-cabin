CREATE TABLE clay_requests (
  id                  TEXT PRIMARY KEY,
  status              TEXT NOT NULL DEFAULT 'REQUESTED',
  guest_first_name    TEXT NOT NULL,
  guest_last_name     TEXT NOT NULL,
  guest_email         TEXT NOT NULL,
  guest_phone         TEXT NOT NULL,
  checkin_date        TEXT,
  experience_code     TEXT NOT NULL,
  group_size          INTEGER NOT NULL,
  preferred_date      TEXT NOT NULL,
  preferred_time      TEXT NOT NULL,
  alternate_date      TEXT,
  alternate_time      TEXT,
  notes               TEXT,
  quoted_price_text   TEXT,
  booking_url         TEXT,
  provider_note       TEXT,
  sent_to_provider_at TEXT,
  guest_notified_at   TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE TABLE clay_tokens (
  token       TEXT PRIMARY KEY,
  request_id  TEXT NOT NULL REFERENCES clay_requests(id),
  purpose     TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE clay_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id   TEXT NOT NULL REFERENCES clay_requests(id),
  event_type   TEXT NOT NULL,
  detail_json  TEXT,
  created_at   TEXT NOT NULL
);

CREATE INDEX idx_clay_requests_status ON clay_requests(status);
CREATE INDEX idx_clay_tokens_request ON clay_tokens(request_id);
CREATE INDEX idx_clay_events_request ON clay_events(request_id);
