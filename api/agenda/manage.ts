import { randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import {
  computeNextAgendaReminder,
  isRepeatingAgendaItem,
  isValidISODateString,
  MAX_AGENDA_ITEMS,
  normalizeAgendaRecurrence,
  normalizeAgendaReminderOffset,
  sanitizeAgendaItems,
  sanitizeCompletedDates,
  sortAgendaItems,
  toggleAgendaItemCompletion,
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
  occurrenceDate?: string;
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
        const recurrence = normalizeAgendaRecurrence(draft.recurrence ?? previous?.recurrence);
        const recurrenceEndDate =
          recurrence !== 'none' &&
          isValidISODateString(draft.recurrenceEndDate) &&
          draft.recurrenceEndDate >= draft.date
            ? draft.recurrenceEndDate
            : null;
        const completedDates =
          recurrence !== 'none' ? sanitizeCompletedDates(previous?.completedDates) : [];
        const isDone =
          recurrence !== 'none' ? false : Boolean(draft.isDone ?? previous?.isDone ?? false);

        const nextReminder = computeNextAgendaReminder({
          date: draft.date,
          time,
          isDone,
          recurrence,
          recurrenceEndDate,
          completedDates,
          reminderOffsetMinutes,
          timezone,
          defaultReminderHour: sub?.reminderHour ?? 9,
        });
        const reminderTargetISO = nextReminder?.reminderTargetISO ?? null;

        const scheduleChanged =
          !previous ||
          previous.reminderTargetISO !== reminderTargetISO ||
          previous.isDone !== isDone ||
          previous.reminderOffsetMinutes !== reminderOffsetMinutes ||
          normalizeAgendaRecurrence(previous.recurrence) !== recurrence ||
          (previous.recurrenceEndDate ?? null) !== recurrenceEndDate;

        let cloudTaskName: string | null = previous?.cloudTaskName ?? null;
        const reminderSentAt: string | null = scheduleChanged ? null : (previous?.reminderSentAt ?? null);
        let warning: string | undefined;

        // Cancel previous pending Cloud Task whenever schedule changes, completed, or alert disabled
        if (
          previous?.cloudTaskName &&
          (scheduleChanged || isDone || reminderOffsetMinutes === null || !reminderTargetISO)
        ) {
          await cancelAgendaCloudTask(previous.cloudTaskName);
          cloudTaskName = null;
        }

        // Schedule exact-time Google Cloud Task for the next upcoming alert
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
          ...(recurrence !== 'none' ? { recurrence } : {}),
          ...(recurrenceEndDate ? { recurrenceEndDate } : {}),
          ...(completedDates.length > 0 ? { completedDates } : {}),
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

        const nowISO = new Date().toISOString();
        const occurrenceDate =
          typeof body.occurrenceDate === 'string' && isValidISODateString(body.occurrenceDate)
            ? body.occurrenceDate
            : undefined;

        const toggled = toggleAgendaItemCompletion(target, occurrenceDate, nowISO);
        let cloudTaskName = target.cloudTaskName ?? null;
        let reminderTargetISO = target.reminderTargetISO ?? null;
        let reminderSentAt = target.reminderSentAt ?? null;
        let warning: string | undefined;

        if (isRepeatingAgendaItem(toggled)) {
          const nextReminder = computeNextAgendaReminder({
            date: toggled.date,
            time: toggled.time,
            recurrence: toggled.recurrence,
            recurrenceEndDate: toggled.recurrenceEndDate,
            completedDates: toggled.completedDates,
            reminderOffsetMinutes: toggled.reminderOffsetMinutes,
            timezone: toggled.timezone,
            defaultReminderHour: sub?.reminderHour ?? 9,
          });
          const nextTargetISO = nextReminder?.reminderTargetISO ?? null;
          const targetChanged = nextTargetISO !== reminderTargetISO;

          if (cloudTaskName && (targetChanged || !nextTargetISO)) {
            await cancelAgendaCloudTask(cloudTaskName);
            cloudTaskName = null;
          }

          reminderTargetISO = nextTargetISO;
          if (targetChanged) {
            reminderSentAt = null;
          }

          if (reminderTargetISO && telegramActive && !cloudTaskName) {
            const scheduled = await scheduleAgendaCloudTask({
              uid: verifiedUser.uid,
              itemId: toggled.id,
              reminderTargetISO,
              baseUrl,
            });
            cloudTaskName = scheduled.taskName;
            if (!scheduled.ok) warning = scheduled.reason;
          }
        } else {
          if (toggled.isDone && cloudTaskName) {
            await cancelAgendaCloudTask(cloudTaskName);
            cloudTaskName = null;
          } else if (
            !toggled.isDone &&
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
        }

        const updatedItem: AgendaItem = {
          ...toggled,
          reminderTargetISO,
          reminderSentAt,
          cloudTaskName,
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
