// services/weather.js
// Weather service for SmartBin (contract: getWeatherForecast() -> {available, rain_expected, rainy_periods, summary}).
// Source: BMKG public forecast API. Must NEVER throw: on any failure it returns available:false.

const BMKG_URL = 'https://api.bmkg.go.id/publik/prakiraan-cuaca';
const TIMEOUT_MS = Number(process.env.BMKG_TIMEOUT_MS) || 5000; // env override is only for failure-path testing
const WINDOW_HOURS = 24; // how far ahead we look for rain
const SLOT_HOURS = 3; // BMKG gives one forecast every 3 hours
const CACHE_TTL_MS = 30 * 60 * 1000; // BMKG updates 2x/day, so a 30-minute cache is safe

// TODO(verify): confirm these field names by running the curl in Step 1.
const FIELD_DATETIME = 'utc_datetime'; // documented by BMKG: "YYYY-MM-DD HH:mm:ss" in UTC
const FIELD_DESCRIPTION = 'weather_desc'; // NOT confirmed yet, check the real JSON
const RAIN_KEYWORD = 'hujan'; // Indonesian weather descriptions, e.g. "Hujan Ringan"

const UNAVAILABLE = {
  available: false,
  rain_expected: false,
  rainy_periods: 0,
  summary: 'Data cuaca BMKG tidak tersedia.',
};

let cache = null; // { at: number, value: object }, only successful results are cached

export async function getWeatherForecast() {
  const adm4 = process.env.BMKG_ADM4;
  if (!adm4) {
    console.error('[weather] BMKG_ADM4 is not set in .env');
    return UNAVAILABLE;
  }

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  try {
    // AbortSignal.timeout aborts the request if BMKG is slow (needs Node 18+)
    const res = await fetch(`${BMKG_URL}?adm4=${encodeURIComponent(adm4)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`BMKG responded with HTTP ${res.status}`);

    const json = await res.json();
    const value = analyze(json);
    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    console.error('[weather] failed:', err.message);
    return UNAVAILABLE;
  }
}

// Turns the raw BMKG JSON into our contract shape. Throws if the structure is unexpected;
// the caller catches it and returns UNAVAILABLE.
function analyze(json) {
  // BMKG structure: data[0].cuaca is a list of days, each day is a list of 3-hourly forecasts
  const entries = (json?.data?.[0]?.cuaca ?? []).flat();
  if (entries.length === 0) throw new Error('No forecast entries in BMKG response');

  const now = Date.now();
  const from = now - SLOT_HOURS * 3600 * 1000; // include the slot that is currently running
  const to = now + WINDOW_HOURS * 3600 * 1000;

  const upcoming = entries.filter((e) => {
    const t = new Date(String(e[FIELD_DATETIME]).replace(' ', 'T') + 'Z').getTime();
    return t >= from && t < to;
  });
  if (upcoming.length === 0) throw new Error('No forecast entries inside the next 24 hours');

  const rainy = upcoming.filter((e) =>
    String(e[FIELD_DESCRIPTION] ?? '').toLowerCase().includes(RAIN_KEYWORD)
  );

  return {
    available: true,
    rain_expected: rainy.length > 0,
    rainy_periods: rainy.length,
    summary:
      rainy.length > 0
        ? `Hujan diperkirakan pada ${rainy.length} periode (3 jam) dalam 24 jam ke depan.`
        : 'Tidak ada hujan diperkirakan dalam 24 jam ke depan.',
  };
}
