import { CalendarBlank, CheckCircle, Clock, GitBranch, NoteBlank } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { getTaskStatus } from '@/domain/taskTree';
import { daysBetween, formatFullDate, parseISODate } from '@/domain/timeline';
import type { FlatTask, Task } from '@/types';

export interface TaskDetailModalProps {
  task: FlatTask | null;
  allTasks: readonly Task[];
  onClose: () => void;
}

export function TaskDetailModal({ task, allTasks, onClose }: TaskDetailModalProps) {
  if (!task) return null;

  const status = getTaskStatus(task);
  const durationDays = Math.max(
    1,
    daysBetween(parseISODate(task.start), parseISODate(task.end)) + 1,
  );

  const dependencyNames = (task.dependencies ?? [])
    .map((id) => allTasks.find((t) => t.id === id)?.name)
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
        <div className="flex items-center justify-between gap-2">
          <Badge variant={badgeVariant}>{statusLabel}</Badge>
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
