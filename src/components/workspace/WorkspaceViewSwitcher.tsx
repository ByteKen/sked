import { ChartBarHorizontal, Kanban, ListBullets } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import type { WorkspaceViewMode } from '@/types';
import { cn } from '@/utils/cn';
import { SPRING_SNAPPY } from '@/utils/motion';

const VIEW_OPTIONS: Array<{
  value: WorkspaceViewMode;
  label: string;
  shortcut: string;
  icon: typeof ChartBarHorizontal;
}> = [
  { value: 'timeline', label: 'Timeline', shortcut: '1', icon: ChartBarHorizontal },
  { value: 'board', label: 'Board', shortcut: '2', icon: Kanban },
  { value: 'list', label: 'List', shortcut: '3', icon: ListBullets },
];

export interface WorkspaceViewSwitcherProps {
  value: WorkspaceViewMode;
  onChange: (view: WorkspaceViewMode) => void;
  layoutId?: string;
  className?: string;
}

export function WorkspaceViewSwitcher({
  value,
  onChange,
  layoutId = 'workspace-view-active-pill',
  className,
}: WorkspaceViewSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Workspace view"
      className={cn(
        'inline-flex items-center p-1 rounded-xl bg-slate-100/95 dark:bg-white/[0.05] border border-slate-200/90 dark:border-white/[0.08] shrink-0',
        className,
      )}
    >
      {VIEW_OPTIONS.map((opt) => {
        const active = value === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={`${opt.label} view (${opt.shortcut})`}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              active
                ? 'text-slate-900 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={SPRING_SNAPPY}
                className="absolute inset-0 rounded-lg bg-white dark:bg-surface-elevated border border-slate-200/90 dark:border-white/[0.12] shadow-surface-sm"
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              <Icon
                weight="duotone"
                className={cn(
                  'w-4 h-4 shrink-0',
                  active
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-400 dark:text-slate-500',
                )}
              />
              <span>{opt.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
