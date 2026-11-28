export type AgendaReminderOffset = 0 | 15 | 30 | 60;

export interface AgendaItem {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string | null; // Optional HH:mm (24h, e.g. '19:00')
  note?: string;
  isDone: boolean;
  reminderOffsetMinutes: AgendaReminderOffset | null;
  timezone: string; // IANA timezone (e.g. 'Asia/Manila')
  reminderTargetISO?: string | null; // Exact UTC instant when alert should fire
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
