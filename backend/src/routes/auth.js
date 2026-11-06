import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';

const router = Router();

// POST /api/auth/login -> { token, role, name, username, zone }
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'username and password are required' });
  }

  const { rows } = await pool.query(
    'SELECT user_id, name, username, password_hash, role, assigned_zone FROM users WHERE username = $1',
    [username]
  );
  const user = rows[0];

  // Same message for unknown user and wrong password (do not reveal which one)
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) {
    return res.status(401).json({ message: 'Invalid username or password' });
  }

  const token = jwt.sign(
    { user_id: user.user_id, role: user.role, username: user.username, zone: user.assigned_zone },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    role: user.role,
    name: user.name,
    username: user.username,
    zone: user.assigned_zone,
  });
});

export default router;