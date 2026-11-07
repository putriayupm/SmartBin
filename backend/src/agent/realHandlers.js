import { getBinStatus } from '../services/binStatus.js';
import * as weather from '../services/weather.js';
import * as calendar from '../services/calendar.js';
import * as routing from '../services/routing.js';
import { createMockHandlers } from './mockHandlers.js';

// Tool handlers backed by the team's real services.
// mockTools: tool names that stay MOCK (e.g. ['optimize_route'] while routing is not ready).
// Contracts: weather/calendar/routing never throw (Syifa); getBinStatus can throw and runAgent reports it to the model.
export function createRealHandlers({ pool, mockTools = [], scenario = 'normal', today }) {
  const need = (mod, name, file) => {
    if (typeof mod[name] !== 'function') throw new Error(`${file} does not export "${name}"`);
    return mod[name];
  };
  const mock = createMockHandlers({ scenario, pool, today });
  const real = {
    get_bin_status: ({ zone }) => getBinStatus(zone, pool),
    get_weather_forecast: () => need(weather, 'getWeatherForecast', 'weather.js')(),
    get_calendar_events: ({ date_from, date_to }) => need(calendar, 'getCalendarEvents', 'calendar.js')(date_from, date_to),
    optimize_route: ({ household_ids }) => need(routing, 'optimizeRoute', 'routing.js')(household_ids.map(String)),
  };
  return Object.fromEntries(Object.keys(real).map((k) => [k, mockTools.includes(k) ? mock[k] : real[k]]));
}