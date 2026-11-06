// backend/scripts/weather-server.js
// TEMPORARY test server so the frontend can call a real GET /api/weather before Putri's app.js exists.
// Do NOT commit this file. Run from the backend folder:
//   node --env-file=.env scripts/weather-server.js
import express from 'express';
import cors from 'cors';
import { getWeatherForecast } from '../src/services/weather.js';

const app = express();
app.use(cors()); // lets the Vite dev server (another port) call this server

app.get('/api/weather', async (req, res) => {
  res.json(await getWeatherForecast());
});

app.listen(5000, () => console.log('Test server: http://localhost:5000/api/weather'));
