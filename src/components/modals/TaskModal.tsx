import { useState, type ChangeEvent, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarBlank,
  Check,
  CheckCircle,
  Clock,
  Crosshair,
  NoteBlank,
  PlayCircle,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { formatFullDate } from '@/domain/timeline';
import { findTaskById } from '@/domain/taskTree';
import { buildDraftDefaultsForStatus } from '@/domain/taskViews';
import { validateTaskDraft, type FieldValidationResult } from '@/domain/validation';
import type { Task, TaskDraft, TaskStatus } from '@/types';
import { cn } from '@/utils/cn';
import {
  clampProgressPercent,
  PROGRESS_FILL_TRANSITION,
  SPRING_SNAPPY,
  STUDIO_EASE,
} from '@/utils/motion';

export interface TaskModalProps {
  isOpen: boolean;
  task: Task | null;
  allTasks: readonly Task[];
  isSubtask?: boolean;
  parentTask?: Task | null;
  initialStatus?: TaskStatus | null;
  onSave: (draft: TaskDraft) => void;
  onClose: () => void;
}

export function TaskModal({
  isOpen,
  task,
  allTasks,
  isSubtask = false,
  parentTask = null,
  initialStatus = null,
  onSave,
  onClose,
}: TaskModalProps) {
  const parent = parentTask ?? (task?.parentId ? findTaskById(allTasks, task.parentId) : null);
  const hasChildren = Boolean(task?.children && task.children.length > 0);
  const effectiveIsSubtask = isSubtask || Boolean(parent);

  const statusDefaults = !task && initialStatus ? buildDraftDefaultsForStatus(initialStatus) : null;

  const [isDeadlineOnly, setIsDeadlineOnly] = useState<boolean>(Boolean(task?.isDeadline));
  const [isDone, setIsDone] = useState<boolean>(
    Boolean(task ? task.isDone || task.progress === 100 : statusDefaults?.isDone),
  );
  const [isWorking, setIsWorking] = useState<boolean>(
    Boolean(task ? task.isWorking : statusDefaults?.isWorking),
  );
  const [validationError, setValidationError] = useState<FieldValidationResult | null>(null);

  const [formData, setFormData] = useState<TaskDraft>({
    name: task?.name ?? '',
    description: task?.description ?? '',
    start: task?.start ?? parent?.start ?? '',
    end: task?.end ?? parent?.end ?? '',
    progress: task?.progress ?? statusDefaults?.progress ?? 0,
    isMilestone: Boolean(task?.isMilestone),
    isDeadline: Boolean(task?.isDeadline),
    isDone: Boolean(task?.isDone ?? statusDefaults?.isDone),
    isWorking: Boolean(task?.isWorking ?? statusDefaults?.isWorking),
    dependencies: task?.dependencies ? [...task.dependencies] : [],
  });

  const handleFieldChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = event.target;
    setValidationError(null);
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'range' || type === 'number' ? Number(value) : value,
    }));
  };

  const handleDeadlineMode = (deadlineMode: boolean) => {
    setValidationError(null);
    setIsDeadlineOnly(deadlineMode);
    setFormData((prev) => ({
      ...prev,
      isDeadline: deadlineMode,
      start: deadlineMode ? prev.end || prev.start : prev.start,
    }));
  };

  const handleDeadlineDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    const date = event.target.value;
    setValidationError(null);
    setFormData((prev) => ({ ...prev, start: date, end: date }));
  };

  const handleDependencyToggle = (depId: number) => {
    setFormData((prev) => {
      const current = prev.dependencies ?? [];
      const exists = current.includes(depId);
      return {
        ...prev,
        dependencies: exists ? current.filter((id) => id !== depId) : [...current, depId],
      };
    });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setValidationError(null);

    const validation = validateTaskDraft(formData, {
      isDeadlineOnly,
      parentTask: effectiveIsSubtask ? parent : null,
    });
    if (!validation.valid) {
      setValidationError(validation);
      return;
    }

    const progress = effectiveIsSubtask ? (isDone ? 100 : 0) : formData.progress;
    const effectiveStart = isDeadlineOnly ? formData.end : formData.start;

    const trimmedDescription = formData.description?.trim() ?? '';

    onSave({
      ...formData,
      name: formData.name.trim(),
      description: trimmedDescription || undefined,
      start: effectiveStart,
      end: formData.end,
      isDeadline: isDeadlineOnly,
      isDone: effectiveIsSubtask ? isDone : progress === 100,
      isWorking: effectiveIsSubtask ? (isDone ? false : isWorking) : progress === 100 ? false : isWorking,
      progress,
    });
  };

  const availableDependencies = allTasks.filter((t) => !task || t.id !== task.id);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={task ? 'Edit Task' : effectiveIsSubtask ? 'New Subtask' : 'New Task'}
      description={
        parent
          ? `Subtask of ${parent.name} (${formatFullDate(parent.start)} – ${formatFullDate(parent.end)})`
          : 'Configure schedule dates, status, and dependencies'
      }
      icon={
        <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
          <CalendarBlank weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
        </div>
      }
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="task-modal-form"
            variant="primary"
            size="sm"
            leftIcon={<Check weight="bold" className="w-3.5 h-3.5" />}
          >
            {task ? 'Save Changes' : 'Create Task'}
          </Button>
        </div>
      }
    >
      <form id="task-modal-form" onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
        <AnimatePresence>
          {validationError && !validationError.valid && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: STUDIO_EASE }}
              className="flex items-start gap-2.5 p-4 rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10 animate-shake"
            >
              <WarningCircle weight="duotone" className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-rose-800 dark:text-rose-200">
                  {validationError.error}
                </p>
                {validationError.description && (
                  <p className="text-xs text-rose-700 dark:text-rose-300/90 mt-0.5">
                    {validationError.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setValidationError(null)}
                aria-label="Dismiss error"
                className="p-0.5 rounded text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/20 cursor-pointer"
              >
                <X weight="bold" className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Task Name */}
        <div>
          <label
            htmlFor="task-name-input"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2"
          >
            Task Name
          </label>
          <input
            id="task-name-input"
            type="text"
            name="name"
            value={formData.name}
            onChange={handleFieldChange}
            placeholder="e.g., API Design & Schema Review"
            required
            autoFocus
            className="w-full h-10 px-3.5 text-[13px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition"
          />
        </div>

        {/* Task Description */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              htmlFor="task-description-input"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              <NoteBlank weight="duotone" className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
              Description
              <span className="font-normal text-slate-400 dark:text-slate-500">(optional)</span>
            </label>
            {(formData.description?.length ?? 0) > 0 && (
              <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                {formData.description?.length ?? 0} / 2000
              </span>
            )}
          </div>
          <textarea
            id="task-description-input"
            name="description"
            rows={3}
            maxLength={2000}
            value={formData.description ?? ''}
            onChange={handleFieldChange}
            placeholder="Add context, deliverables, acceptance criteria, or notes..."
            className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition resize-y min-h-[84px]"
          />
        </div>

        {/* Date Mode Segmented Toggle with Framer Motion layoutId */}
        <div>
          <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Schedule Type
          </span>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08]">
            <button
              type="button"
              onClick={() => handleDeadlineMode(false)}
              className={cn(
                'relative flex items-center justify-center gap-2 py-2.5 text-xs sm:text-[13px] font-semibold rounded-lg transition-colors cursor-pointer',
                !isDeadlineOnly
                  ? 'text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
              )}
            >
              {!isDeadlineOnly && (
                <motion.span
                  layoutId="schedule-type-pill"
                  transition={SPRING_SNAPPY}
                  className="absolute inset-0 rounded-lg bg-brand-600 dark:bg-brand-500 shadow-brand-glow-sm"
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                <CalendarBlank weight="duotone" className="w-4 h-4" />
                Date Range
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleDeadlineMode(true)}
              className={cn(
                'relative flex items-center justify-center gap-2 py-2.5 text-xs sm:text-[13px] font-semibold rounded-lg transition-colors cursor-pointer',
                isDeadlineOnly
                  ? 'text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
              )}
            >
              {isDeadlineOnly && (
                <motion.span
                  layoutId="schedule-type-pill"
                  transition={SPRING_SNAPPY}
                  className="absolute inset-0 rounded-lg bg-brand-600 dark:bg-brand-500 shadow-brand-glow-sm"
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                <Crosshair weight="duotone" className="w-4 h-4" />
                Single-Day Deadline
              </span>
            </button>
          </div>
        </div>

        {/* Date Pickers */}
        {isDeadlineOnly ? (
          <div>
            <label
              htmlFor="task-deadline-date"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2"
            >
              <Clock weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              Deadline Date
            </label>
            <input
              id="task-deadline-date"
              type="date"
              name="end"
              value={formData.end}
              onChange={handleDeadlineDateChange}
              required
              className="w-full h-10 px-3.5 text-[13px] font-mono rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
            />
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              Appears as a diamond milestone marker on the timeline.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="task-start-date"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Start Date
              </label>
              <input
                id="task-start-date"
                type="date"
                name="start"
                value={formData.start}
                onChange={handleFieldChange}
                required
                className="w-full h-10 px-3 text-[13px] font-mono rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
              />
            </div>
            <div>
              <label
                htmlFor="task-end-date"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                End Date
              </label>
              <input
                id="task-end-date"
                type="date"
                name="end"
                value={formData.end}
                onChange={handleFieldChange}
                required
                className="w-full h-10 px-3 text-[13px] font-mono rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
              />
            </div>
          </div>
        )}

        {/* Progress / Status */}
        {hasChildren ? (
          <div className="p-4 rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.025]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Auto-calculated Progress
              </span>
              <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400 tabular-nums">
                {formData.progress}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
              <div
                style={{ transform: `translateX(${clampProgressPercent(formData.progress) - 100}%)` }}
                className={cn(
                  'h-full w-full rounded-full',
                  PROGRESS_FILL_TRANSITION,
                  formData.progress === 100 ? 'bg-emerald-500' : 'bg-brand-500',
                )}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Derived automatically from completed subtasks.
            </p>
          </div>
        ) : effectiveIsSubtask ? (
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Subtask Status
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isDone}
                onClick={() => setIsWorking((v) => !v)}
                className={cn(
                  'flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-[13px] font-semibold border transition-colors cursor-pointer disabled:opacity-40',
                  isWorking && !isDone
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.08]',
                )}
              >
                <PlayCircle weight="duotone" className="w-4 h-4" />
                {isWorking && !isDone ? 'Working' : 'Mark Working'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !isDone;
                  setIsDone(next);
                  if (next) setIsWorking(false);
                }}
                className={cn(
                  'flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-[13px] font-semibold border transition-colors cursor-pointer',
                  isDone
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.08]',
                )}
              >
                <CheckCircle weight="duotone" className="w-4 h-4" />
                {isDone ? 'Completed' : 'Mark Done'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-4 rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.025]">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="task-progress-range"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Completion Progress
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={formData.progress === 100}
                  onClick={() => setIsWorking((v) => !v)}
                  className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer disabled:opacity-40',
                    isWorking && formData.progress < 100
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white dark:bg-white/[0.04] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/[0.08]',
                  )}
                >
                  <PlayCircle weight="duotone" className="w-3.5 h-3.5" />
                  {isWorking && formData.progress < 100 ? 'Working Now' : 'Mark Working'}
                </button>
                <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400 tabular-nums w-9 text-right">
                  {formData.progress}%
                </span>
              </div>
            </div>
            <input
              id="task-progress-range"
              type="range"
              name="progress"
              min={0}
              max={100}
              step={5}
              value={formData.progress}
              onChange={handleFieldChange}
              className="w-full accent-brand-600 dark:accent-brand-500 cursor-pointer"
            />
          </div>
        )}

        {/* Dependencies (2-column wide-screen layout for top-level tasks) */}
        {!effectiveIsSubtask && availableDependencies.length > 0 && (
          <div>
            <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Depends On
            </span>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {availableDependencies.map((candidate) => {
                const checked = formData.dependencies?.includes(candidate.id) ?? false;
                return (
                  <label
                    key={candidate.id}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer border',
                      checked
                        ? 'bg-brand-50/80 border-brand-200 text-slate-900 dark:bg-brand-500/15 dark:border-brand-400/25 dark:text-white'
                        : 'border-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06]',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleDependencyToggle(candidate.id)}
                      className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    />
                    <span className="truncate flex-1 font-medium">{candidate.name}</span>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      {candidate.end}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
