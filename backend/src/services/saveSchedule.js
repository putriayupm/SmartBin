// Saves a VALIDATED schedule into the schedules table, in one transaction.
// `households` must be the output of validateSchedule(...).schedule.households,
// already in route order. route_order is assigned 1..N from that order.
//
// Rule when rows already exist for this date + zone (PROPOSAL, to be agreed with Putri):
//   - force = false: do nothing and report { skipped: true }
//   - force = true : delete only 'pending' rows of that zone/date, then insert again;
//                    'collected' and 'skipped' rows are kept (ON CONFLICT DO NOTHING)
export async function saveSchedule(pool, { scheduleDate, zone, officerId, households, force = false }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate ?? '')) throw new Error('saveSchedule: scheduleDate must be YYYY-MM-DD');
  if (!zone) throw new Error('saveSchedule: zone is required');
  if (!Array.isArray(households)) throw new Error('saveSchedule: households must be an array');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Existing rows of this zone on this date (zone comes from the households table)
    const existing = await client.query(
      `SELECT s.schedule_id FROM schedules s
         JOIN households h ON h.household_id = s.household_id
        WHERE s.schedule_date = $1 AND h.zone = $2`,
      [scheduleDate, zone],
    );

    if (existing.rowCount > 0 && !force) {
      await client.query('ROLLBACK');
      return { saved: false, skipped: true, inserted: 0, deleted: 0, reason: 'Schedule already exists (use force to replace pending rows)' };
    }

    let deleted = 0;
    if (existing.rowCount > 0 && force) {
      const del = await client.query(
        `DELETE FROM schedules s USING households h
          WHERE h.household_id = s.household_id
            AND s.schedule_date = $1 AND h.zone = $2 AND s.status = 'pending'`,
        [scheduleDate, zone],
      );
      deleted = del.rowCount;
    }

    let inserted = 0;
    for (let i = 0; i < households.length; i++) {
      const h = households[i];
      const res = await client.query(
        `INSERT INTO schedules
           (schedule_date, household_id, officer_id, priority_score, route_order, reason, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         ON CONFLICT (schedule_date, household_id) DO NOTHING`,
        [scheduleDate, h.household_id, officerId, h.priority_score, i + 1, h.reason],
      );
      inserted += res.rowCount;
    }

    await client.query('COMMIT');
    return { saved: true, skipped: false, inserted, deleted };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err; // the daily job catches this and logs it
  } finally {
    client.release(); // always give the connection back to the pool
  }
}

// True if any schedule row already exists for this date + zone (zone comes from households).
export async function scheduleExists(pool, scheduleDate, zone) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM schedules s
       JOIN households h ON h.household_id = s.household_id
      WHERE s.schedule_date = $1 AND h.zone = $2
      LIMIT 1`,
    [scheduleDate, zone],
  );
  return rowCount > 0;
}