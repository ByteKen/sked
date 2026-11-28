import { randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import {
  computeReminderTargetISO,
  MAX_AGENDA_ITEMS,
  normalizeAgendaReminderOffset,
  sanitizeAgendaItems,
  sortAgendaItems,
  validateAgendaDraft,
} from '../../src/domain/agenda.js';
import { isValidTimeZone } from '../../src/domain/reminders.js';
import type { AgendaItem, AgendaItemDraft } from '../../src/types/agenda.js';
import { cancelAgendaCloudTask, scheduleAgendaCloudTask } from '../_lib/cloudTasks.js';
import {
  getAdminDb,
  getAppBaseUrl,
  verifyFirebaseBearerToken,
  type StoredTelegramSubscription,
} from '../_lib/firebaseAdmin.js';

interface AgendaManageBody {
  action?: 'upsert' | 'toggle-done' | 'delete';
  item?: AgendaItemDraft;
  itemId?: string;
}

function generateAgendaId(): string {
  return `ag_${randomBytes(8).toString('hex')}`;
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

    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as AgendaManageBody;
    const db = getAdminDb();
    const userRef = db.collection('users').doc(verifiedUser.uid);
    const subRef = db.collection('telegramSubscriptions').doc(verifiedUser.uid);
    const baseUrl = getAppBaseUrl(req);

    const [userSnap, subSnap] = await Promise.all([userRef.get(), subRef.get()]);
    const existingItems = sanitizeAgendaItems(userSnap.data()?.agendaItems);
    const sub = subSnap.exists ? (subSnap.data() as StoredTelegramSubscription) : null;
    const telegramActive = Boolean(sub && sub.enabled && sub.chatId);

    switch (body.action) {
      case 'upsert': {
        const draft = body.item;
        if (!draft || typeof draft !== 'object') {
          return res.status(400).json({ error: 'Missing agenda item payload.' });
        }

        const validation = validateAgendaDraft(draft);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error || 'Invalid agenda item.' });
        }

        const existingIndex = draft.id
          ? existingItems.findIndex((entry) => entry.id === draft.id)
          : -1;
        const previous = existingIndex >= 0 ? existingItems[existingIndex]! : null;

        if (!previous && existingItems.length >= MAX_AGENDA_ITEMS) {
          return res.status(400).json({
            error: `You can store up to ${MAX_AGENDA_ITEMS} personal agenda items.`,
          });
        }

        const nowISO = new Date().toISOString();
        const id = previous?.id ?? generateAgendaId();
        const timezone =
          draft.timezone && isValidTimeZone(draft.timezone)
            ? draft.timezone
            : sub?.timezone && isValidTimeZone(sub.timezone)
              ? sub.timezone
              : previous?.timezone || 'UTC';
        const reminderOffsetMinutes = normalizeAgendaReminderOffset(draft.reminderOffsetMinutes);
        const time = draft.time && /^\d{2}:\d{2}$/.test(draft.time) ? draft.time : null;
        const isDone = Boolean(draft.isDone ?? previous?.isDone ?? false);

        const reminderTargetISO = computeReminderTargetISO({
          date: draft.date,
          time,
          reminderOffsetMinutes,
          timezone,
          defaultReminderHour: sub?.reminderHour ?? 9,
        });

        const scheduleChanged =
          !previous ||
          previous.reminderTargetISO !== reminderTargetISO ||
          previous.isDone !== isDone ||
          previous.reminderOffsetMinutes !== reminderOffsetMinutes;

        let cloudTaskName: string | null = previous?.cloudTaskName ?? null;
        const reminderSentAt: string | null = scheduleChanged ? null : (previous?.reminderSentAt ?? null);
        let warning: string | undefined;

        // Cancel previous pending Cloud Task whenever schedule changes, completed, or alert disabled
        if (previous?.cloudTaskName && (scheduleChanged || isDone || reminderOffsetMinutes === null)) {
          await cancelAgendaCloudTask(previous.cloudTaskName);
          cloudTaskName = null;
        }

        // Schedule exact-time Google Cloud Task when open, alert enabled, and Telegram connected
        if (!isDone && reminderTargetISO && telegramActive && (scheduleChanged || !cloudTaskName)) {
          const scheduled = await scheduleAgendaCloudTask({
            uid: verifiedUser.uid,
            itemId: id,
            reminderTargetISO,
            baseUrl,
          });
          cloudTaskName = scheduled.taskName;
          if (!scheduled.ok) {
            warning = scheduled.reason;
          }
        }

        const trimmedNote = draft.note?.trim().slice(0, 500) || '';
        const savedItem: AgendaItem = {
          id,
          title: draft.title.trim().slice(0, 100),
          date: draft.date,
          time,
          ...(trimmedNote ? { note: trimmedNote } : {}),
          isDone,
          reminderOffsetMinutes,
          timezone,
          reminderTargetISO,
          cloudTaskName,
          reminderSentAt,
          createdAt: previous?.createdAt ?? nowISO,
          updatedAt: nowISO,
        };

        const nextItems = sortAgendaItems(
          previous
            ? existingItems.map((entry) => (entry.id === id ? savedItem : entry))
            : [...existingItems, savedItem],
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
          item: savedItem,
          items: nextItems,
          ...(warning ? { warning } : {}),
        });
      }

      case 'toggle-done': {
        const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : '';
        const target = existingItems.find((entry) => entry.id === itemId);
        if (!target) {
          return res.status(404).json({ error: 'Agenda item not found.' });
        }

        const nextDone = !target.isDone;
        let cloudTaskName = target.cloudTaskName ?? null;
        let warning: string | undefined;

        if (nextDone && cloudTaskName) {
          await cancelAgendaCloudTask(cloudTaskName);
          cloudTaskName = null;
        } else if (
          !nextDone &&
          target.reminderTargetISO &&
          !target.reminderSentAt &&
          telegramActive &&
          !cloudTaskName
        ) {
          const scheduled = await scheduleAgendaCloudTask({
            uid: verifiedUser.uid,
            itemId: target.id,
            reminderTargetISO: target.reminderTargetISO,
            baseUrl,
          });
          cloudTaskName = scheduled.taskName;
          if (!scheduled.ok) warning = scheduled.reason;
        }

        const updatedItem: AgendaItem = {
          ...target,
          isDone: nextDone,
          cloudTaskName,
          updatedAt: new Date().toISOString(),
        };

        const nextItems = sortAgendaItems(
          existingItems.map((entry) => (entry.id === target.id ? updatedItem : entry)),
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
          item: updatedItem,
          items: nextItems,
          ...(warning ? { warning } : {}),
        });
      }

      case 'delete': {
        const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : '';
        const target = existingItems.find((entry) => entry.id === itemId);
        if (!target) {
          return res.status(200).json({ ok: true, items: existingItems });
        }

        if (target.cloudTaskName) {
          await cancelAgendaCloudTask(target.cloudTaskName);
        }

        const nextItems = existingItems.filter((entry) => entry.id !== target.id);
        await userRef.set(
          {
            agendaItems: nextItems,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        return res.status(200).json({ ok: true, items: nextItems });
      }

      default:
        return res.status(400).json({ error: 'Invalid agenda action.' });
    }
  } catch (err) {
    console.error('Agenda manage error:', err);
    return res.status(500).json({ error: 'Failed to update agenda reminder.' });
  }
}
