import { randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  DEFAULT_REMINDER_OFFSETS_LIST,
  escapeTelegramHtml,
  isValidTimeZone,
  normalizeReminderOffsets,
} from '../../src/domain/reminders.js';
import { BOT_COMMANDS } from '../../src/domain/telegramBot.js';
import {
  getAdminDb,
  getAppBaseUrl,
  verifyFirebaseBearerToken,
  type StoredTelegramSubscription,
} from '../_lib/firebaseAdmin.js';
import { sendTelegramMessage, setTelegramBotCommands } from '../_lib/telegramClient.js';

const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;
const ACTION_COOLDOWN_MS = 30 * 1000;
const VALID_TOKEN_PATTERN = /^[A-Za-z0-9_-]{12,64}$/;

interface ManageBody {
  action?: 'create-link' | 'update-settings' | 'test' | 'disconnect';
  enabled?: boolean;
  timezone?: string;
  reminderHour?: number;
  reminderOffsets?: number[];
  includeOverdue?: boolean;
}

function clampHour(raw: unknown, fallback = 9): number {
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 0 || num > 23) return fallback;
  return num;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const verifiedUser = await verifyFirebaseBearerToken(req);
    if (!verifiedUser) {
      return res.status(401).json({ error: 'Unauthorized. Please sign in again.' });
    }

    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as ManageBody;
    const db = getAdminDb();
    const subRef = db.collection('telegramSubscriptions').doc(verifiedUser.uid);
    const userRef = db.collection('users').doc(verifiedUser.uid);

    switch (body.action) {
      case 'create-link': {
        const botUsername = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '');
        if (!botUsername || !process.env.TELEGRAM_BOT_TOKEN?.trim()) {
          return res.status(503).json({
            error:
              'Telegram bot is not configured yet. Set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME in Vercel Environment Variables.',
          });
        }

        const now = Date.now();
        const rateLimitRef = db.collection('telegramLinkTokens').doc(`__rate_${verifiedUser.uid}`);
        const rateLimitSnap = await rateLimitRef.get();
        const rateData = rateLimitSnap.exists
          ? (rateLimitSnap.data() as { lastCreatedAtMs?: number; activeToken?: string })
          : null;

        if (
          rateData &&
          typeof rateData.lastCreatedAtMs === 'number' &&
          now - rateData.lastCreatedAtMs < ACTION_COOLDOWN_MS
        ) {
          return res.status(429).json({
            error: 'Please wait a moment before generating another Telegram connection link.',
          });
        }

        if (
          rateData?.activeToken &&
          !rateData.activeToken.startsWith('__') &&
          VALID_TOKEN_PATTERN.test(rateData.activeToken)
        ) {
          await db
            .collection('telegramLinkTokens')
            .doc(rateData.activeToken)
            .delete()
            .catch(() => {});
        }

        const token = randomBytes(18).toString('base64url');
        const expiresAtMs = now + LINK_TOKEN_TTL_MS;
        const expiresAt = new Date(expiresAtMs).toISOString();
        const expiresAtTimestamp = Timestamp.fromMillis(expiresAtMs);
        const timezone = isValidTimeZone(body.timezone ?? '') ? body.timezone! : 'UTC';
        const reminderHour = clampHour(body.reminderHour, 9);
        const reminderOffsets = normalizeReminderOffsets(
          body.reminderOffsets ?? DEFAULT_REMINDER_OFFSETS_LIST,
        );
        const includeOverdue = body.includeOverdue ?? true;

        await Promise.all([
          db.collection('telegramLinkTokens').doc(token).set({
            uid: verifiedUser.uid,
            email: verifiedUser.email,
            timezone,
            reminderHour,
            reminderOffsets,
            includeOverdue,
            createdAt: new Date(now).toISOString(),
            expiresAtMs,
            expiresAt: expiresAtTimestamp,
          }),
          rateLimitRef.set({
            uid: verifiedUser.uid,
            activeToken: token,
            lastCreatedAtMs: now,
            expiresAt: expiresAtTimestamp,
          }),
        ]);

        return res.status(200).json({
          ok: true,
          botUsername,
          deepLink: `https://t.me/${botUsername}?start=${token}`,
          expiresAt,
        });
      }

      case 'update-settings': {
        const subSnap = await subRef.get();
        if (!subSnap.exists) {
          return res.status(404).json({ error: 'Telegram is not connected to this account.' });
        }

        const current = subSnap.data() as StoredTelegramSubscription;
        const nextEnabled = typeof body.enabled === 'boolean' ? body.enabled : current.enabled;
        const nextTimezone =
          typeof body.timezone === 'string' && isValidTimeZone(body.timezone)
            ? body.timezone
            : current.timezone;
        const nextHour = clampHour(body.reminderHour, current.reminderHour);
        const nextOffsets =
          body.reminderOffsets !== undefined
            ? normalizeReminderOffsets(body.reminderOffsets)
            : current.reminderOffsets;
        const nextIncludeOverdue =
          typeof body.includeOverdue === 'boolean'
            ? body.includeOverdue
            : current.includeOverdue;
        const updatedAt = new Date().toISOString();

        const publicView = {
          connected: true,
          username: current.username,
          firstName: current.firstName,
          enabled: nextEnabled,
          timezone: nextTimezone,
          reminderHour: nextHour,
          reminderOffsets: nextOffsets,
          includeOverdue: nextIncludeOverdue,
          linkedAt: current.linkedAt,
        };

        await Promise.all([
          subRef.update({
            enabled: nextEnabled,
            timezone: nextTimezone,
            reminderHour: nextHour,
            reminderOffsets: nextOffsets,
            includeOverdue: nextIncludeOverdue,
            updatedAt,
          }),
          userRef.set({ telegram: publicView }, { merge: true }),
        ]);

        return res.status(200).json({ ok: true, telegram: publicView });
      }

      case 'test': {
        const subSnap = await subRef.get();
        if (!subSnap.exists) {
          return res.status(404).json({ error: 'Telegram is not connected yet.' });
        }
        const sub = subSnap.data() as StoredTelegramSubscription;
        const nowMs = Date.now();
        if (
          typeof sub.lastTestSentAtMs === 'number' &&
          nowMs - sub.lastTestSentAtMs < ACTION_COOLDOWN_MS
        ) {
          return res.status(429).json({
            error: 'Please wait 30 seconds before sending another test notification.',
          });
        }
        const offsetsLabel = sub.reminderOffsets
          .map((d) => (d === 0 ? 'Due today' : `${d}d before`))
          .join(', ');
        const baseUrl = getAppBaseUrl(req);
        const linkLine = baseUrl ? `\n<a href="${escapeTelegramHtml(baseUrl)}">Open Sked</a>` : '';

        // Refresh Telegram slash-command menu for already-connected users
        void setTelegramBotCommands(BOT_COMMANDS);

        const result = await sendTelegramMessage(
          sub.chatId,
          [
            '<b>✅ Sked Test Notification</b>',
            '',
            `Hi ${escapeTelegramHtml(sub.firstName || verifiedUser.name)}! Your Telegram bot and deadline alerts are active.`,
            `• Schedule: <b>${escapeTelegramHtml(offsetsLabel)}</b>${sub.includeOverdue ? ' + Overdue' : ''}`,
            `• Timezone: <code>${escapeTelegramHtml(sub.timezone)}</code>`,
            linkLine,
          ]
            .filter(Boolean)
            .join('\n'),
          {
            inline_keyboard: [
              [
                { text: '📋 Browse Tasks', callback_data: 'wl' },
                { text: '📅 Today', callback_data: 'to' },
                { text: '📊 Summary', callback_data: 'sm' },
              ],
            ],
          },
        );

        if (!result.ok) {
          return res.status(502).json({
            error: result.blocked
              ? 'You blocked this Telegram bot. Unblock it in Telegram and try again.'
              : 'Could not deliver test message to Telegram. Please try again later.',
          });
        }

        await subRef.update({ lastTestSentAtMs: nowMs }).catch(() => {});
        return res.status(200).json({ ok: true });
      }

      case 'disconnect': {
        await Promise.all([
          subRef.delete().catch(() => {}),
          userRef.set({ telegram: FieldValue.delete() }, { merge: true }).catch(() => {}),
        ]);
        return res.status(200).json({ ok: true });
      }

      default:
        return res.status(400).json({ error: 'Invalid action.' });
    }
  } catch (err) {
    console.error('Telegram manage error:', err);
    return res.status(500).json({
      error: 'An unexpected server error occurred. Please try again.',
    });
  }
}
