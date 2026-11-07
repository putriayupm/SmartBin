import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, requireRole('operator'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const { rows } = await pool.query(
    `SELECT ch.history_id, ch.collected_at, h.name AS household_name,
            h.address, h.zone, u.name AS officer_name
     FROM collection_history ch
     JOIN households h ON h.household_id = ch.household_id
     JOIN users u ON u.user_id = ch.officer_id
     ORDER BY ch.collected_at DESC
     LIMIT $1`,
    [limit]
  );
  res.json(rows);
});

// GET /api/history/summary?days=14
router.get('/summary', async (req, res) => {
  let days = Number.parseInt(req.query.days ?? '14', 10);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return res.status(400).json({ message: 'days must be an integer between 1 and 90' });
  }

  const perDay = await pool.query(
    `SELECT schedule_date::text AS date,
            COUNT(*)::int AS scheduled,
            COUNT(*) FILTER (WHERE status = 'collected')::int AS collected
     FROM schedules
     WHERE schedule_date > (NOW() AT TIME ZONE 'Asia/Jakarta')::date - $1::int
       AND schedule_date <= (NOW() AT TIME ZONE 'Asia/Jakarta')::date
     GROUP BY schedule_date
     ORDER BY schedule_date`,
    [days]
  );

  const total = await pool.query(
    `SELECT COUNT(*)::int AS total_collections
     FROM collection_history
     WHERE (collected_at AT TIME ZONE 'Asia/Jakarta')::date >
           (NOW() AT TIME ZONE 'Asia/Jakarta')::date - $1::int`,
    [days]
  );

  const scheduled = perDay.rows.reduce((n, r) => n + r.scheduled, 0);
  const collected = perDay.rows.reduce((n, r) => n + r.collected, 0);

  res.json({
    total_collections: total.rows[0].total_collections,
    completion_rate: scheduled === 0 ? 0 : Math.round((collected / scheduled) * 1000) / 10,
    days: perDay.rows,
  });
});

export default router;