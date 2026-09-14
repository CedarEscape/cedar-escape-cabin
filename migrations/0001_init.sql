CREATE TABLE massage_requests (
  id                    TEXT PRIMARY KEY,
  status                TEXT NOT NULL DEFAULT 'REQUESTED',
  primary_name          TEXT NOT NULL,
  primary_email         TEXT NOT NULL,
  primary_phone         TEXT NOT NULL,
  checkin_date          TEXT,
  preferred_date        TEXT NOT NULL,
  preferred_time        TEXT NOT NULL,
  alternate_date        TEXT,
  alternate_time        TEXT,
  notes                 TEXT,
  subtotal_cents        INTEGER NOT NULL,
  deposit_cents         INTEGER NOT NULL,
  balance_cents         INTEGER NOT NULL,
  deposit_paid_cents    INTEGER NOT NULL DEFAULT 0,
  balance_paid_cents    INTEGER NOT NULL DEFAULT 0,
  deposit_checkout_session_id TEXT,
  balance_checkout_session_id TEXT,
  ics_sent              INTEGER NOT NULL DEFAULT 0,
  balance_reminder_sent INTEGER NOT NULL DEFAULT 0,
  confirmed_start       TEXT,
  confirmed_minutes     INTEGER,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE TABLE massage_request_items (
  id                   TEXT PRIMARY KEY,
  request_id           TEXT NOT NULL REFERENCES massage_requests(id),
  guest_label          TEXT NOT NULL,
  service_code         TEXT NOT NULL,
  service_price_cents  INTEGER NOT NULL,
  cbd_addon            INTEGER NOT NULL DEFAULT 0,
  cbd_price_cents      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE massage_tokens (
  token       TEXT PRIMARY KEY,
  request_id  TEXT NOT NULL REFERENCES massage_requests(id),
  purpose     TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE massage_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id   TEXT NOT NULL REFERENCES massage_requests(id),
  event_type   TEXT NOT NULL,
  detail_json  TEXT,
  created_at   TEXT NOT NULL
);

CREATE INDEX idx_requests_status ON massage_requests(status);
CREATE INDEX idx_items_request ON massage_request_items(request_id);
CREATE INDEX idx_tokens_request ON massage_tokens(request_id);
CREATE INDEX idx_events_request ON massage_events(request_id);
