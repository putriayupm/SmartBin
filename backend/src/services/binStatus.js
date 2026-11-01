import { predictDaysUntilFull } from './prediction.js';

// Reads all households in a zone and adds predicted_days_until_full
// `pool` is a pg Pool (injected, so we can swap in Putri's shared pool later).
export async function getBinStatus(zone, pool) {
  if (!zone || typeof zone !== 'string') {
    throw new Error('getBinStatus: zone must be a non-empty string');
  }

  // Parameterized query ($1) prevents SQL injection
  const sql = `
    SELECT household_id, name, address, zone,
           current_fill_level, daily_fill_rate, last_collected_at
    FROM households
    WHERE zone = $1
    ORDER BY household_id`;

  const {rows} = await pool.query(sql, [zone]);

  return rows.map((row) => ({
    ...row,
    // pg returns NUMERIC as string, so convert for clean JSON
    current_fill_level: row.current_fill_level == null ? null : Number(row.current_fill_level),
    daily_fill_rate: row.daily_fill_rate == null ? null : Number(row.daily_fill_rate),
    predicted_days_until_full: predictDaysUntilFull(row),
  }));
}