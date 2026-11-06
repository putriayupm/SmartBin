import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getWeatherForecast } from '../services/weather.js';

const router = Router();

router.get('/', authenticate, async (req, res) => {
  res.json(await getWeatherForecast());
});

export default router;