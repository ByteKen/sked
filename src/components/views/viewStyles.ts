import type { DueUrgency } from '@/domain/taskViews';
import type { TaskStatus } from '@/types';

export const VIEW_STATUS_STYLES: Record<
  TaskStatus,
  {
    dot: string;
    pill: string;
    selectBg: string;
    columnTint: string;
    columnDropRing: string;
    progressBar: string;
  }
> = {
  'not-started': {
    dot: 'bg-slate-400 dark:bg-slate-500',
    pill: 'bg-slate-100 text-slate-700 border-slate-200/90 dark:bg-white/[0.07] dark:text-slate-200 dark:border-white/[0.1]',
    selectBg:
      'bg-slate-100 text-slate-700 border-slate-200/90 hover:border-slate-300 dark:bg-white/[0.07] dark:text-slate-200 dark:border-white/[0.12]',
    columnTint: 'bg-slate-50/90 dark:bg-white/[0.02]',
    columnDropRing: 'ring-2 ring-slate-400/70 bg-slate-100/70 dark:bg-white/[0.05]',
    progressBar: 'bg-slate-400',
  },
  working: {
    dot: 'bg-amber-500',
    pill: 'bg-amber-50 text-amber-800 border-amber-200/90 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/25',
    selectBg:
      'bg-amber-50 text-amber-800 border-amber-200/90 hover:border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/30',
    columnTint: 'bg-amber-50/35 dark:bg-amber-500/[0.03]',
    columnDropRing: 'ring-2 ring-amber-400/80 bg-amber-50/75 dark:bg-amber-500/[0.08]',
    progressBar: 'bg-amber-500',
  },
  'in-progress': {
    dot: 'bg-brand-500',
    pill: 'bg-brand-50 text-brand-700 border-brand-200/90 dark:bg-brand-500/15 dark:text-brand-300 dark:border-brand-400/25',
    selectBg:
      'bg-brand-50 text-brand-700 border-brand-200/90 hover:border-brand-300 dark:bg-brand-500/15 dark:text-brand-300 dark:border-brand-400/30',
    columnTint: 'bg-brand-50/35 dark:bg-brand-500/[0.03]',
    columnDropRing: 'ring-2 ring-brand-500/80 bg-brand-50/75 dark:bg-brand-500/[0.08]',
    progressBar: 'bg-brand-500',
  },
  completed: {
    dot: 'bg-emerald-500',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200/90 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/25',
    selectBg:
      'bg-emerald-50 text-emerald-700 border-emerald-200/90 hover:border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/30',
    columnTint: 'bg-emerald-50/35 dark:bg-emerald-500/[0.03]',
    columnDropRing: 'ring-2 ring-emerald-500/80 bg-emerald-50/75 dark:bg-emerald-500/[0.08]',
    progressBar: 'bg-emerald-500',
  },
};

export function getUrgencyBadge(
  urgency: DueUrgency,
  daysUntilDue: number,
): { label: string; className: string } | null {
  if (urgency === 'overdue') {
    const days = Math.abs(daysUntilDue);
    return {
      label: `${days}d overdue`,
      className:
        'bg-rose-100 text-rose-700 border-rose-200/80 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30',
    };
  }
  if (urgency === 'today') {
    return {
      label: 'Due today',
      className:
        'bg-amber-100 text-amber-800 border-amber-200/80 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/30',
    };
  }
  if (urgency === 'soon') {
    return {
      label: `Due in ${daysUntilDue}d`,
      className:
        'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/25',
    };
  }
  return null;
}
