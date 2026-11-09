// Safely parses the agent's text reply into a JSON object.
// Handles: plain JSON, JSON wrapped in ```json fences, JSON with extra text around it.
// Never throws. Returns { ok: true, data } or { ok: false, error }.
export function parseAgentOutput(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, error: 'Agent output is empty' };
  }

  // Remove markdown code fences if the model added them
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  try {
    return { ok: true, data: JSON.parse(cleaned) };
  } catch {
    // Fallback: take everything from the first "{" to the last "}"
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return { ok: true, data: JSON.parse(cleaned.slice(start, end + 1)) };
      } catch {
        // fall through to the error below
      }
    }
    return { ok: false, error: 'Agent output is not valid JSON' };
  }
}

// Validates the agent's schedule against the known households of the zone.
// knownHouseholdIds: IDs returned by getBinStatus(zone).
// Returns { valid, errors, schedule }. `schedule` is null when invalid,
// so the caller cannot accidentally save or send a bad schedule.
export function validateSchedule(output, knownHouseholdIds, { maxStops = 11 } = {}) {
  const errors = [];

  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return { valid: false, errors: ['Output is not a JSON object'], schedule: null };
  }
  if (!Array.isArray(output.households)) {
    return { valid: false, errors: ['"households" is not an array'], schedule: null };
  }
  if (output.summary != null && typeof output.summary !== 'string') {
    errors.push('"summary" must be a string');
  }

  const known = new Set(knownHouseholdIds.map(String));
  const seen = new Set();
  const households = [];

  if (output.households.length > maxStops) {
    errors.push(`Too many stops: ${output.households.length} (max ${maxStops})`);
  }

  output.households.forEach((item, i) => {
    const where = `households[${i}]`;
    if (!item || typeof item !== 'object') {
      errors.push(`${where} is not an object`);
      return;
    }

    const id = item.household_id == null ? '' : String(item.household_id);
    if (!known.has(id)) errors.push(`${where}: unknown household_id "${id}"`);
    if (seen.has(id)) errors.push(`${where}: duplicate household_id "${id}"`);
    seen.add(id);

    const score = item.priority_score;
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
      errors.push(`${where}: priority_score must be a number between 0 and 100`);
    }

    if (typeof item.reason !== 'string' || item.reason.trim() === '') {
      errors.push(`${where}: reason must be a non-empty string`);
    }

    households.push({
      household_id: id,
      priority_score: score,
      reason: typeof item.reason === 'string' ? item.reason.trim() : '',
    });
  });

  const valid = errors.length === 0;
  return {
    valid,
    errors,
    schedule: valid ? { households, summary: output.summary ?? '' } : null,
  };
}