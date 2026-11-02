DROP TABLE IF EXISTS notification_logs, collection_history, schedules, calendar_events, households, users CASCADE;

CREATE TABLE users (
  user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  username      VARCHAR(50) UNIQUE NOT NULL,
  email         VARCHAR(100) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone_number  VARCHAR(20),
  role          VARCHAR(10) NOT NULL CHECK (role IN ('officer','operator')),
  assigned_zone VARCHAR(20),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE households (
  household_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               VARCHAR(100) NOT NULL,
  address            VARCHAR(255) NOT NULL,
  zone               VARCHAR(20) NOT NULL,
  latitude           DOUBLE PRECISION NOT NULL,
  longitude          DOUBLE PRECISION NOT NULL,
  bin_capacity       INTEGER NOT NULL DEFAULT 120,
  current_fill_level NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (current_fill_level BETWEEN 0 AND 100),
  daily_fill_rate    NUMERIC(5,2) NOT NULL DEFAULT 15,
  last_collected_at  TIMESTAMP
);

CREATE TABLE schedules (
  schedule_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_date  DATE NOT NULL,
  household_id   UUID NOT NULL REFERENCES households(household_id),
  officer_id     UUID NOT NULL REFERENCES users(user_id),
  priority_score NUMERIC(5,2) NOT NULL,
  route_order    INTEGER NOT NULL,
  reason         TEXT,
  status         VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','collected','skipped')),
  UNIQUE (schedule_date, household_id)
);

CREATE TABLE collection_history (
  history_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(household_id),
  officer_id   UUID NOT NULL REFERENCES users(user_id),
  schedule_id  UUID REFERENCES schedules(schedule_id),
  collected_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_logs (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id      UUID NOT NULL REFERENCES users(user_id),
  schedule_date   DATE NOT NULL,
  channel         VARCHAR(20) NOT NULL,
  status          VARCHAR(10) NOT NULL,
  sent_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE calendar_events (
  event_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date DATE NOT NULL,
  event_name VARCHAR(100) NOT NULL,
  is_holiday BOOLEAN NOT NULL DEFAULT TRUE
);