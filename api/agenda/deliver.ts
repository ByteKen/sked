import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { formatAgendaTelegramMessage, sanitizeAgendaItems } from '../../src/domain/agenda.js';
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

    if (!target || target.isDone || target.reminderSentAt || target.reminderOffsetMinutes === null) {
      return res.status(200).json({ ok: true, skipped: 'already-handled' });
    }

    // Idempotency guard: if the user rescheduled this item after this Cloud Task was queued, ignore stale task
    if (expectedTargetISO && target.reminderTargetISO && target.reminderTargetISO !== expectedTargetISO) {
      return res.status(200).json({ ok: true, skipped: 'stale-schedule' });
    }

    const baseUrl = getAppBaseUrl(req);
    const text = formatAgendaTelegramMessage(target, baseUrl);
    const sendResult = await sendTelegramMessage(sub.chatId, text, {
      inline_keyboard: [
        [
          { text: '✅ Mark Done', callback_data: `agd:${target.id}` },
          { text: '📅 Today', callback_data: 'to' },
        ],
      ],
    });

    const nowISO = new Date().toISOString();

    if (sendResult.ok) {
      const nextItems = items.map((entry) =>
        entry.id === target.id
          ? {
              ...entry,
              cloudTaskName: null,
              reminderSentAt: nowISO,
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

      return res.status(200).json({ ok: true, delivered: true });
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
