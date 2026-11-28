import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowsClockwise,
  BellRinging,
  CalendarBlank,
  Clock,
  PaperPlaneTilt,
  SpeakerHigh,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  AGENDA_RECURRENCE_LABELS,
  computeNextAgendaReminder,
  formatClockTime12h,
  formatUtcIsoInTimezone,
  normalizeAgendaRecurrence,
  validateAgendaDraft,
} from '@/domain/agenda';
import type {
  AgendaItem,
  AgendaItemDraft,
  AgendaRecurrenceFrequency,
  AgendaReminderOffset,
} from '@/types';
import { cn } from '@/utils/cn';
import { playReminderChime } from '@/utils/reminderSound';

const REMINDER_OPTIONS: Array<{ value: AgendaReminderOffset | null; label: string }> = [
  { value: null, label: 'No alert' },
  { value: 0, label: 'At time' },
  { value: 15, label: '15m before' },
  { value: 30, label: '30m before' },
  { value: 60, label: '1h before' },
];

const RECURRENCE_OPTIONS: Array<{ value: AgendaRecurrenceFrequency; label: string }> = [
  { value: 'none', label: 'Never' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export interface AgendaItemModalProps {
  isOpen: boolean;
  initialDate: string;
  editingItem?: AgendaItem | null;
  telegramConnected: boolean;
  defaultTimezone: string;
  defaultReminderHour: number;
  onSave: (draft: AgendaItemDraft) => Promise<boolean>;
  onDelete?: (itemId: string) => Promise<void>;
  onOpenSettings?: () => void;
  onClose: () => void;
}

export function AgendaItemModal({
  isOpen,
  initialDate,
  editingItem,
  telegramConnected,
  defaultTimezone,
  defaultReminderHour,
  onSave,
  onDelete,
  onOpenSettings,
  onClose,
}: AgendaItemModalProps) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState('');
  const [recurrence, setRecurrence] = useState<AgendaRecurrenceFrequency>('none');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [reminderOffset, setReminderOffset] = useState<AgendaReminderOffset | null>(15);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editingItem) {
      setTitle(editingItem.title);
      setDate(editingItem.date);
      setTime(editingItem.time ?? '');
      setRecurrence(normalizeAgendaRecurrence(editingItem.recurrence));
      setRecurrenceEndDate(editingItem.recurrenceEndDate ?? '');
      setReminderOffset(editingItem.reminderOffsetMinutes);
      setNote(editingItem.note ?? '');
    } else {
      setTitle('');
      setDate(initialDate);
      setTime('');
      setRecurrence('none');
      setRecurrenceEndDate('');
      setReminderOffset(telegramConnected ? 15 : null);
      setNote('');
    }
    setError(null);
    setSaving(false);
    setDeleting(false);
  }, [isOpen, editingItem, initialDate, telegramConnected]);

  const previewAlertTime = useMemo(() => {
    if (reminderOffset === null || !date) return null;
    const tz = editingItem?.timezone || defaultTimezone;
    const next = computeNextAgendaReminder({
      date,
      time: time || null,
      recurrence,
      recurrenceEndDate: recurrence !== 'none' && recurrenceEndDate ? recurrenceEndDate : null,
      completedDates: editingItem?.completedDates,
      reminderOffsetMinutes: reminderOffset,
      timezone: tz,
      defaultReminderHour,
    });
    if (!next) return null;
    return formatUtcIsoInTimezone(next.reminderTargetISO, tz);
  }, [
    reminderOffset,
    date,
    time,
    recurrence,
    recurrenceEndDate,
    editingItem?.timezone,
    editingItem?.completedDates,
    defaultTimezone,
    defaultReminderHour,
  ]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const draft: AgendaItemDraft = {
      ...(editingItem ? { id: editingItem.id, isDone: editingItem.isDone } : {}),
      title: title.trim(),
      date,
      time: time || null,
      recurrence,
      recurrenceEndDate: recurrence !== 'none' && recurrenceEndDate ? recurrenceEndDate : null,
      note: note.trim() || undefined,
      reminderOffsetMinutes: reminderOffset,
      timezone: editingItem?.timezone || defaultTimezone,
    };

    const validation = validateAgendaDraft(draft);
    if (!validation.valid) {
      setError(validation.error || 'Please check your agenda details.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const ok = await onSave(draft);
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingItem || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(editingItem.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingItem ? 'Edit Personal Agenda' : 'New Personal Agenda'}
      description="Schedule a personal reminder, event, or repeating routine"
      maxWidth="md"
      icon={
        <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
          <CalendarBlank weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {editingItem && onDelete ? (
            <Button
              variant="ghost"
              size="sm"
              loading={deleting}
              disabled={saving}
              onClick={() => void handleDelete()}
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/15"
              leftIcon={<Trash weight="duotone" className="w-3.5 h-3.5" />}
            >
              Delete
            </Button>
          ) : (
            <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
              {defaultTimezone}
            </span>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving || deleting}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="agenda-item-form"
              variant="primary"
              size="sm"
              loading={saving}
              disabled={deleting}
            >
              {editingItem ? 'Save Changes' : 'Add to Calendar'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="agenda-item-form" onSubmit={(e) => void handleSubmit(e)} className="p-5 sm:p-6 space-y-4">
        <div>
          <label
            htmlFor="agenda-title-input"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Title
          </label>
          <input
            id="agenda-title-input"
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
            placeholder="e.g., Daily standup, Weekly sync, Gym"
            autoFocus
            maxLength={100}
            className="w-full h-10 px-3.5 text-[13px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas-dark text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="agenda-date-input"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              {recurrence !== 'none' ? 'Starts on' : 'Date'}
            </label>
            <input
              id="agenda-date-input"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setError(null);
              }}
              className="w-full h-10 px-3 text-[13px] font-mono rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas-dark text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="agenda-time-input"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Time <span className="font-normal text-slate-400">(optional)</span>
              </label>
              {time && (
                <button
                  type="button"
                  onClick={() => setTime('')}
                  className="inline-flex items-center gap-0.5 text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3 h-3" weight="bold" />
                  Clear
                </button>
              )}
            </div>
            <div className="relative">
              <Clock
                weight="duotone"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              />
              <input
                id="agenda-time-input"
                type="time"
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  setError(null);
                }}
                className="w-full h-10 pl-9 pr-3 text-[13px] font-mono rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas-dark text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {time && (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {formatClockTime12h(time)}
              </p>
            )}
          </div>
        </div>

        {/* Repeat Frequency */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <ArrowsClockwise
                weight="duotone"
                className="w-4 h-4 text-brand-600 dark:text-brand-400"
              />
              Repeat
            </span>
            {recurrence !== 'none' && (
              <span className="text-[11px] font-medium text-brand-600 dark:text-brand-400">
                {AGENDA_RECURRENCE_LABELS[recurrence]}
              </span>
            )}
          </div>

          <div role="group" aria-label="Repeat frequency" className="flex flex-wrap gap-1.5">
            {RECURRENCE_OPTIONS.map((opt) => {
              const active = recurrence === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setRecurrence(opt.value);
                    if (opt.value === 'none') setRecurrenceEndDate('');
                    setError(null);
                  }}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer',
                    active
                      ? 'bg-brand-600 text-white border-brand-600 shadow-surface-sm'
                      : 'bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-brand-400',
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {recurrence !== 'none' && (
            <div className="flex items-center justify-between gap-3 pt-0.5">
              <label
                htmlFor="agenda-repeat-end-input"
                className="text-xs font-medium text-slate-600 dark:text-slate-400 shrink-0"
              >
                End repeat <span className="text-slate-400">(optional)</span>
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id="agenda-repeat-end-input"
                  type="date"
                  min={date}
                  value={recurrenceEndDate}
                  onChange={(e) => {
                    setRecurrenceEndDate(e.target.value);
                    setError(null);
                  }}
                  className="h-9 px-2.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas-dark text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {recurrenceEndDate && (
                  <button
                    type="button"
                    onClick={() => setRecurrenceEndDate('')}
                    aria-label="Clear repeat end date"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-white/[0.08] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" weight="bold" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Telegram Exact-Time Reminder */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <BellRinging weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              Reminder Alert
            </span>
            {reminderOffset !== null && (
              <button
                type="button"
                onClick={() => playReminderChime({ force: true })}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 cursor-pointer"
              >
                <SpeakerHigh weight="duotone" className="w-3.5 h-3.5" />
                Preview chime
              </button>
            )}
          </div>
          <div
            role="group"
            aria-label="Telegram reminder lead time"
            className="flex flex-wrap gap-1.5"
          >
            {REMINDER_OPTIONS.map((opt) => {
              const active = reminderOffset === opt.value;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => setReminderOffset(opt.value)}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer',
                    active
                      ? 'bg-brand-600 text-white border-brand-600 shadow-surface-sm'
                      : 'bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-brand-400',
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {reminderOffset !== null && (
            <div className="mt-2.5 rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/80 dark:bg-white/[0.03] px-3 py-2.5 text-xs">
              {telegramConnected ? (
                <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <PaperPlaneTilt
                    weight="duotone"
                    className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0"
                  />
                  <span>
                    {recurrence !== 'none'
                      ? `Repeats ${AGENDA_RECURRENCE_LABELS[recurrence].toLowerCase()} · next Telegram alert at `
                      : 'One-shot Telegram alert scheduled for '}
                    <strong className="font-mono text-slate-900 dark:text-white">
                      {previewAlertTime || 'selected date'}
                    </strong>
                    {!time && (
                      <span className="text-slate-400">
                        {' '}
                        (all-day default: {defaultReminderHour}:00)
                      </span>
                    )}
                  </span>
                </p>
              ) : (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-amber-700 dark:text-amber-300">
                    Connect Telegram in Settings to receive exact-time alerts.
                  </span>
                  {onOpenSettings && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenSettings();
                      }}
                      className="font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                    >
                      Open Settings
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="agenda-note-input"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Note <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            id="agenda-note-input"
            rows={2}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setError(null);
            }}
            maxLength={500}
            placeholder="Room link, checklist, or extra context..."
            className="w-full px-3 py-2 text-[13px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas-dark text-slate-900 dark:text-slate-100 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
            <WarningCircle className="w-4 h-4 shrink-0" weight="duotone" />
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
