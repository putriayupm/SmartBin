// routes/weather.js
// GET /api/weather -> returns the contract shape from getWeatherForecast().
// The service never throws, so this route always answers with HTTP 200.
import { Router } from 'express';
import { getWeatherForecast } from '../services/weather.js';

const router = Router();

router.get('/', async (req, res) => {
  res.json(await getWeatherForecast());
});

export default router;