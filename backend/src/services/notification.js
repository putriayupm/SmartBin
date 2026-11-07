// backend/src/services/notification.js
// Contract: sendScheduleMessage(officer, date) -> { sent, status, error? }
//   officer = { user_id, name, phone_number }   date = 'YYYY-MM-DD'
// Must NEVER throw. Every outcome is written to notification_logs.
//   status: 'sent' | 'failed' | 'skipped'  (column is VARCHAR(10))
// Channel is chosen with NOTIFICATION_CHANNEL (read on every call):
//   'in_app'   (default) simulated reminder: only a log row, the officer sees it in the web dashboard
//   'whatsapp' real WhatsApp Cloud API; without credentials -> 'skipped' + 'not_configured'
import { pool } from '../config/db.js'; // TODO(verify): path of Putri's db.js relative to this file

const TIMEOUT_MS = Number(process.env.WHATSAPP_TIMEOUT_MS) || 8000;
const TEMPLATE_LANG = 'id';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CHANNELS = ['in_app', 'whatsapp']; // channel column is VARCHAR(20)

// Writes one row to notification_logs. If logging itself fails we only print it,
// so the caller still gets a result.
async function writeLog(officerId, date, channel, status, errorMessage) {
  try {
    await pool.query(
      `INSERT INTO notification_logs (officer_id, schedule_date, channel, status, error_message)
       VALUES ($1, $2, $3, $4, $5)`,
      [officerId, date, channel, status, errorMessage ? String(errorMessage).slice(0, 500) : null]
    );
  } catch (err) {
    console.error('[notification] could not write notification_logs:', err.message);
  }
}

async function finish(officer, date, channel, status, error) {
  await writeLog(officer?.user_id ?? null, date, channel, status, error);
  return { sent: status === 'sent', status, channel, ...(error ? { error } : {}) };
}

export async function sendScheduleMessage(officer, date) {
  const channel = (process.env.NOTIFICATION_CHANNEL || 'in_app').toLowerCase();
  try {
    // ---- 1. validate input (no DB write possible without a valid officer id/date) ----
    if (!officer?.user_id || !DATE_RE.test(String(date))) {
      console.error('[notification] invalid input');
      return { sent: false, status: 'failed', channel, error: 'invalid_input' };
    }
    if (!CHANNELS.includes(channel)) {
      return await finish(officer, date, channel.slice(0, 20), 'failed', 'unknown_channel');
    }

    // ---- 2. simulated reminder: the log row IS the reminder ----
    if (channel === 'in_app') {
      return await finish(officer, date, 'in_app', 'sent', null);
    }

    // ---- 3. WhatsApp: build the message values from the DB (no resident names, only count + zone) ----
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM schedules
       WHERE officer_id = $1 AND schedule_date = $2 AND status <> 'skipped'`,
      [officer.user_id, date]
    );
    const zoneRes = await pool.query('SELECT assigned_zone FROM users WHERE user_id = $1', [officer.user_id]);
    const houseCount = countRes.rows[0].n;
    const zone = zoneRes.rows[0]?.assigned_zone ?? '-';
    const dateText = new Date(`${date}T00:00:00+07:00`).toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta',
    });

    // credentials missing -> do not call Meta, just log
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) {
      return await finish(officer, date, 'whatsapp', 'skipped', 'not_configured');
    }

    // officer has no phone number
    const digits = String(officer.phone_number ?? '').replace(/\D/g, '');
    if (!digits) return await finish(officer, date, 'whatsapp', 'failed', 'no_phone_number');

    // ---- 4. real send. UNTESTED until a Meta account works. ----
    // TODO(verify) against Meta docs (Cloud API "Messages" reference + template message docs):
    //   API version, URL, body shape, and the template name/variables you registered.
    const version = process.env.WHATSAPP_API_VERSION || 'v23.0';
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'jadwal_pengambilan_sampah';
    const body = {
      messaging_product: 'whatsapp',
      to: `+${digits}`, // Meta recommends the plus sign + country code; DB stores 62812... without "+"
      type: 'template',
      template: {
        name: templateName,
        language: { code: TEMPLATE_LANG },
        components: [{
          type: 'body',
          // Template "Version A": {{1}} name, {{2}} date, {{3}} house count, {{4}} zone
          parameters: [officer.name ?? '-', dateText, String(houseCount), String(zone)].map((text) => ({ type: 'text', text })),
        }],
      },
    };

    const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.error?.message ?? ''; } catch { /* ignore */ }
      return await finish(officer, date, 'whatsapp', 'failed', `HTTP ${res.status} ${detail}`.trim());
    }
    return await finish(officer, date, 'whatsapp', 'sent', null);
  } catch (err) {
    // timeout, network error, DB error ...
    console.error('[notification] failed:', err.message);
    return await finish(officer, date, CHANNELS.includes(channel) ? channel : 'unknown', 'failed', err.message);
  }
}