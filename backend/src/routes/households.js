import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// All routes here are operator only
router.use(authenticate, requireRole('operator'));

// GET /api/households
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM households ORDER BY zone, name');
  res.json(rows);
});

// POST /api/households
router.post('/', async (req, res) => {
  const { name, address, zone, latitude, longitude } = req.body || {};
  if (!name || !address || !zone) {
    return res.status(400).json({ message: 'name, address and zone are required' });
  }

  const { rows } = await pool.query(
    `INSERT INTO households (name, address, zone, latitude, longitude)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, address, zone, latitude ?? null, longitude ?? null]
  );
  res.status(201).json(rows[0]);
});

// PATCH /api/households/:id/fill-level  body: { current_fill_level: 0-100 }
router.patch('/:id/fill-level', async (req, res) => {
  const { id } = req.params;
  const level = Number(req.body?.current_fill_level);

  if (!UUID_RE.test(id)) {
    return res.status(400).json({ message: 'Invalid household id' });
  }
  if (!Number.isFinite(level) || level < 0 || level > 100) {
    return res.status(400).json({ message: 'current_fill_level must be a number between 0 and 100' });
  }

  const { rows } = await pool.query(
    'UPDATE households SET current_fill_level = $1 WHERE household_id = $2 RETURNING *',
    [level, id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ message: 'Household not found' });
  }
  res.json(rows[0]);
});

// PATCH /api/households/:id  (edit basic info)
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ message: 'Invalid household id' });
  }
  const { name, address, zone, latitude, longitude, bin_capacity } = req.body || {};
  if ([name, address, zone, latitude, longitude, bin_capacity].every((v) => v === undefined)) {
    return res.status(400).json({ message: 'Provide at least one field to update' });
  }

  const { rows } = await pool.query(
    `UPDATE households
     SET name = COALESCE($2, name),
         address = COALESCE($3, address),
         zone = COALESCE($4, zone),
         latitude = COALESCE($5, latitude),
         longitude = COALESCE($6, longitude),
         bin_capacity = COALESCE($7, bin_capacity)
     WHERE household_id = $1
     RETURNING *`,
    [id, name ?? null, address ?? null, zone ?? null,
     latitude ?? null, longitude ?? null, bin_capacity ?? null]
  );
  if (rows.length === 0) {
    return res.status(404).json({ message: 'Household not found' });
  }
  res.json(rows[0]);
});

export default router;