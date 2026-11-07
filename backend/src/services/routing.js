// services/routing.js
// Contract: optimizeRoute(householdIds) -> { ordered_household_ids, distance_meters, duration }
// Extra field: fallback (true when the input order is returned because Mapbox could not be used).
// Never throws. distance_meters is in meters, duration is in seconds.
// The trip is a round trip (depot -> stops -> depot), so both values include the way back.
import { pool } from '../config/db.js';

const MAPBOX_URL = 'https://api.mapbox.com/optimized-trips/v1/mapbox/driving';
// Mapbox Optimization v1 accepts 12 coordinates per request and one of them is the depot
const MAX_HOUSEHOLDS = 11;

function fallbackResult(ids) {
  return { ordered_household_ids: ids, distance_meters: null, duration: null, fallback: true };
}

export async function optimizeRoute(householdIds) {
  // Normalise: strings, no duplicates, keep the input order
  const ids = [...new Set((householdIds ?? []).map(String))];
  if (ids.length === 0) {
    return { ordered_household_ids: [], distance_meters: 0, duration: 0, fallback: false };
  }

  try {
    if (ids.length > MAX_HOUSEHOLDS) {
      throw new Error(`Too many households (${ids.length}), max ${MAX_HOUSEHOLDS}`);
    }

    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token || !process.env.DEPOT_LAT || !process.env.DEPOT_LNG) {
      throw new Error('MAPBOX_ACCESS_TOKEN, DEPOT_LAT or DEPOT_LNG is not set in .env');
    }
    const depotLat = Number(process.env.DEPOT_LAT);
    const depotLng = Number(process.env.DEPOT_LNG);
    if (!Number.isFinite(depotLat) || !Number.isFinite(depotLng)) {
      throw new Error('DEPOT_LAT or DEPOT_LNG is not a number');
    }
    const timeoutMs = Number(process.env.ROUTING_TIMEOUT_MS) || 5000;

    // The contract only passes ids, so we read the coordinates from the database.
    // household_id::text lets this work whether the column is an integer or text.
    const { rows } = await pool.query(
      `SELECT household_id::text AS household_id, latitude, longitude
       FROM households
       WHERE household_id::text = ANY($1::text[])`,
      [ids]
    );
    const byId = new Map(rows.map((r) => [r.household_id, r]));
    const stops = ids.map((id) => {
      const h = byId.get(id);
      const lat = Number(h?.latitude);
      const lng = Number(h?.longitude);
      if (!h || h.latitude == null || h.longitude == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error(`Household ${id} not found or has no coordinates`);
      }
      return { id, lat, lng };
    });

    // Mapbox wants longitude first. The depot goes first because of source=first.
    const coords = [`${depotLng},${depotLat}`, ...stops.map((s) => `${s.lng},${s.lat}`)].join(';');
    const url =
      `${MAPBOX_URL}/${coords}` +
      `?source=first&destination=any&roundtrip=true&overview=false` +
      `&access_token=${encodeURIComponent(token)}`;

    // Never log the url: it contains the token
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`Mapbox responded with HTTP ${res.status}`);
    const json = await res.json();
    if (json.code !== 'Ok') throw new Error(`Mapbox returned code ${json.code}`);

    // json.waypoints is in input order; waypoint_index is the position inside the optimized trip.
    const wps = json.waypoints;
    const trip = json.trips?.[0];
    if (!trip || !Array.isArray(wps) || wps.length !== ids.length + 1) {
      throw new Error('Unexpected Mapbox response shape');
    }
    if (wps[0].waypoint_index !== 0) throw new Error('Depot is not the first stop of the trip');

    const positions = ids.map((id, i) => ({ id, pos: wps[i + 1].waypoint_index }));
    const unique = new Set(positions.map((p) => p.pos));
    if (unique.size !== ids.length || positions.some((p) => !Number.isInteger(p.pos))) {
      throw new Error('Invalid waypoint_index values in Mapbox response');
    }

    return {
      ordered_household_ids: positions.sort((a, b) => a.pos - b.pos).map((p) => p.id),
      distance_meters: Math.round(trip.distance),
      duration: Math.round(trip.duration),
      fallback: false,
    };
  } catch (err) {
    // Any failure: keep the scheduler running with the input order
    console.error('[routing] failed, using input order:', err.message);
    return fallbackResult(ids);
  }
}