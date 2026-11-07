import bcrypt from 'bcrypt';
import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireRole('operator'));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Normalizes an Indonesian phone number to the stored format 62812... (digits only)
function normalizePhone(input) {
  if (input === undefined || input === null || String(input).trim() === '') return null;
  let p = String(input).replace(/[\s\-().]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('0')) p = '62' + p.slice(1);
  if (!/^62\d{8,13}$/.test(p)) throw new Error('INVALID_PHONE');
  return p;
}

// GET /api/users/officers
router.get('/officers', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT user_id, name, username, phone_number, assigned_zone
     FROM users WHERE role = 'officer' ORDER BY assigned_zone, name`
  );
  res.json(rows);
});

// POST /api/users/officers
router.post('/officers', async (req, res) => {
  const { name, username, password, phone_number, assigned_zone } = req.body || {};
  if (!name || !username || !password || !assigned_zone) {
    return res.status(400).json({ message: 'name, username, password and assigned_zone are required' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ message: 'password must be at least 8 characters' });
  }
  let phone;
  try { phone = normalizePhone(phone_number); }
  catch { return res.status(400).json({ message: 'Invalid phone number' }); }

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, username, password_hash, role, assigned_zone, phone_number)
       VALUES ($1,$2,$3,'officer',$4,$5)
       RETURNING user_id, name, username, phone_number, assigned_zone`,
      [name, username, hash, assigned_zone, phone]
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
  let phone = null;
  if (phone_number !== undefined) {
    try { phone = normalizePhone(phone_number); }
    catch { return res.status(400).json({ message: 'Invalid phone number' }); }
  }

  const { rows } = await pool.query(
    `UPDATE users
     SET name = COALESCE($2, name),
         phone_number = COALESCE($3, phone_number),
         assigned_zone = COALESCE($4, assigned_zone)
     WHERE user_id = $1 AND role = 'officer'
     RETURNING user_id, name, username, phone_number, assigned_zone`,
    [id, name ?? null, phone, assigned_zone ?? null]
  );
  if (rows.length === 0) {
    return res.status(404).json({ message: 'Officer not found' });
  }
  res.json(rows[0]);
});

export default router;