import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import {
  computeNextAgendaReminder,
  formatAgendaTelegramMessage,
  isAgendaOccurrenceDone,
  isRepeatingAgendaItem,
  resolveOccurrenceDateForAlert,
  sanitizeAgendaItems,
} from '../../src/domain/agenda.js';
import { scheduleAgendaCloudTask } from '../_lib/cloudTasks.js';
import {
  getAdminDb,
  getAppBaseUrl,
  type StoredTelegramSubscription,
} from '../_lib/firebaseAdmin.js';
import { sendTelegramMessage } from '../_lib/telegramClient.js';

interface DeliverPayload {
  uid?: string;
  itemId?: string;
  reminderTargetISO?: string;
}

function isAuthorizedTaskCallback(req: VercelRequest): boolean {
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

/**
 * One-shot webhook invoked exclusively by Google Cloud Tasks at the exact scheduled
 * reminder timestamp for a single personal agenda item (zero polling).
 * For repeating items, immediately self-chains the next occurrence's Cloud Task after delivery.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.CRON_SECRET?.trim()) {
    return res.status(503).json({ error: 'Server secret is not configured.' });
  }

  if (!isAuthorizedTaskCallback(req)) {
    return res.status(401).json({ error: 'Unauthorized task invocation.' });
  }

  const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as DeliverPayload;
  const uid = typeof body.uid === 'string' ? body.uid.trim() : '';
  const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : '';
  const expectedTargetISO =
    typeof body.reminderTargetISO === 'string' ? body.reminderTargetISO.trim() : '';

  if (!uid || !itemId) {
    return res.status(200).json({ ok: true, skipped: 'invalid-payload' });
  }

  try {
    const db = getAdminDb();
    const userRef = db.collection('users').doc(uid);
    const subRef = db.collection('telegramSubscriptions').doc(uid);

    const [userSnap, subSnap] = await Promise.all([userRef.get(), subRef.get()]);
    if (!userSnap.exists || !subSnap.exists) {
      return res.status(200).json({ ok: true, skipped: 'missing-user-or-subscription' });
    }

    const sub = subSnap.data() as StoredTelegramSubscription;
    if (!sub.enabled || !sub.chatId) {
      return res.status(200).json({ ok: true, skipped: 'telegram-paused' });
    }

    const items = sanitizeAgendaItems(userSnap.data()?.agendaItems);
    const target = items.find((entry) => entry.id === itemId);

    if (!target || target.reminderOffsetMinutes === null) {
      return res.status(200).json({ ok: true, skipped: 'already-handled' });
    }

    const repeating = isRepeatingAgendaItem(target);
    const occurrenceDate = resolveOccurrenceDateForAlert(target, expectedTargetISO || target.reminderTargetISO);

    if (!repeating && (target.isDone || target.reminderSentAt)) {
      return res.status(200).json({ ok: true, skipped: 'already-handled' });
    }
    if (repeating && isAgendaOccurrenceDone(target, occurrenceDate)) {
      return res.status(200).json({ ok: true, skipped: 'occurrence-already-done' });
    }

    // Idempotency guard: if the user rescheduled this item after this Cloud Task was queued, ignore stale task
    if (expectedTargetISO && target.reminderTargetISO && target.reminderTargetISO !== expectedTargetISO) {
      return res.status(200).json({ ok: true, skipped: 'stale-schedule' });
    }

    const baseUrl = getAppBaseUrl(req);
    const text = formatAgendaTelegramMessage(target, baseUrl, occurrenceDate);
    const doneCallback = repeating ? `agd:${target.id}:${occurrenceDate}` : `agd:${target.id}`;
    const sendResult = await sendTelegramMessage(sub.chatId, text, {
      inline_keyboard: [
        [
          { text: '✅ Mark Done', callback_data: doneCallback },
          { text: '📅 Today', callback_data: 'to' },
        ],
      ],
    });

    const nowMs = Date.now();
    const nowISO = new Date(nowMs).toISOString();

    if (sendResult.ok) {
      let nextReminderTargetISO: string | null = target.reminderTargetISO ?? null;
      let nextCloudTaskName: string | null = null;
      let nextReminderSentAt: string | null = nowISO;

      if (repeating) {
        const deliveredMs = Date.parse(expectedTargetISO || target.reminderTargetISO || nowISO);
        const minNextAlertMs = Math.max(nowMs, Number.isNaN(deliveredMs) ? nowMs : deliveredMs) + 60_000;
        const chained = computeNextAgendaReminder({
          date: target.date,
          time: target.time,
          recurrence: target.recurrence,
          recurrenceEndDate: target.recurrenceEndDate,
          completedDates: target.completedDates,
          reminderOffsetMinutes: target.reminderOffsetMinutes,
          timezone: target.timezone,
          defaultReminderHour: sub.reminderHour ?? 9,
          nowMs,
          minAlertUtcMs: minNextAlertMs,
        });

        nextReminderTargetISO = chained?.reminderTargetISO ?? null;
        if (nextReminderTargetISO) {
          const scheduled = await scheduleAgendaCloudTask({
            uid,
            itemId: target.id,
            reminderTargetISO: nextReminderTargetISO,
            baseUrl,
          });
          nextCloudTaskName = scheduled.taskName;
          // Clear reminderSentAt while future repeats remain pending so daily cron can pick up >29d items
          nextReminderSentAt = null;
        }
      }

      const nextItems = items.map((entry) =>
        entry.id === target.id
          ? {
              ...entry,
              reminderTargetISO: nextReminderTargetISO,
              cloudTaskName: nextCloudTaskName,
              reminderSentAt: nextReminderSentAt,
              updatedAt: nowISO,
            }
          : entry,
      );

      await userRef.set(
        {
          agendaItems: nextItems,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      return res.status(200).json({
        ok: true,
        delivered: true,
        ...(repeating ? { nextReminderTargetISO, chainedTask: Boolean(nextCloudTaskName) } : {}),
      });
    }

    if (sendResult.blocked) {
      await Promise.all([
        subRef.update({ enabled: false, updatedAt: nowISO }).catch(() => {}),
        userRef.set({ telegram: { enabled: false } }, { merge: true }).catch(() => {}),
      ]);
      return res.status(200).json({ ok: true, skipped: 'user-blocked-bot' });
    }

    // Return 502 so Cloud Tasks can retry transient Telegram API errors cleanly
    console.error(`Agenda Telegram delivery failed for uid=${uid}, item=${itemId}:`, sendResult.description);
    return res.status(502).json({ error: 'Upstream Telegram delivery failed.' });
  } catch (err) {
    console.error('Agenda deliver error:', err);
    return res.status(500).json({ error: 'Agenda delivery failed.' });
  }
}
