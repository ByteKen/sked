export type AgendaReminderOffset = 0 | 15 | 30 | 60;

export type AgendaRecurrenceFrequency =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'monthly'
  | 'yearly';

export interface AgendaItem {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD (series start date when repeating)
  time?: string | null; // Optional HH:mm (24h, e.g. '19:00')
  note?: string;
  isDone: boolean;
  recurrence?: AgendaRecurrenceFrequency; // Defaults to 'none'
  recurrenceEndDate?: string | null; // Optional inclusive YYYY-MM-DD stop date
  completedDates?: string[]; // Per-occurrence YYYY-MM-DD completions for repeating items
  reminderOffsetMinutes: AgendaReminderOffset | null;
  timezone: string; // IANA timezone (e.g. 'Asia/Manila')
  reminderTargetISO?: string | null; // Exact UTC instant of the next pending alert
  cloudTaskName?: string | null; // Server-managed GCP Cloud Tasks resource name
  reminderSentAt?: string | null; // UTC ISO timestamp once delivered
  createdAt: string;
  updatedAt: string;
}

export interface AgendaItemDraft {
  id?: string;
  title: string;
  date: string;
  time?: string | null;
  note?: string;
  isDone?: boolean;
  recurrence?: AgendaRecurrenceFrequency;
  recurrenceEndDate?: string | null;
  reminderOffsetMinutes: AgendaReminderOffset | null;
  timezone?: string;
}

export type AgendaDeliveryStatus =
  | 'none'
  | 'scheduled'
  | 'deferred'
  | 'sent'
  | 'past'
  | 'unlinked'
  | 'unconfigured';
