import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/officers', authenticate, requireRole('operator'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT user_id, name, username, phone_number, assigned_zone AS zone
     FROM users WHERE role = 'officer' ORDER BY assigned_zone`
  );
  res.json(rows);
});

export default router;