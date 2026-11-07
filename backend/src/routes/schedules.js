import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Today's schedule. Officers see only their own stops; operators see everything.
router.get('/today', authenticate, async (req, res) => {
  const params = [];
  let where = "s.schedule_date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date";
  if (req.user.role === 'officer') {
    params.push(req.user.user_id);
    where += ' AND s.officer_id = $1';
  }
  const { rows } = await pool.query(
    `SELECT s.schedule_id, s.route_order, s.priority_score::float AS priority_score,
            s.reason, s.status,
            h.household_id, h.name, h.address, h.zone, h.latitude, h.longitude,
            h.current_fill_level::float AS current_fill_level
     FROM schedules s
     JOIN households h ON h.household_id = s.household_id
     WHERE ${where}
     ORDER BY h.zone, s.route_order`,
    params
  );
  res.json(rows);
});

// An officer marks one stop as collected (one transaction, so all steps succeed or none).
router.patch('/:id/collected', authenticate, requireRole('officer'), async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(400).json({ message: 'Invalid schedule id' });

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows } = await db.query(
      `UPDATE schedules SET status = 'collected'
       WHERE schedule_id = $1 AND officer_id = $2 AND status <> 'collected'
       RETURNING household_id`,
      [id, req.user.user_id]
    );
    if (!rows[0]) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Schedule not found or already collected' });
    }
    const householdId = rows[0].household_id;

    await db.query(
      'INSERT INTO collection_history (household_id, officer_id, schedule_id) VALUES ($1, $2, $3)',
      [householdId, req.user.user_id, id]
    );

    // Feedback loop: new daily fill rate = fill level / days since last collection,
    // kept between 1 and 50 percent per day (assumption to avoid extreme predictions).
    await db.query(
      `UPDATE households SET
         daily_fill_rate = CASE WHEN last_collected_at IS NOT NULL THEN
           LEAST(GREATEST(ROUND(
             current_fill_level / GREATEST(EXTRACT(EPOCH FROM (NOW() - last_collected_at)) / 86400, 0.5)
           , 2), 1), 50)
           ELSE daily_fill_rate END,
         current_fill_level = 0,
         last_collected_at = NOW()
       WHERE household_id = $1`,
      [householdId]
    );
    await db.query('COMMIT');
    res.json({ message: 'Marked as collected' });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('[schedules] collected failed:', err.message);
    res.status(500).json({ message: 'Failed to update status' });
  } finally {
    db.release();
  }
});

export default router;