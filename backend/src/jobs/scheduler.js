import cron from 'node-cron';

// Wraps a job so that (1) two runs never overlap and (2) a crash is logged, never thrown
// (an unhandled error inside a cron callback could take the whole process down).
export function guarded(run, log = console) {
  let running = false;
  return async () => {
    if (running) {
      log.warn('[cron] previous run is still in progress, skipping this tick');
      return { skipped: true };
    }
    running = true;
    try {
      return await run();
    } catch (err) {
      log.error(`[cron] run crashed: ${err.message}`);
      return { error: err.message };
    } finally {
      running = false;
    }
  };
}

// Starts the daily cron. Default: every day at 05:00, Asia/Jakarta time.
// Returns the task, so the caller (or a test) can call task.stop().
export function startDailyCron({ run, expression = '0 5 * * *', timezone = 'Asia/Jakarta', log = console }) {
  if (!cron.validate(expression)) {
    throw new Error(`Invalid cron expression: "${expression}"`);
  }
  const task = cron.schedule(expression, guarded(run, log), { timezone });
  log.info(`[cron] scheduled "${expression}" (${timezone})`);
  return task;
}