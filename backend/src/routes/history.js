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

export default router;