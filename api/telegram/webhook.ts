import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import {
  collectUpcomingDeadlines,
  escapeTelegramHtml,
  formatTelegramUpcomingMessage,
  getLocalDatePartsInTimezone,
} from '../../src/domain/reminders.js';
import {
  extractUserWorkspaces,
  getAdminDb,
  getAppBaseUrl,
  type StoredTelegramSubscription,
} from '../_lib/firebaseAdmin.js';
import { sendTelegramMessage } from '../_lib/telegramClient.js';

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: {
      id: number;
    };
    from?: {
      username?: string;
      first_name?: string;
    };
  };
}

interface StoredLinkToken {
  uid: string;
  email: string;
  timezone: string;
  reminderHour: number;
  reminderOffsets: number[];
  includeOverdue: boolean;
  expiresAtMs: number;
}

function safeCompareSecret(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
  const providedSecret = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;

  if (!safeCompareSecret(providedSecret, webhookSecret)) {
    return res.status(401).json({ error: 'Invalid Telegram webhook secret.' });
  }

  const update = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as TelegramUpdate;
  const chatId = update.message?.chat?.id;
  const rawText = update.message?.text?.trim();

  if (!chatId || !rawText) {
    return res.status(200).json({ ok: true });
  }

  const chatIdStr = String(chatId);
  const username = update.message?.from?.username ?? null;
  const firstName = update.message?.from?.first_name ?? null;
  const db = getAdminDb();
  const baseUrl = getAppBaseUrl(req);

  try {
    // 1. Deep-link connection: /start <token>
    if (rawText.startsWith('/start')) {
      const parts = rawText.split(/\s+/);
      const token = parts[1]?.trim();

      if (!token) {
        await sendTelegramMessage(
          chatIdStr,
          [
            '<b>👋 Welcome to Gantt Deadline Alerts</b>',
            '',
            'To connect your account, open <b>Settings → Telegram Deadline Alerts</b> in Gantt and click <b>Connect Telegram</b>.',
            baseUrl ? `\n<a href="${baseUrl}">Open Gantt</a>` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        );
        return res.status(200).json({ ok: true });
      }

      const tokenRef = db.collection('telegramLinkTokens').doc(token);
      const tokenSnap = await tokenRef.get();

      if (!tokenSnap.exists) {
        await sendTelegramMessage(
          chatIdStr,
          '⚠️ This connection link is invalid or was already used. Please generate a fresh link from <b>Settings → Telegram</b> in Gantt.',
        );
        return res.status(200).json({ ok: true });
      }

      const tokenData = tokenSnap.data() as StoredLinkToken;
      await tokenRef.delete().catch(() => {});

      if (Date.now() > tokenData.expiresAtMs) {
        await sendTelegramMessage(
          chatIdStr,
          '⏰ This connection link expired (links are valid for 15 minutes). Please click <b>Connect Telegram</b> again in Gantt Settings.',
        );
        return res.status(200).json({ ok: true });
      }

      const nowISO = new Date().toISOString();
      const subscription: StoredTelegramSubscription = {
        uid: tokenData.uid,
        chatId: chatIdStr,
        username,
        firstName,
        enabled: true,
        timezone: tokenData.timezone || 'UTC',
        reminderHour: tokenData.reminderHour ?? 9,
        reminderOffsets: tokenData.reminderOffsets ?? [5, 3, 1, 0],
        includeOverdue: tokenData.includeOverdue ?? true,
        linkedAt: nowISO,
        updatedAt: nowISO,
        sentReminders: {},
      };

      const publicView = {
        connected: true,
        username,
        firstName,
        enabled: true,
        timezone: subscription.timezone,
        reminderHour: subscription.reminderHour,
        reminderOffsets: subscription.reminderOffsets,
        includeOverdue: subscription.includeOverdue,
        linkedAt: nowISO,
      };

      await Promise.all([
        db.collection('telegramSubscriptions').doc(tokenData.uid).set(subscription),
        db.collection('users').doc(tokenData.uid).set({ telegram: publicView }, { merge: true }),
      ]);

      const offsetsText = subscription.reminderOffsets
        .map((d) => (d === 0 ? 'Due today' : `${d}d before`))
        .join(', ');

      await sendTelegramMessage(
        chatIdStr,
        [
          `<b>✅ Connected to Gantt!</b>`,
          '',
          `Hi ${escapeTelegramHtml(firstName || username || 'there')} — you'll now receive accurate deadline alerts:`,
          `• Offsets: <b>${escapeTelegramHtml(offsetsText)}</b>`,
          `• Timezone: <code>${escapeTelegramHtml(subscription.timezone)}</code>`,
          '',
          'Commands:',
          '• /upcoming — view open deadlines in the next 14 days',
          '• /pause — pause deadline alerts',
          '• /resume — resume deadline alerts',
          '• /stop — disconnect this Telegram chat',
        ].join('\n'),
      );

      return res.status(200).json({ ok: true });
    }

    // Look up existing linked subscription for chat commands
    const subQuery = await db
      .collection('telegramSubscriptions')
      .where('chatId', '==', chatIdStr)
      .limit(1)
      .get();

    const subDoc = subQuery.docs[0];
    if (!subDoc) {
      await sendTelegramMessage(
        chatIdStr,
        'Your Telegram chat is not connected to a Gantt account yet. Open <b>Settings → Telegram</b> in Gantt to link it.',
      );
      return res.status(200).json({ ok: true });
    }

    const sub = subDoc.data() as StoredTelegramSubscription;

    if (rawText.startsWith('/upcoming')) {
      const userSnap = await db.collection('users').doc(sub.uid).get();
      const workspaces = extractUserWorkspaces(userSnap.data());
      const { dateISO } = getLocalDatePartsInTimezone(new Date(), sub.timezone);
      const upcoming = collectUpcomingDeadlines(workspaces, dateISO, 14);
      const msg = formatTelegramUpcomingMessage(upcoming, dateISO, baseUrl);
      await sendTelegramMessage(chatIdStr, msg);
      return res.status(200).json({ ok: true });
    }

    if (rawText.startsWith('/pause')) {
      await Promise.all([
        subDoc.ref.update({ enabled: false, updatedAt: new Date().toISOString() }),
        db.collection('users').doc(sub.uid).set({ telegram: { enabled: false } }, { merge: true }),
      ]);
      await sendTelegramMessage(
        chatIdStr,
        '⏸️ Deadline reminders paused. Send /resume anytime to turn them back on.',
      );
      return res.status(200).json({ ok: true });
    }

    if (rawText.startsWith('/resume')) {
      await Promise.all([
        subDoc.ref.update({ enabled: true, updatedAt: new Date().toISOString() }),
        db.collection('users').doc(sub.uid).set({ telegram: { enabled: true } }, { merge: true }),
      ]);
      await sendTelegramMessage(chatIdStr, '▶️ Deadline reminders resumed!');
      return res.status(200).json({ ok: true });
    }

    if (rawText.startsWith('/stop')) {
      await Promise.all([
        subDoc.ref.delete(),
        db.collection('users').doc(sub.uid).set({ telegram: FieldValue.delete() }, { merge: true }),
      ]);
      await sendTelegramMessage(
        chatIdStr,
        '🔌 Disconnected from Gantt. You will no longer receive deadline notifications.',
      );
      return res.status(200).json({ ok: true });
    }

    await sendTelegramMessage(
      chatIdStr,
      [
        '<b>Gantt Bot Commands</b>',
        '• /upcoming — list deadlines in the next 14 days',
        '• /pause — pause notifications',
        '• /resume — resume notifications',
        '• /stop — unlink your Telegram account',
      ].join('\n'),
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return res.status(200).json({ ok: false });
  }
}
