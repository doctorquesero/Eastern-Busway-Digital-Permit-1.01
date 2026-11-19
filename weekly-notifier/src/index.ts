import { initializeApp, getApps } from 'firebase-admin/app';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { Resend } from 'resend';
import { scanExpiredPermits } from './scanner';
import { buildMasterHtml, buildReceiverHtml, MASTER_EMAIL, sendMail } from './email';
import { PERMITS_PATH } from './config';

if (!getApps().length) initializeApp();

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const LIVE_COLLECTION = PERMITS_PATH;

/**
 * Every Monday 06:30 Pacific/Auckland: one email per receiver with expired permits,
 * then one consolidated master report. A failed send never stops the remaining sends.
 */
export const weeklyExpiredPermitScan = onSchedule(
  {
    schedule: '30 6 * * 1',
    timeZone: 'Pacific/Auckland',
    memory: '512MiB',
    timeoutSeconds: 300,
    secrets: [RESEND_API_KEY]
  },
  async () => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('[Weekly Scan] RESEND_API_KEY secret is not configured. Aborting.');
      return;
    }
    // Initialised per run: the secret is only injected into process.env at runtime, not at module load.
    const resend = new Resend(apiKey);

    const now = new Date();
    const { receivers, unassigned, total } = await scanExpiredPermits(LIVE_COLLECTION, now);
    console.log(`[Weekly Scan] ${total} expired, ${receivers.length} receivers, ${unassigned.length} unassigned.`);

    let failures = 0;

    for (const r of receivers) {
      const permitCount = r.permits.length;
      try {
        await sendMail(resend, {
          to: r.receiverEmail,
          subject: `🚨 Action Required: ${permitCount} Expired Mechanical Excavation Permit(s)`,
          html: buildReceiverHtml(r.displayName, r.permits)
        });
        console.log(`[Weekly Scan] Reminder sent to ${r.receiverEmail} (${permitCount}).`);
      } catch (err: any) {
        failures++;
        console.error(`[Weekly Scan] Reminder failed for ${r.receiverEmail}:`, err?.message || err);
      }
    }

    try {
      await sendMail(resend, {
        to: MASTER_EMAIL,
        subject: `📊 Weekly Master Report: ${total} Expired Permits Across Project`,
        html: buildMasterHtml(receivers, unassigned, total, now.toISOString())
      });
      console.log('[Weekly Scan] Master report sent.');
    } catch (err: any) {
      failures++;
      console.error('[Weekly Scan] Master report failed:', err?.message || err);
    }

    // Thrown only after every send was attempted, so Cloud Scheduler records a partial failure.
    if (failures > 0) throw new Error(`${failures} email send(es) failed.`);
  }
);
