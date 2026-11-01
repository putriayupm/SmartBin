-- DEV ONLY: local test data so Azel can test the AI agent alone.
-- Columns follow the team's draft schema; Putri's real schema may differ.
-- Safe to re-run: it recreates the table.
DROP TABLE IF EXISTS households;

CREATE TABLE households (
  household_id       SERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  address            TEXT NOT NULL,
  zone               TEXT NOT NULL,
  latitude           NUMERIC(9,6),
  longitude          NUMERIC(9,6),
  bin_capacity       INTEGER DEFAULT 120,
  current_fill_level NUMERIC(5,2) CHECK (current_fill_level BETWEEN 0 AND 100),
  daily_fill_rate    NUMERIC(5,2),
  last_collected_at  TIMESTAMPTZ
);

-- Zone A: varied fill levels, including edge cases
INSERT INTO households (name, address, zone, latitude, longitude, current_fill_level, daily_fill_rate, last_collected_at) VALUES
('Keluarga Budi',   'Jl. Melati No. 1',  'A', -6.2000, 106.8000, 92,  15, now() - interval '4 days'),
('Keluarga Siti',   'Jl. Melati No. 3',  'A', -6.2005, 106.8004, 85,  10, now() - interval '5 days'),
('Keluarga Andi',   'Jl. Melati No. 5',  'A', -6.2010, 106.8008, 70,  12, now() - interval '3 days'),
('Keluarga Rina',   'Jl. Anggrek No. 2', 'A', -6.2015, 106.8012, 45,   8, now() - interval '2 days'),
('Keluarga Dewi',   'Jl. Anggrek No. 4', 'A', -6.2020, 106.8016, 20,   5, now() - interval '1 day'),
('Keluarga Joko',   'Jl. Anggrek No. 6', 'A', -6.2025, 106.8020, 100, 10, now() - interval '6 days'),
('Keluarga Tono',   'Jl. Kenanga No. 1', 'A', -6.2030, 106.8024, 50,   0, now() - interval '2 days'),
('Keluarga Lina',   'Jl. Kenanga No. 3', 'A', -6.2035, 106.8028, 60, NULL, NULL);

-- Zone B: smaller zone
INSERT INTO households (name, address, zone, latitude, longitude, current_fill_level, daily_fill_rate, last_collected_at) VALUES
('Keluarga Maya',   'Jl. Mawar No. 1',   'B', -6.2100, 106.8100, 88,  11, now() - interval '4 days'),
('Keluarga Hadi',   'Jl. Mawar No. 3',   'B', -6.2105, 106.8104, 30,   6, now() - interval '1 day'),
('Keluarga Nur',    'Jl. Mawar No. 5',   'B', -6.2110, 106.8108, 65,  14, now() - interval '3 days');