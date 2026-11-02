import { getBinStatus } from '../services/binStatus.js';

// Scenario controls what the mock weather and calendar return.
// Valid values: 'normal' | 'rainy' | 'holiday'
export function createMockHandlers({ scenario = 'normal', pool, today = '2026-11-02' }) {
  if (!['normal', 'rainy', 'holiday'].includes(scenario)) {
    throw new Error(`Unknown scenario: ${scenario}`);
  }

  return {
    // Real data from the dev database (contract: getBinStatus(zone))
    async get_bin_status({ zone }) {
      return getBinStatus(zone, pool);
    },

    // Contract: {available, rain_expected, rainy_periods, summary}
    async get_weather_forecast() {
      if (scenario === 'rainy') {
        return {
          available: true,
          rain_expected: true,
          rainy_periods: 5,
          summary: 'Fake data: heavy rain expected over the next 2 days.',
        };
      }
      return {
        available: true,
        rain_expected: false,
        rainy_periods: 0,
        summary: 'Fake data: mostly sunny, no rain expected.',
      };
    },

    // Contract: [{event_date, event_name, is_holiday}]
    async get_calendar_events({ date_from, date_to }) {
      if (scenario === 'holiday') {
        // Fake holiday 2 days after "today"
        return [
          { event_date: addDays(today, 2), event_name: 'Fake Holiday', is_holiday: true },
        ];
      }
      return [];
    },

    // Contract: {ordered_household_ids, distance_meters, duration}
    // Mock keeps the input order. The real routing API (Syifa) will reorder.
    async optimize_route({ household_ids }) {
      return {
        ordered_household_ids: household_ids.map(String),
        distance_meters: household_ids.length * 250,
        duration: `${household_ids.length * 3} min`,
      };
    },
  };
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}