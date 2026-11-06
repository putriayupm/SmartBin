import 'dotenv/config';
import bcrypt from 'bcrypt';
import { pool } from './config/db.js';

const hash = await bcrypt.hash('smartbin123', 10);

const users = [
  ['Slamet Riyadi', 'slamet.riyadi', 'officer', 'A', '6281200000001'],
  ['Joko Prasetyo', 'joko.prasetyo', 'officer', 'B', '6281200000002'],
  ['Dedi Kurniawan', 'dedi.kurniawan', 'officer', 'C', '6281200000003'],
  ['Hendra Wijaya', 'hendra.wijaya', 'operator', null, '6281200000004'],
];
for (const [name, username, role, zone, phone] of users) {
  await pool.query(
    `INSERT INTO users (name, username, password_hash, role, assigned_zone, phone_number)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (username) DO NOTHING`,
    [name, username, hash, role, zone, phone]);
}

const houses = [
  ['Sari Wulandari', 'Blok A No. 12', 'A', 92], ['Budi Santoso', 'Blok A No. 7', 'A', 88],
  ['Dewi Lestari', 'Blok A No. 21', 'A', 71], ['Agus Hartono', 'Blok B No. 3', 'B', 85],
  ['Rina Marlina', 'Blok B No. 15', 'B', 64], ['Hasan Basri', 'Blok B No. 9', 'B', 48],
  ['Lina Anggraini', 'Blok C No. 3', 'C', 90], ['Eko Prabowo', 'Blok C No. 10', 'C', 58],
  ['Tuti Handayani', 'Blok C No. 18', 'C', 67],
];
let i = 0;
for (const [name, address, zone, fill] of houses) {
  i++;
  await pool.query(
    `INSERT INTO households (name, address, zone, latitude, longitude, current_fill_level, daily_fill_rate, last_collected_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, NOW() - INTERVAL '3 days')`,
    [name, address, zone, -6.3 + i * 0.0006, 106.67 + i * 0.0004, fill, 15]);
}
console.log('Seed selesai');
await pool.end();