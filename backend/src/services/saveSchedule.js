// Saves a VALIDATED schedule into Putri's schema, in ONE transaction:
// schedules rows (route_order 1..N per officer per date) + schedule_runs summary (upsert).
// Rule when rows already exist for this date + zone (agreed with Putri):
//   - force = false: do nothing, report { skipped: true }
//   - force = true : delete only rows with status 'pending' AND overridden_at IS NULL, then insert again.
//                    collected / skipped / overridden rows are kept (ON CONFLICT DO NOTHING).
// scheduleDate is a 'YYYY-MM-DD' string (use todayInJakarta() for "today").
export async function saveSchedule(pool, { scheduleDate, zone, officerId, households, summary = '', force = false }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate ?? '')) throw new Error('saveSchedule: scheduleDate must be YYYY-MM-DD');
  if (!zone) throw new Error('saveSchedule: zone is required');
  if (!officerId) throw new Error('saveSchedule: officerId is required (schedules.officer_id is NOT NULL)');
  if (!Array.isArray(households)) throw new Error('saveSchedule: households must be an array');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT s.schedule_id FROM schedules s
         JOIN households h ON h.household_id = s.household_id
        WHERE s.schedule_date = $1 AND h.zone = $2`,
      [scheduleDate, zone],
    );
    const run = await client.query(
      'SELECT 1 FROM schedule_runs WHERE schedule_date = $1 AND zone = $2', [scheduleDate, zone]);

    if ((existing.rowCount > 0 || run.rowCount > 0) && !force) {
      await client.query('ROLLBACK');
      return { saved: false, skipped: true, inserted: 0, deleted: 0, kept: 0,
        reason: 'Schedule already exists (use force to replace pending rows)' };
    }

    let deleted = 0;
    if (existing.rowCount > 0) {
      const del = await client.query(
        `DELETE FROM schedules s USING households h
          WHERE h.household_id = s.household_id
            AND s.schedule_date = $1 AND h.zone = $2
            AND s.status = 'pending' AND s.overridden_at IS NULL`,
        [scheduleDate, zone],
      );
      deleted = del.rowCount;
    }
    const kept = existing.rowCount - deleted;

    // New rows continue after the highest route_order that is left for this officer and date
    const { rows: [{ max_order }] } = await client.query(
      `SELECT COALESCE(MAX(route_order), 0) AS max_order FROM schedules
        WHERE schedule_date = $1 AND officer_id = $2`,
      [scheduleDate, officerId],
    );
    const offset = Number(max_order);

    let inserted = 0;
    for (let i = 0; i < households.length; i++) {
      const h = households[i];
      const res = await client.query(
        `INSERT INTO schedules
           (schedule_date, household_id, officer_id, priority_score, route_order, reason, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         ON CONFLICT (schedule_date, household_id) DO NOTHING`,
        [scheduleDate, h.household_id, officerId, h.priority_score, offset + i + 1, h.reason],
      );
      inserted += res.rowCount;
    }

    // Summary of the agent (also marks "this zone was processed", even for an empty schedule)
    await client.query(
      `INSERT INTO schedule_runs (schedule_date, zone, summary)
       VALUES ($1, $2, $3)
       ON CONFLICT (schedule_date, zone)
       DO UPDATE SET summary = EXCLUDED.summary, created_at = NOW()`,
      [scheduleDate, zone, summary],
    );

    await client.query('COMMIT');
    return { saved: true, skipped: false, inserted, deleted, kept };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err; // the daily job catches and logs this
  } finally {
    client.release();
  }
}

// True if this date + zone was already processed: schedule rows exist OR a summary was stored.
export async function scheduleExists(pool, scheduleDate, zone) {
  const { rows: [r] } = await pool.query(
    `SELECT (
       EXISTS (SELECT 1 FROM schedules s JOIN households h ON h.household_id = s.household_id
                WHERE s.schedule_date = $1 AND h.zone = $2)
       OR EXISTS (SELECT 1 FROM schedule_runs WHERE schedule_date = $1 AND zone = $2)
     ) AS found`,
    [scheduleDate, zone],
  );
  return r.found;
}