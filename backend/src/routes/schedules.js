import { Router } from 'express';
import { pool } from '../config/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.use(authenticate);

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

// PATCH /api/schedules/:id/override  (operator only)
// Body (at least one): officer_id, status ('pending'|'skipped'), reason
router.patch('/:id/override', requireRole('operator'), async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ message: 'Invalid schedule id' });
  }
  const { officer_id, status, reason } = req.body || {};

  if ([officer_id, status, reason].every((v) => v === undefined)) {
    return res.status(400).json({ message: 'Provide at least one of officer_id, status, reason' });
  }
  if (status !== undefined && !['pending', 'skipped'].includes(status)) {
    return res.status(400).json({ message: "status must be 'pending' or 'skipped'" });
  }
  if (officer_id !== undefined && !UUID_RE.test(String(officer_id))) {
    return res.status(400).json({ message: 'Invalid officer_id' });
  }
  if (reason !== undefined && (typeof reason !== 'string' || !reason.trim())) {
    return res.status(400).json({ message: 'reason must be a non-empty string' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cur = await client.query(
      `SELECT officer_id, schedule_date::text AS d, status
       FROM schedules WHERE schedule_id = $1 FOR UPDATE`,
      [id]
    );
    if (cur.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Schedule not found' });
    }
    if (cur.rows[0].status === 'collected') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Collected schedules cannot be overridden' });
    }

    // New officer: validate and put the stop at the end of that officer's route
    let routeOrder = null;
    if (officer_id !== undefined && officer_id !== cur.rows[0].officer_id) {
      const off = await client.query(
        `SELECT 1 FROM users WHERE user_id = $1 AND role = 'officer'`, [officer_id]
      );
      if (off.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Officer not found' });
      }
      const mx = await client.query(
        `SELECT COALESCE(MAX(route_order), 0) + 1 AS next
         FROM schedules WHERE schedule_date = $1::date AND officer_id = $2`,
        [cur.rows[0].d, officer_id]
      );
      routeOrder = mx.rows[0].next;
    }

    const upd = await client.query(
      `UPDATE schedules
       SET officer_id = COALESCE($2, officer_id),
           route_order = COALESCE($3, route_order),
           status = COALESCE($4, status),
           override_reason = COALESCE($5, override_reason),
           overridden_by = $6,
           overridden_at = NOW()
       WHERE schedule_id = $1
       RETURNING *`,
      [id, officer_id ?? null, routeOrder, status ?? null, reason ?? null, req.user.user_id]
    );

    await client.query('COMMIT');
    res.json(upd.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /api/schedules/:id/move  body: { direction: 'up' | 'down' }  (operator only)
// Swaps route_order with the neighbouring stop of the same officer and date.
router.patch('/:id/move', requireRole('operator'), async (req, res) => {
  const { id } = req.params;
  const direction = req.body?.direction;
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ message: 'Invalid schedule id' });
  }
  if (!['up', 'down'].includes(direction)) {
    return res.status(400).json({ message: "direction must be 'up' or 'down'" });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cur = await client.query(
      `SELECT officer_id, schedule_date::text AS d, route_order, status
       FROM schedules WHERE schedule_id = $1 FOR UPDATE`,
      [id]
    );
    if (cur.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Schedule not found' });
    }
    const s = cur.rows[0];
    if (s.status === 'collected') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Collected schedules cannot be moved' });
    }

    const cmp = direction === 'up' ? '<' : '>';
    const dir = direction === 'up' ? 'DESC' : 'ASC';
    const nb = await client.query(
      `SELECT schedule_id, route_order FROM schedules
       WHERE schedule_date = $1::date AND officer_id = $2 AND route_order ${cmp} $3
       ORDER BY route_order ${dir} LIMIT 1 FOR UPDATE`,
      [s.d, s.officer_id, s.route_order]
    );
    if (nb.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: `Already at the ${direction === 'up' ? 'top' : 'bottom'}` });
    }

    await client.query(
      `UPDATE schedules SET route_order = $2, overridden_by = $3, overridden_at = NOW()
       WHERE schedule_id = $1`,
      [id, nb.rows[0].route_order, req.user.user_id]
    );
    await client.query(
      `UPDATE schedules SET route_order = $2 WHERE schedule_id = $1`,
      [nb.rows[0].schedule_id, s.route_order]
    );

    const list = await client.query(
      `SELECT schedule_id, route_order FROM schedules
       WHERE schedule_date = $1::date AND officer_id = $2 ORDER BY route_order`,
      [s.d, s.officer_id]
    );

    await client.query('COMMIT');
    res.json(list.rows);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/schedules/summary  (today's AI summary per zone; officer sees own zone only)
router.get('/summary', async (req, res) => {
  const params = [];
  let zoneFilter = '';
  if (req.user.role === 'officer') {
    params.push(req.user.zone);
    zoneFilter = 'AND zone = $1';
  }
  const { rows } = await pool.query(
    `SELECT schedule_date::text AS schedule_date, zone, summary, created_at
     FROM schedule_runs
     WHERE schedule_date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date ${zoneFilter}
     ORDER BY zone`,
    params
  );
  res.json(rows);
});

export default router;