import { useMemo } from 'react';
import {
  CalendarBlank,
  CheckCircle,
  Clock,
  FlagBanner,
  GitBranch,
  NoteBlank,
  Path,
} from '@phosphor-icons/react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { computeCriticalPath, computeTaskBaselineSlipDays } from '@/domain/scheduling';
import { findTaskById, getTaskStatus } from '@/domain/taskTree';
import { daysBetween, formatDateRange, formatFullDate, parseISODate } from '@/domain/timeline';
import type { FlatTask, Task, WorkspaceBaseline } from '@/types';
import { cn } from '@/utils/cn';

export interface TaskDetailModalProps {
  task: FlatTask | null;
  allTasks: readonly Task[];
  baseline?: WorkspaceBaseline | null;
  onClose: () => void;
}

export function TaskDetailModal({ task, allTasks, baseline, onClose }: TaskDetailModalProps) {
  const cpm = useMemo(() => (task ? computeCriticalPath(allTasks) : null), [task, allTasks]);

  if (!task) return null;

  const status = getTaskStatus(task);
  const durationDays = Math.max(
    1,
    daysBetween(parseISODate(task.start), parseISODate(task.end)) + 1,
  );
  const isCritical = Boolean(cpm?.criticalTaskIds.has(task.id));
  const slackDays = cpm?.slackByTaskId.get(task.id);
  const baselineEntry = baseline?.entries[task.id] ?? null;
  const slipDays = baselineEntry ? computeTaskBaselineSlipDays(task, baseline) : null;

  const dependencyNames = (task.dependencies ?? [])
    .map((id) => findTaskById(allTasks, id)?.name)
    .filter((name): name is string => Boolean(name));

  const badgeVariant =
    status === 'completed'
      ? 'emerald'
      : status === 'working'
        ? 'amber'
        : status === 'in-progress'
          ? 'brand'
          : 'neutral';

  const statusLabel =
    status === 'completed'
      ? 'Completed'
      : status === 'working'
        ? 'Currently Working'
        : status === 'in-progress'
          ? 'In Progress'
          : 'Not Started';

  return (
    <Modal
      isOpen={Boolean(task)}
      onClose={onClose}
      title={task.name}
      description="Read-only task details"
      icon={
        <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
          <CalendarBlank weight="duotone" className="w-5 h-5 text-brand-600 dark:text-brand-400" />
        </div>
      }
      maxWidth="md"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" size="md" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="p-6 sm:p-7 space-y-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={badgeVariant}>{statusLabel}</Badge>
            {isCritical ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/25">
                <Path weight="duotone" className="w-3.5 h-3.5" />
                Critical Path
              </span>
            ) : typeof slackDays === 'number' && slackDays > 0 ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[11px] font-medium bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                {slackDays}d slack
              </span>
            ) : null}
          </div>
          <span className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
            {task.progress}% complete
          </span>
        </div>

        <div className="h-2.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
          <div
            style={{ width: `${task.progress}%` }}
            className={
              status === 'completed'
                ? 'h-full bg-emerald-500'
                : status === 'working'
                  ? 'h-full bg-amber-500'
                  : 'h-full bg-brand-500'
            }
          />
        </div>

        {task.description && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-1.5">
              <NoteBlank weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              Description
            </div>
            <p className="text-xs sm:text-[13px] text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
              {task.description}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <CalendarBlank weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              Schedule
            </div>
            <p className="font-mono text-xs sm:text-[13px] font-medium text-slate-900 dark:text-slate-100 mt-1.5">
              {formatFullDate(task.start)}
              {task.start !== task.end ? ` → ${formatFullDate(task.end)}` : ''}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Clock weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              Duration
            </div>
            <p className="font-mono text-xs sm:text-[13px] font-medium text-slate-900 dark:text-slate-100 mt-1.5 tabular-nums">
              {durationDays} {durationDays === 1 ? 'day' : 'days'}
            </p>
          </div>
        </div>

        {baselineEntry && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06] flex items-center justify-between gap-3 flex-wrap">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <FlagBanner weight="duotone" className="w-4 h-4 text-amber-500" />
                Planned Baseline
              </div>
              <p className="font-mono text-xs text-slate-800 dark:text-slate-200">
                {formatDateRange(baselineEntry.start, baselineEntry.end)}
              </p>
            </div>
            {typeof slipDays === 'number' && (
              <span
                className={cn(
                  'font-mono text-xs font-bold px-2 py-1 rounded-lg tabular-nums',
                  slipDays > 0
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                    : slipDays < 0
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                      : 'bg-slate-200/75 text-slate-600 dark:bg-white/10 dark:text-slate-300',
                )}
              >
                {slipDays > 0
                  ? `+${slipDays}d behind plan`
                  : slipDays < 0
                    ? `${Math.abs(slipDays)}d ahead`
                    : 'On baseline'}
              </span>
            )}
          </div>
        )}

        {dependencyNames.length > 0 && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-2">
              <GitBranch weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              Depends On
            </div>
            <ul className="space-y-1.5">
              {dependencyNames.map((name) => (
                <li
                  key={name}
                  className="text-xs sm:text-[13px] font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2"
                >
                  <CheckCircle weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0" />
                  <span className="truncate">{name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
