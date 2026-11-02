// backend/scripts/test-weather.js
// Run from the backend folder (see the PowerShell commands in the guide):
//   node --env-file=.env scripts/test-weather.js
import { getWeatherForecast } from '../src/services/weather.js';

console.time('getWeatherForecast');
const result = await getWeatherForecast();
console.timeEnd('getWeatherForecast');
console.log(JSON.stringify(result, null, 2));
