import Anthropic from '@anthropic-ai/sdk';
import { pool as sharedPool } from '../config/db.js';
import * as notification from '../services/notification.js';
import { runDailyJob, todayInJakarta } from './runDailyJob.js';
import { createRealHandlers } from '../agent/realHandlers.js';

// Builds the function that runs the daily job with the REAL Claude client and real services.
// MOCK_TOOLS in .env (comma separated tool names) keeps some tools mock, e.g. MOCK_TOOLS=optimize_route.
export function createJob({ pool = sharedPool, log = console } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set in .env');
  if (!process.env.CLAUDE_MODEL) throw new Error('CLAUDE_MODEL is not set in .env');
  if (typeof notification.sendScheduleMessage !== 'function') throw new Error('notification.js does not export "sendScheduleMessage"');

  const client = new Anthropic({ timeout: 60_000 }); // reads ANTHROPIC_API_KEY itself; VERIFY in SDK docs
  const model = process.env.CLAUDE_MODEL;
  const mockTools = (process.env.MOCK_TOOLS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (mockTools.length) log.warn(`[job] MOCK tools in use: ${mockTools.join(', ')}`);

  return ({ zones, date, force = false } = {}) => runDailyJob({
    pool, client, model, zones, date, force, log,
    sendMessage: notification.sendScheduleMessage,
    handlers: createRealHandlers({ pool, mockTools, today: date ?? todayInJakarta() }),
  });
}