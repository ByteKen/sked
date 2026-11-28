import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { auth } from '@/config/firebase';
import {
  computeNextAgendaReminder,
  isRepeatingAgendaItem,
  isValidISODateString,
  normalizeAgendaRecurrence,
  sanitizeAgendaItems,
  sanitizeCompletedDates,
  sortAgendaItems,
  toggleAgendaItemCompletion,
} from '@/domain/agenda';
import {
  deleteAgendaItemViaApi,
  saveAgendaItemsInFirestore,
  toggleAgendaDoneViaApi,
  upsertAgendaItemViaApi,
} from '@/services/agendaService';
import { userDocumentSync } from '@/services/userDocumentSync';
import type { AgendaItem, AgendaItemDraft, TelegramNotificationConfig } from '@/types';

export interface AgendaMutationResult {
  ok: boolean;
  item?: AgendaItem;
  warning?: string;
  error?: string;
}

interface AgendaStoreState {
  items: AgendaItem[];
  telegramConfig: TelegramNotificationConfig | null;
  loading: boolean;
  unsubscribe: (() => void) | null;
  initAgenda: () => () => void;
  cleanup: () => void;
  saveItem: (draft: AgendaItemDraft) => Promise<AgendaMutationResult>;
  toggleDone: (itemId: string, occurrenceDate?: string) => Promise<AgendaMutationResult>;
  deleteItem: (itemId: string) => Promise<AgendaMutationResult>;
}

function generateLocalAgendaId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ag_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `ag_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export const useAgendaStore = create<AgendaStoreState>()(
  subscribeWithSelector((set, get) => ({
    items: [],
    telegramConfig: null,
    loading: true,
    unsubscribe: null,

    initAgenda: () => {
      const prevUnsub = get().unsubscribe;
      if (prevUnsub) prevUnsub();

      if (!auth.currentUser) {
        set({ items: [], telegramConfig: null, loading: false, unsubscribe: null });
        return () => {};
      }

      set({ loading: true });

      const unsubscribe = userDocumentSync.subscribe(
        (snapshot) => {
          if (!snapshot.exists || !snapshot.data) {
            set({ items: [], telegramConfig: null, loading: false });
            return;
          }
          const items = sanitizeAgendaItems(snapshot.data.agendaItems);
          const telegramConfig =
            (snapshot.data.telegram as TelegramNotificationConfig | undefined) ?? null;
          set({ items, telegramConfig, loading: false });
        },
        () => {
          set({ loading: false });
        },
      );

      set({ unsubscribe });
      return unsubscribe;
    },

    cleanup: () => {
      const { unsubscribe } = get();
      if (unsubscribe) unsubscribe();
      set({ items: [], telegramConfig: null, loading: true, unsubscribe: null });
    },

    saveItem: async (draft) => {
      const user = auth.currentUser;
      if (!user) return { ok: false, error: 'You must be signed in.' };

      const { items, telegramConfig } = get();
      const previous = draft.id ? items.find((entry) => entry.id === draft.id) : undefined;
      const telegramActive = Boolean(telegramConfig?.connected && telegramConfig?.enabled);
      const timezone = draft.timezone || telegramConfig?.timezone || getBrowserTimeZone();

      // Route through server API ONLY when scheduling a Cloud Task or canceling an existing one
      const needsCloudTaskSync = Boolean(
        previous?.cloudTaskName || (draft.reminderOffsetMinutes !== null && telegramActive),
      );

      if (needsCloudTaskSync) {
        try {
          const response = await upsertAgendaItemViaApi({ ...draft, timezone });
          set({ items: sanitizeAgendaItems(response.items) });
          return { ok: true, item: response.item, warning: response.warning };
        } catch (err) {
          console.warn('Cloud Tasks agenda API unavailable, falling back to Firestore save:', err);
          const fallbackWarning =
            err instanceof Error
              ? err.message
              : 'Saved to calendar, but Telegram reminder could not be scheduled.';
          const saved = await persistItemDirectly(user.uid, items, { ...draft, timezone }, previous, telegramConfig?.reminderHour ?? 9, (next) =>
            set({ items: next }),
          );
          return { ok: true, item: saved, warning: fallbackWarning };
        }
      }

      try {
        const saved = await persistItemDirectly(
          user.uid,
          items,
          { ...draft, timezone },
          previous,
          telegramConfig?.reminderHour ?? 9,
          (next) => set({ items: next }),
        );
        return { ok: true, item: saved };
      } catch (err) {
        console.error('Failed to save agenda item:', err);
        return { ok: false, error: 'Could not save agenda item. Please try again.' };
      }
    },

    toggleDone: async (itemId, occurrenceDate) => {
      const user = auth.currentUser;
      if (!user) return { ok: false, error: 'You must be signed in.' };

      const { items, telegramConfig } = get();
      const target = items.find((entry) => entry.id === itemId);
      if (!target) return { ok: false, error: 'Agenda item not found.' };

      const telegramActive = Boolean(telegramConfig?.connected && telegramConfig?.enabled);
      const repeating = isRepeatingAgendaItem(target);
      const needsCloudTaskSync = Boolean(
        target.cloudTaskName ||
          (repeating && target.reminderOffsetMinutes !== null && telegramActive) ||
          (target.isDone && target.reminderOffsetMinutes !== null && !target.reminderSentAt && telegramActive),
      );

      if (needsCloudTaskSync) {
        try {
          const response = await toggleAgendaDoneViaApi(itemId, occurrenceDate);
          set({ items: sanitizeAgendaItems(response.items) });
          return { ok: true, item: response.item, warning: response.warning };
        } catch (err) {
          console.warn('Agenda toggle API fallback to direct Firestore:', err);
        }
      }

      const nowISO = new Date().toISOString();
      const toggled = toggleAgendaItemCompletion(target, occurrenceDate, nowISO);
      const nextReminder = repeating
        ? computeNextAgendaReminder({
            date: toggled.date,
            time: toggled.time,
            recurrence: toggled.recurrence,
            recurrenceEndDate: toggled.recurrenceEndDate,
            completedDates: toggled.completedDates,
            reminderOffsetMinutes: toggled.reminderOffsetMinutes,
            timezone: toggled.timezone,
            defaultReminderHour: telegramConfig?.reminderHour ?? 9,
          })
        : null;

      const updatedItem: AgendaItem = {
        ...toggled,
        ...(repeating ? { reminderTargetISO: nextReminder?.reminderTargetISO ?? null } : {}),
        cloudTaskName: !repeating && toggled.isDone ? null : (target.cloudTaskName ?? null),
      };
      const nextItems = sortAgendaItems(
        items.map((entry) => (entry.id === itemId ? updatedItem : entry)),
      );
      set({ items: nextItems });
      try {
        await saveAgendaItemsInFirestore(user.uid, nextItems);
        return { ok: true, item: updatedItem };
      } catch (err) {
        console.error('Failed to toggle agenda item:', err);
        set({ items });
        return { ok: false, error: 'Could not update item status.' };
      }
    },

    deleteItem: async (itemId) => {
      const user = auth.currentUser;
      if (!user) return { ok: false, error: 'You must be signed in.' };

      const { items } = get();
      const target = items.find((entry) => entry.id === itemId);
      if (!target) return { ok: true };

      if (target.cloudTaskName) {
        try {
          const response = await deleteAgendaItemViaApi(itemId);
          set({ items: sanitizeAgendaItems(response.items) });
          return { ok: true };
        } catch (err) {
          console.warn('Agenda delete API fallback to direct Firestore:', err);
        }
      }

      const nextItems = items.filter((entry) => entry.id !== itemId);
      set({ items: nextItems });
      try {
        await saveAgendaItemsInFirestore(user.uid, nextItems);
        return { ok: true };
      } catch (err) {
        console.error('Failed to delete agenda item:', err);
        set({ items });
        return { ok: false, error: 'Could not delete agenda item.' };
      }
    },
  })),
);

async function persistItemDirectly(
  uid: string,
  currentItems: readonly AgendaItem[],
  draft: AgendaItemDraft & { timezone: string },
  previous: AgendaItem | undefined,
  defaultReminderHour: number,
  applyLocal: (items: AgendaItem[]) => void,
): Promise<AgendaItem> {
  const nowISO = new Date().toISOString();
  const id = previous?.id ?? generateLocalAgendaId();
  const trimmedNote = draft.note?.trim().slice(0, 500) || '';
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

  const reminderTargetISO =
    computeNextAgendaReminder({
      date: draft.date,
      time,
      isDone,
      recurrence,
      recurrenceEndDate,
      completedDates,
      reminderOffsetMinutes: draft.reminderOffsetMinutes,
      timezone: draft.timezone,
      defaultReminderHour,
    })?.reminderTargetISO ?? null;

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
    reminderOffsetMinutes: draft.reminderOffsetMinutes,
    timezone: draft.timezone,
    reminderTargetISO,
    cloudTaskName: null,
    reminderSentAt:
      previous && previous.reminderTargetISO === reminderTargetISO
        ? (previous.reminderSentAt ?? null)
        : null,
    createdAt: previous?.createdAt ?? nowISO,
    updatedAt: nowISO,
  };

  const nextItems = sortAgendaItems(
    previous
      ? currentItems.map((entry) => (entry.id === id ? savedItem : entry))
      : [...currentItems, savedItem],
  );
  applyLocal(nextItems);
  await saveAgendaItemsInFirestore(uid, nextItems);
  return savedItem;
}
