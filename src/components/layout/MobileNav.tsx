import { useRef, useState } from 'react';
import {
  ChartBarHorizontal,
  DownloadSimple,
  ListChecks,
  Plus,
  ShareNetwork,
} from '@phosphor-icons/react';
import { AnimatePresence } from 'framer-motion';
import { ExportMenu } from '@/components/workspace/ExportMenu';
import type { ExportFormat, Workspace } from '@/types';
import { cn } from '@/utils/cn';

export interface MobileBottomBarProps {
  workspace: Workspace | null;
  mobileView: 'chart' | 'list';
  onChangeView: (view: 'chart' | 'list') => void;
  onAddTask: () => void;
  onOpenShare: () => void;
  onExport: (format: ExportFormat) => void;
}

export function MobileBottomBar({
  workspace,
  mobileView,
  onChangeView,
  onAddTask,
  onOpenShare,
  onExport,
}: MobileBottomBarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportBtnRef = useRef<HTMLButtonElement | null>(null);
  const isShared = Boolean(workspace?.isShared && workspace.shareId);

  return (
    <nav
      aria-label="Mobile workspace navigation"
      className="fixed bottom-0 left-0 right-0 z-30 md:hidden border-t border-slate-200/90 dark:border-white/[0.08] bg-white/95 dark:bg-surface-dark/95 backdrop-blur-md safe-area-inset-bottom"
    >
      <div className="grid grid-cols-5 items-center px-1 py-1.5">
        <button
          type="button"
          onClick={() => onChangeView('chart')}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl text-[10px] font-semibold transition-colors cursor-pointer',
            mobileView === 'chart'
              ? 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/15'
              : 'text-slate-500 dark:text-slate-400',
          )}
        >
          <ChartBarHorizontal className="w-5 h-5" weight="duotone" />
          Timeline
        </button>

        <button
          type="button"
          onClick={() => onChangeView('list')}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl text-[10px] font-semibold transition-colors cursor-pointer',
            mobileView === 'list'
              ? 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/15'
              : 'text-slate-500 dark:text-slate-400',
          )}
        >
          <ListChecks className="w-5 h-5" weight="duotone" />
          Tasks
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
          onClick={onOpenShare}
          className="relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
        >
          <span className="relative">
            <ShareNetwork className="w-5 h-5" weight="duotone" />
            {isShared && (
              <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </span>
          Share
        </button>

        <div className="relative flex justify-center">
          <button
            ref={exportBtnRef}
            type="button"
            onClick={() => setExportOpen((v) => !v)}
            className="flex flex-col items-center justify-center gap-0.5 min-h-[44px] w-full rounded-xl text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <DownloadSimple className="w-5 h-5" weight="duotone" />
            Export
          </button>
          <AnimatePresence>
            {exportOpen && (
              <ExportMenu
                placement="top"
                triggerRef={exportBtnRef}
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
