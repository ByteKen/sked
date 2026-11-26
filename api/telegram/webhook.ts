import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { escapeTelegramHtml, getLocalDatePartsInTimezone } from '../../src/domain/reminders.js';
import {
  BOT_COMMANDS,
  buildHelpMessage,
  buildSummaryView,
  buildTaskDetailView,
  buildTaskListView,
  buildTodayView,
  buildUpcomingView,
  buildWorkspacesView,
  parseBotCallback,
  setBotTaskProgress,
  toggleBotTaskDone,
  type BotViewPayload,
  type TelegramWorkspaceBundle,
} from '../../src/domain/telegramBot.js';
import {
  extractUserWorkspaces,
  getAdminDb,
  getAppBaseUrl,
  saveWorkspaceTasksFromBot,
  type StoredTelegramSubscription,
} from '../_lib/firebaseAdmin.js';
import {
  answerTelegramCallbackQuery,
  editTelegramMessageText,
  sendTelegramMessage,
  setTelegramBotCommands,
} from '../_lib/telegramClient.js';

interface TelegramMessage {
  message_id?: number;
  text?: string;
  chat?: {
    id: number;
  };
  from?: {
    username?: string;
    first_name?: string;
  };
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  from?: {
    username?: string;
    first_name?: string;
  };
  message?: TelegramMessage;
}

interface TelegramUpdate {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
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

/**
 * Normalizes `/tasks@MyGanttBot` -> `/tasks` so group/autocomplete commands match cleanly.
 */
function parseSlashCommand(rawText: string): { command: string; arg: string } {
  const trimmed = rawText.trim();
  const spaceIdx = trimmed.indexOf(' ');
  const head = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const arg = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
  const atIdx = head.indexOf('@');
  const command = (atIdx === -1 ? head : head.slice(0, atIdx)).toLowerCase();
  return { command, arg };
}

async function loadUserWorkspaces(
  db: Firestore,
  uid: string,
): Promise<TelegramWorkspaceBundle[]> {
  const userSnap = await db.collection('users').doc(uid).get();
  return extractUserWorkspaces(userSnap.data());
}

async function renderViewToChat(
  chatId: string,
  view: BotViewPayload,
  messageId?: number,
): Promise<void> {
  if (typeof messageId === 'number') {
    const edited = await editTelegramMessageText(chatId, messageId, view.text, view.replyMarkup);
    if (edited.ok || edited.notModified) return;
  }
  await sendTelegramMessage(chatId, view.text, view.replyMarkup);
}

async function handleCallbackQuery(
  db: Firestore,
  cb: TelegramCallbackQuery,
  baseUrl: string,
): Promise<void> {
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;

  if (!chatId) {
    await answerTelegramCallbackQuery(cb.id);
    return;
  }

  const chatIdStr = String(chatId);
  const parsed = parseBotCallback(cb.data);

  if (parsed.type === 'noop') {
    await answerTelegramCallbackQuery(cb.id);
    return;
  }

  const subQuery = await db
    .collection('telegramSubscriptions')
    .where('chatId', '==', chatIdStr)
    .limit(1)
    .get();

  const subDoc = subQuery.docs[0];
  if (!subDoc) {
    await answerTelegramCallbackQuery(
      cb.id,
      'Your Telegram chat is not linked to Gantt. Connect from Settings -> Bot & Alerts.',
      true,
    );
    return;
  }

  const sub = subDoc.data() as StoredTelegramSubscription;
  const { dateISO } = getLocalDatePartsInTimezone(new Date(), sub.timezone);
  const workspaces = await loadUserWorkspaces(db, sub.uid);

  switch (parsed.type) {
    case 'workspaces': {
      const view = buildWorkspacesView(workspaces, dateISO, baseUrl);
      await renderViewToChat(chatIdStr, view, messageId);
      await answerTelegramCallbackQuery(cb.id);
      return;
    }

    case 'today': {
      const view = buildTodayView(workspaces, dateISO, baseUrl);
      await renderViewToChat(chatIdStr, view, messageId);
      await answerTelegramCallbackQuery(cb.id);
      return;
    }

    case 'upcoming': {
      const view = buildUpcomingView(workspaces, dateISO, baseUrl);
      await renderViewToChat(chatIdStr, view, messageId);
      await answerTelegramCallbackQuery(cb.id);
      return;
    }

    case 'summary': {
      const view = buildSummaryView(workspaces, dateISO, baseUrl);
      await renderViewToChat(chatIdStr, view, messageId);
      await answerTelegramCallbackQuery(cb.id);
      return;
    }

    case 'task_list': {
      const ws = workspaces.find((w) => w.workspaceId === parsed.workspaceId);
      if (!ws) {
        await renderViewToChat(
          chatIdStr,
          buildWorkspacesView(workspaces, dateISO, baseUrl),
          messageId,
        );
        await answerTelegramCallbackQuery(cb.id, 'Workspace not found.');
        return;
      }
      const view = buildTaskListView(ws, parsed.filter, parsed.page, dateISO, baseUrl);
      await renderViewToChat(chatIdStr, view, messageId);
      await answerTelegramCallbackQuery(cb.id);
      return;
    }

    case 'task_detail': {
      const ws = workspaces.find((w) => w.workspaceId === parsed.workspaceId);
      if (!ws) {
        await renderViewToChat(
          chatIdStr,
          buildWorkspacesView(workspaces, dateISO, baseUrl),
          messageId,
        );
        await answerTelegramCallbackQuery(cb.id, 'Workspace not found.');
        return;
      }
      const view = buildTaskDetailView(
        ws,
        parsed.taskId,
        parsed.filter,
        parsed.page,
        dateISO,
        baseUrl,
      );
      await renderViewToChat(chatIdStr, view, messageId);
      await answerTelegramCallbackQuery(cb.id);
      return;
    }

    case 'toggle_done': {
      const ws = workspaces.find((w) => w.workspaceId === parsed.workspaceId);
      if (!ws) {
        await answerTelegramCallbackQuery(cb.id, 'Workspace no longer exists.', true);
        return;
      }
      const { tasks: nextTasks, updatedTask, nextDone } = toggleBotTaskDone(
        ws.tasks,
        parsed.taskId,
      );
      if (!updatedTask) {
        await answerTelegramCallbackQuery(cb.id, 'Task not found.', true);
        return;
      }
      const savedTasks = await saveWorkspaceTasksFromBot(db, sub.uid, ws, nextTasks);
      const updatedWs: TelegramWorkspaceBundle = { ...ws, tasks: savedTasks };
      const view = buildTaskDetailView(
        updatedWs,
        parsed.taskId,
        parsed.filter,
        parsed.page,
        dateISO,
        baseUrl,
      );
      await renderViewToChat(chatIdStr, view, messageId);
      await answerTelegramCallbackQuery(
        cb.id,
        nextDone
          ? `✅ Marked "${updatedTask.name}" done`
          : `↩️ Reopened "${updatedTask.name}"`,
      );
      return;
    }

    case 'set_progress': {
      const ws = workspaces.find((w) => w.workspaceId === parsed.workspaceId);
      if (!ws) {
        await answerTelegramCallbackQuery(cb.id, 'Workspace no longer exists.', true);
        return;
      }
      const { tasks: nextTasks, updatedTask } = setBotTaskProgress(
        ws.tasks,
        parsed.taskId,
        parsed.progress,
      );
      if (!updatedTask) {
        await answerTelegramCallbackQuery(cb.id, 'Task not found.', true);
        return;
      }
      const savedTasks = await saveWorkspaceTasksFromBot(db, sub.uid, ws, nextTasks);
      const updatedWs: TelegramWorkspaceBundle = { ...ws, tasks: savedTasks };
      const view = buildTaskDetailView(
        updatedWs,
        parsed.taskId,
        parsed.filter,
        parsed.page,
        dateISO,
        baseUrl,
      );
      await renderViewToChat(chatIdStr, view, messageId);
      await answerTelegramCallbackQuery(
        cb.id,
        `Updated "${updatedTask.name}" to ${updatedTask.progress}%`,
      );
      return;
    }

    case 'quick_done': {
      const ws = workspaces.find((w) => w.workspaceId === parsed.workspaceId);
      if (!ws) {
        await answerTelegramCallbackQuery(cb.id, 'Workspace no longer exists.', true);
        return;
      }
      const { tasks: nextTasks, updatedTask } = toggleBotTaskDone(ws.tasks, parsed.taskId, true);
      if (!updatedTask) {
        await answerTelegramCallbackQuery(cb.id, 'Task already removed.', true);
        return;
      }
      const savedTasks = await saveWorkspaceTasksFromBot(db, sub.uid, ws, nextTasks);
      const refreshedWorkspaces = workspaces.map((w) =>
        w.workspaceId === ws.workspaceId ? { ...w, tasks: savedTasks } : w,
      );

      if (parsed.source === 'today') {
        await renderViewToChat(
          chatIdStr,
          buildTodayView(refreshedWorkspaces, dateISO, baseUrl),
          messageId,
        );
      } else if (parsed.source === 'upcoming') {
        await renderViewToChat(
          chatIdStr,
          buildUpcomingView(refreshedWorkspaces, dateISO, baseUrl),
          messageId,
        );
      } else {
        // From a scheduled cron alert: show refreshed Today's Focus so user sees what's left
        await renderViewToChat(
          chatIdStr,
          buildTodayView(refreshedWorkspaces, dateISO, baseUrl),
          messageId,
        );
      }

      await answerTelegramCallbackQuery(cb.id, `✅ Completed "${updatedTask.name}"!`);
      return;
    }
  }
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
  const baseUrl = getAppBaseUrl(req);

  try {
    const db = getAdminDb();

    // 1. Handle inline keyboard button taps (`callback_query`)
    if (update.callback_query) {
      await handleCallbackQuery(db, update.callback_query, baseUrl);
      return res.status(200).json({ ok: true });
    }

    const chatId = update.message?.chat?.id;
    const rawText = update.message?.text?.trim();

    if (!chatId || !rawText) {
      return res.status(200).json({ ok: true });
    }

    const chatIdStr = String(chatId);
    const username = update.message?.from?.username ?? null;
    const firstName = update.message?.from?.first_name ?? null;
    const { command, arg } = parseSlashCommand(rawText);

    // 2. Deep-link connection: /start <token>
    if (command === '/start') {
      // Best-effort sync of slash-command autocomplete menu in Telegram
      void setTelegramBotCommands(BOT_COMMANDS);

      const token = arg.split(/\s+/)[0]?.trim();
      if (!token) {
        await sendTelegramMessage(
          chatIdStr,
          [
            '<b>👋 Welcome to Gantt Bot</b>',
            '',
            'To connect your account, open <b>Settings → Bot &amp; Alerts</b> in Gantt and click <b>Connect Telegram</b>.',
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
          '⚠️ This connection link is invalid or was already used. Please generate a fresh link from <b>Settings → Bot &amp; Alerts</b> in Gantt.',
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
          `Hi ${escapeTelegramHtml(firstName || username || 'there')} — your workspaces are now synced with Telegram:`,
          `• Alerts: <b>${escapeTelegramHtml(offsetsText)}</b>`,
          `• Timezone: <code>${escapeTelegramHtml(subscription.timezone)}</code>`,
          '',
          'Try /tasks to browse and mark items done, /today for urgent items, or /summary for overall progress.',
        ].join('\n'),
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

      return res.status(200).json({ ok: true });
    }

    // 3. Look up linked subscription for all interactive commands
    const subQuery = await db
      .collection('telegramSubscriptions')
      .where('chatId', '==', chatIdStr)
      .limit(1)
      .get();

    const subDoc = subQuery.docs[0];
    if (!subDoc) {
      await sendTelegramMessage(
        chatIdStr,
        'Your Telegram chat is not connected to a Gantt account yet. Open <b>Settings → Bot &amp; Alerts</b> in Gantt to link it.',
      );
      return res.status(200).json({ ok: true });
    }

    const sub = subDoc.data() as StoredTelegramSubscription;
    const { dateISO } = getLocalDatePartsInTimezone(new Date(), sub.timezone);

    if (command === '/tasks') {
      const workspaces = await loadUserWorkspaces(db, sub.uid);
      if (workspaces.length === 1) {
        const view = buildTaskListView(workspaces[0]!, 'active', 0, dateISO, baseUrl);
        await sendTelegramMessage(chatIdStr, view.text, view.replyMarkup);
      } else {
        const view = buildWorkspacesView(workspaces, dateISO, baseUrl);
        await sendTelegramMessage(chatIdStr, view.text, view.replyMarkup);
      }
      return res.status(200).json({ ok: true });
    }

    if (command === '/workspaces') {
      const workspaces = await loadUserWorkspaces(db, sub.uid);
      const view = buildWorkspacesView(workspaces, dateISO, baseUrl);
      await sendTelegramMessage(chatIdStr, view.text, view.replyMarkup);
      return res.status(200).json({ ok: true });
    }

    if (command === '/today') {
      const workspaces = await loadUserWorkspaces(db, sub.uid);
      const view = buildTodayView(workspaces, dateISO, baseUrl);
      await sendTelegramMessage(chatIdStr, view.text, view.replyMarkup);
      return res.status(200).json({ ok: true });
    }

    if (command === '/upcoming') {
      const workspaces = await loadUserWorkspaces(db, sub.uid);
      const view = buildUpcomingView(workspaces, dateISO, baseUrl);
      await sendTelegramMessage(chatIdStr, view.text, view.replyMarkup);
      return res.status(200).json({ ok: true });
    }

    if (command === '/summary') {
      const workspaces = await loadUserWorkspaces(db, sub.uid);
      const view = buildSummaryView(workspaces, dateISO, baseUrl);
      await sendTelegramMessage(chatIdStr, view.text, view.replyMarkup);
      return res.status(200).json({ ok: true });
    }

    if (command === '/pause') {
      await Promise.all([
        subDoc.ref.update({ enabled: false, updatedAt: new Date().toISOString() }),
        db.collection('users').doc(sub.uid).set({ telegram: { enabled: false } }, { merge: true }),
      ]);
      await sendTelegramMessage(
        chatIdStr,
        '⏸️ Deadline reminders paused. Send /resume anytime to turn them back on. You can still use /tasks and /summary anytime.',
      );
      return res.status(200).json({ ok: true });
    }

    if (command === '/resume') {
      await Promise.all([
        subDoc.ref.update({ enabled: true, updatedAt: new Date().toISOString() }),
        db.collection('users').doc(sub.uid).set({ telegram: { enabled: true } }, { merge: true }),
      ]);
      await sendTelegramMessage(chatIdStr, '▶️ Deadline reminders resumed!');
      return res.status(200).json({ ok: true });
    }

    if (command === '/stop') {
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

    void setTelegramBotCommands(BOT_COMMANDS);
    const help = buildHelpMessage();
    await sendTelegramMessage(chatIdStr, help.text, help.replyMarkup);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return res.status(200).json({ ok: false });
  }
}
