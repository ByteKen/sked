import { useMemo, useState } from 'react';
import {
  ArrowSquareOut,
  ArrowsClockwise,
  BellRinging,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  Check,
  CheckCircle,
  Clock,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import { AgendaItemModal } from '@/components/modals/AgendaItemModal';
import { CalendarAgendaSkeleton } from '@/components/skeletons/PageSkeletons';
import { Button } from '@/components/ui/Button';
import {
  AGENDA_RECURRENCE_SHORT_LABELS,
  buildCalendarMonthGrid,
  collectWorkspaceDeadlinesForCalendar,
  computeReminderTargetISO,
  expandAgendaItemsForDates,
  formatClockTime12h,
  formatUtcIsoInTimezone,
  getAgendaDeliveryStatus,
  type CalendarAgendaOccurrence,
  type CalendarDeadlineItem,
} from '@/domain/agenda';
import { useAgendaStore } from '@/store/agendaStore';
import { toast } from '@/store/toastStore';
import type { AgendaItem, AgendaItemDraft, Task, TaskStatus, WorkspaceMap } from '@/types';
import { cn } from '@/utils/cn';

type CalendarFilterMode = 'all' | 'agenda' | 'deadlines';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const WORKSPACE_DOT_COLORS = [
  'bg-brand-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-sky-500',
  'bg-rose-500',
  'bg-violet-500',
];

function formatMonthHeading(year: number, monthIndex: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, monthIndex, 1, 12, 0, 0)));
}

function formatSelectedDateHeading(dateISO: string): string {
  const [y = 2026, m = 1, d = 1] = dateISO.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
}

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export interface CalendarViewProps {
  workspaces: WorkspaceMap;
  workspaceTasks: Record<string, Task[]>;
  todayISO: string;
  onOpenTask: (workspaceId: string, taskId: number) => void;
  onUpdateTaskStatus: (workspaceId: string, taskId: number, status: TaskStatus) => void;
  onOpenSettings: () => void;
}

export function CalendarView({
  workspaces,
  workspaceTasks,
  todayISO,
  onOpenTask,
  onUpdateTaskStatus,
  onOpenSettings,
}: CalendarViewProps) {
  const agendaItems = useAgendaStore((s) => s.items);
  const agendaLoading = useAgendaStore((s) => s.loading);
  const telegramConfig = useAgendaStore((s) => s.telegramConfig);
  const saveAgendaItem = useAgendaStore((s) => s.saveItem);
  const toggleAgendaDone = useAgendaStore((s) => s.toggleDone);
  const deleteAgendaItem = useAgendaStore((s) => s.deleteItem);

  const [todayYear, todayMonth] = useMemo(() => {
    const [y = 2026, m = 1] = todayISO.split('-').map(Number);
    return [y, m - 1] as const;
  }, [todayISO]);

  const [viewYear, setViewYear] = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth);
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [filterMode, setFilterMode] = useState<CalendarFilterMode>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AgendaItem | null>(null);

  const telegramConnected = Boolean(telegramConfig?.connected && telegramConfig?.enabled);
  const defaultTimezone = telegramConfig?.timezone || getBrowserTimeZone();
  const defaultReminderHour = telegramConfig?.reminderHour ?? 9;

  const cells = useMemo(
    () => buildCalendarMonthGrid(viewYear, viewMonth, todayISO),
    [viewYear, viewMonth, todayISO],
  );

  const allDeadlines = useMemo(
    () => collectWorkspaceDeadlinesForCalendar(workspaces, workspaceTasks, todayISO),
    [workspaces, workspaceTasks, todayISO],
  );

  const agendaByDate = useMemo(() => {
    const dates = new Set(cells.map((c) => c.dateISO));
    dates.add(selectedDate);
    return expandAgendaItemsForDates(agendaItems, Array.from(dates));
  }, [agendaItems, cells, selectedDate]);

  const deadlinesByDate = useMemo(() => {
    const map = new Map<string, CalendarDeadlineItem[]>();
    for (const item of allDeadlines) {
      const list = map.get(item.end);
      if (list) list.push(item);
      else map.set(item.end, [item]);
    }
    return map;
  }, [allDeadlines]);

  const selectedAgendaOccurrences = useMemo<CalendarAgendaOccurrence[]>(
    () => (filterMode === 'deadlines' ? [] : (agendaByDate.get(selectedDate) ?? [])),
    [agendaByDate, selectedDate, filterMode],
  );

  const selectedDeadlines = useMemo(
    () => (filterMode === 'agenda' ? [] : (deadlinesByDate.get(selectedDate) ?? [])),
    [deadlinesByDate, selectedDate, filterMode],
  );

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    setViewYear(todayYear);
    setViewMonth(todayMonth);
    setSelectedDate(todayISO);
  };

  const handleOpenNewForDate = (dateISO: string) => {
    setSelectedDate(dateISO);
    setEditingItem(null);
    setModalOpen(true);
  };

  const handleSaveAgenda = async (draft: AgendaItemDraft): Promise<boolean> => {
    const res = await saveAgendaItem(draft);
    if (!res.ok) {
      toast.error('Could not save agenda item', res.error || 'Please try again.');
      return false;
    }

    if (res.warning) {
      toast.error('Saved to calendar, alert not scheduled', res.warning, 9000);
    } else if (res.item?.cloudTaskName && res.item.reminderTargetISO) {
      const timeText = formatUtcIsoInTimezone(res.item.reminderTargetISO, res.item.timezone);
      toast.success(
        editingItem ? 'Agenda updated' : 'Reminder scheduled',
        `Telegram alert set for ${timeText}.`,
      );
    } else {
      toast.success(editingItem ? 'Agenda updated' : 'Added to calendar', draft.title);
    }
    setSelectedDate(draft.date);
    return true;
  };

  const handleToggleAgendaDone = async (occ: CalendarAgendaOccurrence) => {
    const res = occ.isRepeating
      ? await toggleAgendaDone(occ.item.id, occ.occurrenceDate)
      : await toggleAgendaDone(occ.item.id);
    if (!res.ok) {
      toast.error('Could not update item', res.error);
      return;
    }
    if (!occ.isDone) {
      toast.success('Completed', occ.item.title);
    }
  };

  const handleDeleteAgenda = async (itemId: string) => {
    const target = agendaItems.find((i) => i.id === itemId);
    const res = await deleteAgendaItem(itemId);
    if (!res.ok) {
      toast.error('Could not delete item', res.error);
      return;
    }
    toast.info('Agenda item deleted', target?.title);
  };

  return (
    <section aria-label="Calendar and Personal Agenda" className="space-y-5">
      {/* Calendar Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-white/[0.07]">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="inline-flex items-center rounded-xl border border-slate-200/90 dark:border-white/[0.09] bg-white dark:bg-surface-dark shadow-surface-sm p-0.5">
            <button
              type="button"
              onClick={goToPrevMonth}
              aria-label="Previous month"
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <CaretLeft weight="bold" className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={goToToday}
              className="px-3 h-8 text-xs font-semibold text-slate-700 hover:text-brand-600 dark:text-slate-200 dark:hover:text-brand-400 transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={goToNextMonth}
              aria-label="Next month"
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <CaretRight weight="bold" className="w-4 h-4" />
            </button>
          </div>

          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white ml-1">
            {formatMonthHeading(viewYear, viewMonth)}
          </h2>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div
            role="group"
            aria-label="Filter calendar items"
            className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/60 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08]"
          >
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'agenda', label: 'My Agenda' },
                { id: 'deadlines', label: 'Deadlines' },
              ] as const
            ).map((opt) => {
              const active = filterMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFilterMode(opt.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer',
                    active
                      ? 'bg-white dark:bg-surface-elevated text-slate-900 dark:text-white shadow-surface-sm'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={() => handleOpenNewForDate(selectedDate)}
            leftIcon={<Plus className="w-4 h-4" weight="bold" />}
          >
            Add Agenda
          </Button>
        </div>
      </div>

      {/* Main Split: Month Grid + Selected Day Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        {/* Month Grid */}
        <div className="rounded-2xl border border-slate-200/90 dark:border-white/[0.09] bg-white dark:bg-surface-dark shadow-surface-sm overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-50/80 dark:bg-white/[0.02]">
            {WEEKDAY_LABELS.map((day) => (
              <div
                key={day}
                className="py-2.5 text-center font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-white/[0.06]">
            {cells.map((cell) => {
              const dayAgenda =
                filterMode === 'deadlines' ? [] : (agendaByDate.get(cell.dateISO) ?? []);
              const dayDeadlines =
                filterMode === 'agenda' ? [] : (deadlinesByDate.get(cell.dateISO) ?? []);
              const isSelected = cell.dateISO === selectedDate;

              const previewEntries: Array<{
                id: string;
                kind: 'agenda' | 'deadline';
                label: string;
                done: boolean;
                repeating?: boolean;
                overdue?: boolean;
                hasAlert?: boolean;
                dotClass: string;
              }> = [
                  ...dayAgenda.map((occ) => ({
                    id: `a:${occ.item.id}:${occ.occurrenceDate}`,
                    kind: 'agenda' as const,
                    label: occ.item.time
                      ? `${formatClockTime12h(occ.item.time)} ${occ.item.title}`
                      : occ.item.title,
                    done: occ.isDone,
                    repeating: occ.isRepeating,
                    hasAlert: occ.item.reminderOffsetMinutes !== null && !occ.isDone,
                    dotClass: 'bg-brand-500',
                  })),
                  ...dayDeadlines.map((dl) => ({
                    id: `d:${dl.key}`,
                    kind: 'deadline' as const,
                    label: dl.taskName,
                    done: dl.isDone,
                    overdue: dl.isOverdue,
                    dotClass: dl.isDone
                      ? 'bg-emerald-500'
                      : dl.isOverdue
                        ? 'bg-rose-500'
                        : WORKSPACE_DOT_COLORS[dl.workspaceAccentIndex % WORKSPACE_DOT_COLORS.length]!,
                  })),
                ];

              const maxVisible = 2;
              const overflowCount = Math.max(0, previewEntries.length - maxVisible);

              return (
                <button
                  key={cell.dateISO}
                  type="button"
                  data-testid={`calendar-day-${cell.dateISO}`}
                  onClick={() => setSelectedDate(cell.dateISO)}
                  onDoubleClick={() => handleOpenNewForDate(cell.dateISO)}
                  className={cn(
                    'group relative min-h-[76px] sm:min-h-[104px] p-1.5 sm:p-2 text-left flex flex-col transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500',
                    !cell.inCurrentMonth && 'bg-slate-50/55 dark:bg-white/[0.015]',
                    isSelected
                      ? 'bg-brand-50/70 dark:bg-brand-500/[0.11] ring-1 ring-inset ring-brand-500/70'
                      : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]',
                  )}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span
                      className={cn(
                        'inline-flex items-center justify-center w-6 h-6 rounded-full font-mono text-xs font-semibold tabular-nums',
                        cell.isToday
                          ? 'bg-brand-600 text-white shadow-sm'
                          : cell.inCurrentMonth
                            ? 'text-slate-800 dark:text-slate-100'
                            : 'text-slate-400 dark:text-slate-600',
                      )}
                    >
                      {cell.dayNumber}
                    </span>

                    {previewEntries.length > 0 && (
                      <span className="sm:hidden flex items-center gap-0.5">
                        {previewEntries.slice(0, 3).map((entry) => (
                          <span
                            key={entry.id}
                            className={cn('w-1.5 h-1.5 rounded-full', entry.dotClass)}
                          />
                        ))}
                      </span>
                    )}
                  </div>

                  {/* Desktop compact item pills */}
                  <div className="hidden sm:flex flex-col gap-1 w-full min-w-0">
                    {previewEntries.slice(0, maxVisible).map((entry) => (
                      <div
                        key={entry.id}
                        className={cn(
                          'flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium truncate',
                          entry.kind === 'agenda'
                            ? 'bg-brand-500/12 text-brand-800 dark:bg-brand-500/20 dark:text-brand-200'
                            : entry.overdue
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-white/[0.07] dark:text-slate-200',
                          entry.done && 'opacity-55 line-through',
                        )}
                      >
                        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', entry.dotClass)} />
                        {entry.repeating && (
                          <ArrowsClockwise
                            weight="bold"
                            aria-hidden="true"
                            className="w-2.5 h-2.5 shrink-0 opacity-75"
                          />
                        )}
                        <span className="truncate">{entry.label}</span>
                      </div>
                    ))}
                    {overflowCount > 0 && (
                      <span className="text-[10px] font-mono font-semibold text-slate-400 dark:text-slate-500 pl-1">
                        +{overflowCount} more
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Day Agenda & Workspace Deadlines Panel */}
        <aside
          aria-label="Selected day schedule"
          className="rounded-2xl border border-slate-200/90 dark:border-white/[0.09] bg-white dark:bg-surface-dark shadow-surface-sm overflow-hidden"
        >
          <div className="px-4 py-3.5 border-b border-slate-200/80 dark:border-white/[0.08] flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-white/[0.02]">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {formatSelectedDateHeading(selectedDate)}
                </h3>
                {selectedDate === todayISO && (
                  <span className="px-1.5 py-0.5 rounded-md bg-brand-500/15 text-brand-700 dark:text-brand-300 font-mono text-[10px] font-bold uppercase">
                    Today
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {selectedAgendaOccurrences.length} personal · {selectedDeadlines.length} workspace{' '}
                {selectedDeadlines.length === 1 ? 'deadline' : 'deadlines'}
              </p>
            </div>
          </div>

          <div className="p-4 space-y-5 max-h-[640px] overflow-y-auto">
            {/* Personal Agenda Items */}
            {filterMode !== 'deadlines' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    Personal Agenda
                  </span>
                  {!telegramConnected && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                    >
                      <PaperPlaneTilt weight="duotone" className="w-3 h-3" />
                      Link Telegram
                    </button>
                  )}
                </div>

                {agendaLoading && agendaItems.length === 0 ? (
                  <CalendarAgendaSkeleton />
                ) : selectedAgendaOccurrences.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => handleOpenNewForDate(selectedDate)}
                    className="w-full rounded-xl border border-dashed border-slate-200 dark:border-white/15 px-3.5 py-4 text-center hover:border-brand-400 hover:bg-brand-50/40 dark:hover:bg-brand-500/[0.06] transition-colors cursor-pointer"
                  >
                    <CalendarBlank
                      weight="duotone"
                      className="w-5 h-5 text-slate-400 mx-auto mb-1"
                    />
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      No personal reminders on this date
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Click to schedule an agenda item or Telegram alert
                    </p>
                  </button>
                ) : (
                  <ul className="space-y-2">
                    {selectedAgendaOccurrences.map((occ) => {
                      const { item, occurrenceDate, isDone: occDone, isRepeating } = occ;
                      const status = getAgendaDeliveryStatus(
                        item,
                        telegramConnected,
                        undefined,
                        occurrenceDate,
                      );
                      const occTargetISO = isRepeating
                        ? computeReminderTargetISO({
                          date: occurrenceDate,
                          time: item.time,
                          reminderOffsetMinutes: item.reminderOffsetMinutes,
                          timezone: item.timezone,
                          defaultReminderHour,
                        })
                        : item.reminderTargetISO;
                      const alertClock =
                        occTargetISO && formatUtcIsoInTimezone(occTargetISO, item.timezone);

                      return (
                        <li
                          key={`${item.id}:${occurrenceDate}`}
                          data-testid={`agenda-item-${item.id}`}
                          className={cn(
                            'rounded-xl border border-slate-200/85 dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.025] p-3 transition-colors',
                            occDone && 'opacity-65',
                          )}
                        >
                          <div className="flex items-start gap-2.5">
                            <button
                              type="button"
                              aria-label={
                                occDone
                                  ? `Mark "${item.title}" incomplete`
                                  : `Mark "${item.title}" done`
                              }
                              onClick={() => void handleToggleAgendaDone(occ)}
                              className={cn(
                                'mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors cursor-pointer',
                                occDone
                                  ? 'bg-emerald-500 border-emerald-500 text-white'
                                  : 'border-slate-300 dark:border-white/25 hover:border-brand-500',
                              )}
                            >
                              {occDone && <Check weight="bold" className="w-3 h-3" />}
                            </button>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={cn(
                                    'text-xs font-semibold text-slate-900 dark:text-slate-100 break-words',
                                    occDone && 'line-through text-slate-500',
                                  )}
                                >
                                  {item.title}
                                </span>
                                {item.time && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-700 dark:text-brand-300 font-mono text-[10px] font-semibold">
                                    <Clock weight="bold" className="w-2.5 h-2.5" />
                                    {formatClockTime12h(item.time)}
                                  </span>
                                )}
                                {isRepeating && item.recurrence && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-200/75 dark:bg-white/[0.08] text-slate-600 dark:text-slate-300 text-[10px] font-semibold">
                                    <ArrowsClockwise weight="bold" className="w-2.5 h-2.5" />
                                    {AGENDA_RECURRENCE_SHORT_LABELS[item.recurrence]}
                                  </span>
                                )}
                              </div>

                              {item.note && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                                  {item.note}
                                </p>
                              )}

                              {status !== 'none' && (
                                <div className="mt-1.5">
                                  {status === 'scheduled' && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 text-[10px] font-semibold">
                                      <BellRinging weight="duotone" className="w-3 h-3" />
                                      Telegram alert · {alertClock}
                                    </span>
                                  )}
                                  {status === 'deferred' && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-200/70 text-slate-600 dark:bg-white/10 dark:text-slate-300 text-[10px] font-medium">
                                      <BellRinging weight="duotone" className="w-3 h-3" />
                                      Queues automatically (&gt;29d)
                                    </span>
                                  )}
                                  {status === 'sent' && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 text-[10px] font-semibold">
                                      <CheckCircle weight="duotone" className="w-3 h-3" />
                                      Alert delivered
                                    </span>
                                  )}
                                  {status === 'unlinked' && (
                                    <button
                                      type="button"
                                      onClick={onOpenSettings}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 text-[10px] font-semibold hover:underline cursor-pointer"
                                    >
                                      <WarningCircle weight="duotone" className="w-3 h-3" />
                                      Link Telegram to receive alert
                                    </button>
                                  )}
                                  {status === 'unconfigured' && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 text-[10px] font-medium">
                                      <WarningCircle weight="duotone" className="w-3 h-3" />
                                      Alert pending Cloud Tasks setup
                                    </span>
                                  )}
                                  {status === 'past' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                                      Alert time already passed
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                aria-label={`Edit "${item.title}"`}
                                onClick={() => {
                                  setEditingItem(item);
                                  setModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 dark:hover:text-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                              >
                                <PencilSimple weight="duotone" className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Delete "${item.title}"`}
                                onClick={() => void handleDeleteAgenda(item.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-500/15 transition-colors cursor-pointer"
                              >
                                <Trash weight="duotone" className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* Workspace Deadlines */}
            {filterMode !== 'agenda' && (
              <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-white/[0.06]">
                <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  Workspace Deadlines
                </span>

                {selectedDeadlines.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 py-2">
                    No workspace task deadlines on this date.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {selectedDeadlines.map((dl) => {
                      const dotClass = dl.isDone
                        ? 'bg-emerald-500'
                        : dl.isOverdue
                          ? 'bg-rose-500'
                          : WORKSPACE_DOT_COLORS[
                          dl.workspaceAccentIndex % WORKSPACE_DOT_COLORS.length
                          ]!;

                      return (
                        <li
                          key={dl.key}
                          data-testid={`calendar-deadline-${dl.workspaceId}-${dl.taskId}`}
                          className="rounded-xl border border-slate-200/85 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                <span className={cn('w-2 h-2 rounded-full shrink-0', dotClass)} />
                                <span className="truncate">{dl.workspaceTitle}</span>
                                {dl.parentName && (
                                  <span className="truncate opacity-75">· {dl.parentName}</span>
                                )}
                              </div>
                              <p
                                className={cn(
                                  'text-xs font-semibold text-slate-900 dark:text-slate-100 mt-1 break-words',
                                  dl.isDone && 'line-through text-slate-500',
                                )}
                              >
                                {dl.taskName}
                              </p>
                            </div>

                            <span
                              className={cn(
                                'shrink-0 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold tabular-nums',
                                dl.isDone
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                                  : dl.isOverdue
                                    ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                                    : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
                              )}
                            >
                              {dl.isDone ? 'Done' : dl.isOverdue ? 'Overdue' : `${dl.progress}%`}
                            </span>
                          </div>

                          <div className="mt-2.5 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateTaskStatus(
                                  dl.workspaceId,
                                  dl.taskId,
                                  dl.isDone ? 'in-progress' : 'completed',
                                )
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-emerald-600 dark:text-slate-300 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                            >
                              <CheckCircle weight="duotone" className="w-3.5 h-3.5" />
                              {dl.isDone ? 'Reopen' : 'Mark done'}
                            </button>

                            <button
                              type="button"
                              onClick={() => onOpenTask(dl.workspaceId, dl.taskId)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors cursor-pointer"
                            >
                              Open task
                              <ArrowSquareOut weight="bold" className="w-3 h-3" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      <AgendaItemModal
        isOpen={modalOpen}
        initialDate={selectedDate}
        editingItem={editingItem}
        telegramConnected={telegramConnected}
        defaultTimezone={defaultTimezone}
        defaultReminderHour={defaultReminderHour}
        onSave={handleSaveAgenda}
        onDelete={handleDeleteAgenda}
        onOpenSettings={onOpenSettings}
        onClose={() => {
          setModalOpen(false);
          setEditingItem(null);
        }}
      />
    </section>
  );
}
