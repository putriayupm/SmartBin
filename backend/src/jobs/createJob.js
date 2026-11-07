import Anthropic from '@anthropic-ai/sdk';
import { runDailyJob, todayInJakarta } from './runDailyJob.js';
import { createMockHandlers } from '../agent/mockHandlers.js';

// Builds the function that runs the daily job with the REAL Claude client.
// Throws a clear error if the key or model name is missing (nothing is called yet).
export function createJob({ pool, scenario = 'normal', sendMessage = null, log = console }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set in .env');
  if (!process.env.CLAUDE_MODEL) throw new Error('CLAUDE_MODEL is not set in .env');

  const client = new Anthropic({ timeout: 60_000 }); // reads ANTHROPIC_API_KEY itself; VERIFY in SDK docs
  const model = process.env.CLAUDE_MODEL;
  log.warn('[job] using MOCK tool handlers (fake weather/calendar/route) until Syifa\'s services are wired in');

  return ({ zones, date, force = false } = {}) => runDailyJob({
    pool, client, model, zones, date, force, sendMessage, log,
    handlers: createMockHandlers({ scenario, pool, today: date ?? todayInJakarta() }),
  });
}