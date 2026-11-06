import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './config/db.js';
import authRoutes from './routes/auth.js';
import householdRoutes from './routes/households.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT NOW() AS now');
    res.json({ status: 'ok', database_time: rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/households', householdRoutes);

// Fallback error handler (Express 5 forwards async errors here)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`SmartBin API berjalan di http://localhost:${PORT}`));