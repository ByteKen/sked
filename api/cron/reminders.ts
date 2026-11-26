import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  collectDueReminders,
  formatTelegramReminderMessage,
  getLocalDatePartsInTimezone,
  pruneSentReminders,
} from '../../src/domain/reminders.js';
import {
  extractUserWorkspaces,
  getAdminDb,
  getAppBaseUrl,
  type StoredTelegramSubscription,
} from '../_lib/firebaseAdmin.js';
import { sendTelegramMessage } from '../_lib/telegramClient.js';

function isAuthorizedCron(req: VercelRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const provided = authHeader.slice('Bearer '.length).trim();

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.CRON_SECRET?.trim()) {
    return res.status(503).json({ error: 'CRON_SECRET is not configured on the server.' });
  }

  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'Unauthorized cron invocation.' });
  }

  const mode = req.query.mode === 'hourly' ? 'hourly' : 'daily';
  const now = new Date();
  const nowISO = now.toISOString();
  const baseUrl = getAppBaseUrl(req);

  let checked = 0;
  let notified = 0;
  let sentTasks = 0;
  let skippedWrongHour = 0;
  let blockedUsers = 0;
  let failedSends = 0;

  try {
    const db = getAdminDb();
    const subsSnap = await db
      .collection('telegramSubscriptions')
      .where('enabled', '==', true)
      .get();

    for (const docSnap of subsSnap.docs) {
      checked += 1;
      const sub = docSnap.data() as StoredTelegramSubscription;
      const local = getLocalDatePartsInTimezone(now, sub.timezone);

      if (mode === 'hourly' && local.hour !== sub.reminderHour) {
        skippedWrongHour += 1;
        continue;
      }

      const userSnap = await db.collection('users').doc(sub.uid).get();
      if (!userSnap.exists) continue;

      const workspaces = extractUserWorkspaces(userSnap.data());
      if (workspaces.length === 0) continue;

      const existingSent = sub.sentReminders ?? {};
      const dueItems = collectDueReminders({
        workspaces,
        todayISO: local.dateISO,
        reminderOffsets: sub.reminderOffsets ?? [5, 3, 1, 0],
        includeOverdue: sub.includeOverdue ?? true,
        sentReminders: existingSent,
      });

      if (dueItems.length === 0) {
        continue;
      }

      const message = formatTelegramReminderMessage(dueItems, baseUrl);
      const sendResult = await sendTelegramMessage(sub.chatId, message);

      if (sendResult.ok) {
        notified += 1;
        sentTasks += dueItems.length;

        const nextSent = pruneSentReminders(existingSent, now, 14);
        for (const item of dueItems) {
          nextSent[item.key] = nowISO;
        }

        await docSnap.ref.update({
          sentReminders: nextSent,
          updatedAt: nowISO,
        });
      } else if (sendResult.blocked) {
        blockedUsers += 1;
        await Promise.all([
          docSnap.ref.update({ enabled: false, updatedAt: nowISO }),
          db.collection('users').doc(sub.uid).set({ telegram: { enabled: false } }, { merge: true }),
        ]);
      } else {
        failedSends += 1;
        console.error(`Failed Telegram send for uid=${sub.uid}:`, sendResult.description);
      }
    }

    return res.status(200).json({
      ok: true,
      mode,
      checked,
      notified,
      sentTasks,
      skippedWrongHour,
      blockedUsers,
      failedSends,
      ranAt: nowISO,
    });
  } catch (err) {
    console.error('Deadline reminders cron error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Cron execution failed',
    });
  }
}
