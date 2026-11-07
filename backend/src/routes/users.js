import bcrypt from 'bcrypt';
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/users/officers
router.post('/officers', async (req, res) => {
  const { name, username, password, phone_number, assigned_zone } = req.body || {};
  if (!name || !username || !password || !assigned_zone) {
    return res.status(400).json({ message: 'name, username, password and assigned_zone are required' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ message: 'password must be at least 8 characters' });
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, username, password_hash, role, assigned_zone, phone_number)
       VALUES ($1,$2,$3,'officer',$4,$5)
       RETURNING user_id, name, username, phone_number, assigned_zone`,
      [name, username, hash, assigned_zone, phone_number ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Username already exists' });
    }
    throw err;
  }
});

// PATCH /api/users/officers/:id  (name, phone_number, assigned_zone)
router.patch('/officers/:id', async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ message: 'Invalid officer id' });
  }
  const { name, phone_number, assigned_zone } = req.body || {};
  if (name === undefined && phone_number === undefined && assigned_zone === undefined) {
    return res.status(400).json({ message: 'Provide at least one field to update' });
  }

  const { rows } = await pool.query(
    `UPDATE users
     SET name = COALESCE($2, name),
         phone_number = COALESCE($3, phone_number),
         assigned_zone = COALESCE($4, assigned_zone)
     WHERE user_id = $1 AND role = 'officer'
     RETURNING user_id, name, username, phone_number, assigned_zone`,
    [id, name ?? null, phone_number ?? null, assigned_zone ?? null]
  );
  if (rows.length === 0) {
    return res.status(404).json({ message: 'Officer not found' });
  }
  res.json(rows[0]);
});

export default router;