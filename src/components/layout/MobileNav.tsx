import { useRef, useState } from 'react';
import {
  ArrowsDownUp,
  ChartBarHorizontal,
  Kanban,
  ListBullets,
  Plus,
} from '@phosphor-icons/react';
import { AnimatePresence } from 'framer-motion';
import { ExportMenu } from '@/components/workspace/ExportMenu';
import type { ExportFormat, WorkspaceViewMode } from '@/types';
import { cn } from '@/utils/cn';

export interface MobileBottomBarProps {
  activeView: WorkspaceViewMode;
  onChangeView: (view: WorkspaceViewMode) => void;
  onAddTask: () => void;
  onOpenImport: () => void;
  onExport: (format: ExportFormat) => void;
}

export function MobileBottomBar({
  activeView,
  onChangeView,
  onAddTask,
  onOpenImport,
  onExport,
}: MobileBottomBarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportBtnRef = useRef<HTMLButtonElement | null>(null);

  return (
    <nav
      aria-label="Mobile workspace navigation"
      className="fixed bottom-0 left-0 right-0 z-30 md:hidden border-t border-slate-200/90 dark:border-white/[0.08] bg-white/95 dark:bg-surface-dark/95 backdrop-blur-md safe-area-inset-bottom"
    >
      <div className="grid grid-cols-5 items-center px-1 py-1.5">
        <button
          type="button"
          onClick={() => onChangeView('timeline')}
          aria-pressed={activeView === 'timeline'}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl text-[10px] font-semibold transition-colors cursor-pointer',
            activeView === 'timeline'
              ? 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/15'
              : 'text-slate-500 dark:text-slate-400',
          )}
        >
          <ChartBarHorizontal className="w-5 h-5" weight="duotone" />
          Timeline
        </button>

        <button
          type="button"
          onClick={() => onChangeView('board')}
          aria-pressed={activeView === 'board'}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl text-[10px] font-semibold transition-colors cursor-pointer',
            activeView === 'board'
              ? 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/15'
              : 'text-slate-500 dark:text-slate-400',
          )}
        >
          <Kanban className="w-5 h-5" weight="duotone" />
          Board
        </button>

        <button
          type="button"
          onClick={onAddTask}
          aria-label="Create new task"
          className="flex flex-col items-center justify-center min-h-[44px] cursor-pointer"
        >
          <span className="w-11 h-11 rounded-full bg-brand-600 dark:bg-brand-500 text-white shadow-brand-glow-sm flex items-center justify-center active:scale-95 transition-transform">
            <Plus className="w-5 h-5" weight="bold" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => onChangeView('list')}
          aria-pressed={activeView === 'list'}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl text-[10px] font-semibold transition-colors cursor-pointer',
            activeView === 'list'
              ? 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/15'
              : 'text-slate-500 dark:text-slate-400',
          )}
        >
          <ListBullets className="w-5 h-5" weight="duotone" />
          List
        </button>

        <div className="relative flex justify-center">
          <button
            ref={exportBtnRef}
            type="button"
            onClick={() => setExportOpen((v) => !v)}
            aria-label="Import or export tasks"
            aria-expanded={exportOpen}
            aria-haspopup="menu"
            className="flex flex-col items-center justify-center gap-0.5 min-h-[44px] w-full rounded-xl text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <ArrowsDownUp className="w-5 h-5" weight="duotone" />
            <span className="whitespace-nowrap tracking-tight">Import/Export</span>
          </button>
          <AnimatePresence>
            {exportOpen && (
              <ExportMenu
                placement="top"
                triggerRef={exportBtnRef}
                onImport={onOpenImport}
                onSelect={onExport}
                onClose={() => setExportOpen(false)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </nav>
  );
}
