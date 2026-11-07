-- DEV ONLY: stand-in for Putri's users and schedules tables (columns follow the team draft).
-- Run AFTER seed_households.sql. Safe to re-run: it recreates both tables.
DROP TABLE IF EXISTS schedules;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  user_id       SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  username      TEXT UNIQUE NOT NULL,
  email         TEXT,
  password_hash TEXT NOT NULL,
  phone_number  TEXT,
  role          TEXT NOT NULL CHECK (role IN ('officer', 'operator')),
  assigned_zone TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE schedules (
  schedule_id    SERIAL PRIMARY KEY,
  schedule_date  DATE NOT NULL,
  household_id   INTEGER NOT NULL,  -- no FK in dev: real type/table still to be confirmed
  officer_id     INTEGER REFERENCES users(user_id),
  priority_score NUMERIC(5,2),
  route_order    INTEGER,
  reason         TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'collected', 'skipped')),
  UNIQUE (schedule_date, household_id)
);

-- Fake users only. password_hash is a placeholder, NOT a real hash.
INSERT INTO users (name, username, password_hash, phone_number, role, assigned_zone) VALUES
('Officer A (dev)', 'dev.officer.a', 'placeholder', '+620000000001', 'officer', 'A'),
('Officer B (dev)', 'dev.officer.b', 'placeholder', '+620000000002', 'officer', 'B'),
('Operator (dev)',  'dev.operator',  'placeholder', '+620000000003', 'operator', NULL);