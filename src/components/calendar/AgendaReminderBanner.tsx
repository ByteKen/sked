import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BellRinging,
  CalendarBlank,
  Check,
  Clock,
  SpeakerHigh,
  SpeakerSlash,
  X,
} from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AGENDA_RECURRENCE_SHORT_LABELS,
  buildAgendaFiredKey,
  findDueAndNextInAppReminders,
  formatClockTime12h,
  getAgendaReminderHeading,
  isAgendaOccurrenceDone,
  isRepeatingAgendaItem,
} from '@/domain/agenda';
import { useAgendaStore } from '@/store/agendaStore';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { toast } from '@/store/toastStore';
import type { AgendaItem } from '@/types';
import { SPRING_SNAPPY } from '@/utils/motion';
import {
  isReminderSoundEnabled,
  playReminderChime,
  subscribeReminderSoundPreference,
} from '@/utils/reminderSound';

const FIRED_STORAGE_KEY = 'sked_fired_agenda_alerts';
const MAX_STORED_FIRED_KEYS = 80;

function readFiredKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(FIRED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? new Set(parsed.filter((v): v is string => typeof v === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

function persistFiredKeys(keys: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = Array.from(keys).slice(-MAX_STORED_FIRED_KEYS);
    window.sessionStorage.setItem(FIRED_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore storage restrictions
  }
}

/**
 * Global zero-polling in-app reminder watcher & floating alert banner.
 * Schedules a single local timeout for the soonest upcoming personal agenda alert
 * from `useAgendaStore`, chimes gently if unmuted, and lets the user mark done or jump to Calendar.
 */
export function AgendaReminderBanner() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const enableInAppReminders = usePreferencesStore((s) => s.enableInAppReminders);
  const items = useAgendaStore((s) => s.items);
  const toggleDone = useAgendaStore((s) => s.toggleDone);

  const [activeAlerts, setActiveAlerts] = useState<AgendaItem[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isReminderSoundEnabled());
  const [completingId, setCompletingId] = useState<string | null>(null);
  const firedKeysRef = useRef<Set<string>>(readFiredKeys());

  useEffect(() => subscribeReminderSoundPreference(setSoundEnabled), []);

  // Automatically remove any active alert whose occurrence was completed or deleted elsewhere (e.g. via Telegram)
  useEffect(() => {
    setActiveAlerts((prev) =>
      prev.filter((alert) => {
        const current = items.find((entry) => entry.id === alert.id);
        return Boolean(current && !isAgendaOccurrenceDone(current, alert.date));
      }),
    );
  }, [items]);

  // Clear banners when signed out or when in-app reminders are disabled
  useEffect(() => {
    if (!isAuthenticated || !enableInAppReminders) {
      setActiveAlerts([]);
    }
  }, [isAuthenticated, enableInAppReminders]);

  useEffect(() => {
    if (!isAuthenticated || !enableInAppReminders || items.length === 0) return;

    let timerId: number | null = null;

    const evaluate = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
      }

      const { due, nextDelayMs } = findDueAndNextInAppReminders(
        items,
        firedKeysRef.current,
        Date.now(),
      );

      if (due.length > 0) {
        for (const item of due) {
          firedKeysRef.current.add(buildAgendaFiredKey(item));
        }
        persistFiredKeys(firedKeysRef.current);

        setActiveAlerts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const additions = due.filter((d) => !existingIds.has(d.id));
          return additions.length > 0 ? [...additions, ...prev] : prev;
        });

        playReminderChime();
      }

      if (nextDelayMs !== null) {
        timerId = window.setTimeout(evaluate, nextDelayMs);
      }
    };

    evaluate();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        evaluate();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (timerId !== null) window.clearTimeout(timerId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAuthenticated, enableInAppReminders, items]);

  const handleDismiss = useCallback((itemId: string) => {
    setActiveAlerts((prev) => prev.filter((entry) => entry.id !== itemId));
  }, []);

  const handleMarkDone = useCallback(
    async (item: AgendaItem) => {
      setCompletingId(item.id);
      try {
        const res = isRepeatingAgendaItem(item)
          ? await toggleDone(item.id, item.date)
          : await toggleDone(item.id);
        if (res.ok) {
          setActiveAlerts((prev) => prev.filter((entry) => entry.id !== item.id));
          toast.success('Completed', item.title);
        } else {
          toast.error('Could not mark done', res.error);
        }
      } finally {
        setCompletingId(null);
      }
    },
    [toggleDone],
  );

  const handleToggleSound = () => {
    const next = !soundEnabled;
    usePreferencesStore.getState().setReminderSoundEnabled(next);
    setSoundEnabled(next);
    if (next) {
      playReminderChime({ force: true });
    }
  };

  if (!isAuthenticated || !enableInAppReminders || activeAlerts.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="assertive"
      className="fixed top-[76px] right-4 z-[65] flex flex-col gap-2.5 w-[calc(100vw-2rem)] max-w-sm pointer-events-none"
    >
      <AnimatePresence mode="popLayout">
        {activeAlerts.map((item) => {
          const heading = getAgendaReminderHeading(item);
          const isCompleting = completingId === item.id;

          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.95 }}
              transition={SPRING_SNAPPY}
              role="alert"
              data-testid={`in-app-reminder-${item.id}`}
              className="pointer-events-auto overflow-hidden rounded-2xl border border-brand-300/90 dark:border-brand-500/40 bg-white/95 dark:bg-surface-elevated/95 backdrop-blur-md shadow-surface-lg dark:shadow-dark-lg"
            >
              <div className="h-1 w-full bg-gradient-to-r from-brand-500 via-indigo-500 to-brand-400" />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 h-7 rounded-lg bg-brand-500/15 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                      <BellRinging weight="duotone" className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-bold text-brand-700 dark:text-brand-300 truncate">
                      {heading.text}
                    </span>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleToggleSound}
                      aria-label={soundEnabled ? 'Mute reminder chime' : 'Unmute reminder chime'}
                      title={soundEnabled ? 'Chime on (click to mute)' : 'Chime muted (click to unmute)'}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      {soundEnabled ? (
                        <SpeakerHigh weight="duotone" className="w-3.5 h-3.5" />
                      ) : (
                        <SpeakerSlash weight="duotone" className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismiss(item.id)}
                      aria-label="Dismiss reminder"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <X weight="bold" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-2.5 pl-9">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                      {item.title}
                    </p>
                    {item.time && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                        <Clock weight="bold" className="w-3 h-3 text-brand-500" />
                        {formatClockTime12h(item.time)}
                      </span>
                    )}
                    {item.recurrence && item.recurrence !== 'none' && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-700 dark:text-brand-300 text-[10px] font-semibold">
                        {AGENDA_RECURRENCE_SHORT_LABELS[item.recurrence]}
                      </span>
                    )}
                  </div>

                  {item.note && (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                      {item.note}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      disabled={isCompleting}
                      onClick={() => void handleMarkDone(item)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Check weight="bold" className="w-3.5 h-3.5" />
                      {isCompleting ? 'Saving...' : 'Mark Done'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleDismiss(item.id);
                        navigate('/?tab=calendar');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-white/[0.08] dark:hover:bg-white/[0.14] dark:text-slate-200 transition-colors cursor-pointer"
                    >
                      <CalendarBlank weight="duotone" className="w-3.5 h-3.5" />
                      Calendar
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
