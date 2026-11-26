import { useRef, useState } from 'react';
import {
  CaretUp,
  DownloadSimple,
  Plus,
  ShareNetwork,
  UploadSimple,
} from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { ExportMenu } from '@/components/workspace/ExportMenu';
import type { ExportFormat, Workspace } from '@/types';
import { cn } from '@/utils/cn';
import { SPRING_SNAPPY } from '@/utils/motion';

export interface FloatingActionDockProps {
  workspace: Workspace | null;
  onOpenShare: () => void;
  onOpenImport: () => void;
  onExport: (format: ExportFormat) => void;
  onAddTask: () => void;
}

export function FloatingActionDock({
  workspace,
  onOpenShare,
  onOpenImport,
  onExport,
  onAddTask,
}: FloatingActionDockProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportBtnRef = useRef<HTMLButtonElement | null>(null);
  const isShared = Boolean(workspace?.isShared && workspace.shareId);

  return (
    <div className="pointer-events-none fixed bottom-5 inset-x-0 z-40 hidden md:flex justify-center px-4">
      <motion.div
        role="toolbar"
        aria-label="Workspace actions"
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.96 }}
        transition={SPRING_SNAPPY}
        className={cn(
          'pointer-events-auto inline-flex items-center gap-1.5 p-1.5 rounded-full border backdrop-blur-xl',
          'bg-white/95 border-slate-200/95 shadow-[0_14px_40px_-8px_rgba(9,11,16,0.18),0_2px_8px_-2px_rgba(9,11,16,0.06)]',
          'dark:bg-surface-elevated/95 dark:border-white/[0.12] dark:shadow-[0_18px_48px_-8px_rgba(0,0,0,0.72),0_0_0_1px_rgba(255,255,255,0.04)]',
        )}
      >
        {/* Share */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          transition={SPRING_SNAPPY}
          onClick={onOpenShare}
          title="Share live read-only Gantt chart"
          className="relative inline-flex items-center gap-2 h-10 px-4 rounded-full text-xs sm:text-[13px] font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-100/90 dark:text-slate-200 dark:hover:text-white dark:hover:bg-white/[0.08] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <span className="relative flex items-center">
            <ShareNetwork
              className="w-[18px] h-[18px] text-brand-600 dark:text-brand-400"
              weight="duotone"
            />
            {isShared && (
              <span
                aria-label="Public link active"
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-surface-elevated"
              />
            )}
          </span>
          <span>{isShared ? 'Shared' : 'Share'}</span>
        </motion.button>

        {/* Import */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          transition={SPRING_SNAPPY}
          onClick={onOpenImport}
          title="Import tasks from JSON"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-full text-xs sm:text-[13px] font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-100/90 dark:text-slate-200 dark:hover:text-white dark:hover:bg-white/[0.08] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <UploadSimple
            className="w-[18px] h-[18px] text-brand-600 dark:text-brand-400"
            weight="duotone"
          />
          <span>Import</span>
        </motion.button>

        {/* Export (opens upward cleanly) */}
        <div className="relative">
          <motion.button
            ref={exportBtnRef}
            type="button"
            whileTap={{ scale: 0.96 }}
            transition={SPRING_SNAPPY}
            onClick={() => setExportOpen((v) => !v)}
            aria-expanded={exportOpen}
            aria-haspopup="menu"
            title="Export PDF, PNG, CSV, or JSON"
            className={cn(
              'inline-flex items-center gap-2 h-10 px-4 rounded-full text-xs sm:text-[13px] font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              exportOpen
                ? 'bg-slate-100 text-slate-950 dark:bg-white/[0.1] dark:text-white'
                : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100/90 dark:text-slate-200 dark:hover:text-white dark:hover:bg-white/[0.08]',
            )}
          >
            <DownloadSimple
              className="w-[18px] h-[18px] text-brand-600 dark:text-brand-400"
              weight="duotone"
            />
            <span>Export</span>
            <CaretUp
              weight="bold"
              className={cn(
                'w-3 h-3 opacity-60 transition-transform duration-150',
                exportOpen && 'rotate-180',
              )}
            />
          </motion.button>

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

        {/* Hairline Separator */}
        <span aria-hidden="true" className="h-6 w-px bg-slate-200 dark:bg-white/[0.1] mx-1" />

        {/* Primary New Task Pill CTA */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          transition={SPRING_SNAPPY}
          onClick={onAddTask}
          title="Add new task (N)"
          className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-brand-600 hover:bg-brand-500 dark:bg-brand-500 dark:hover:bg-brand-400 text-white text-xs sm:text-[13px] font-semibold shadow-brand-glow-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-surface-elevated"
        >
          <Plus className="w-4 h-4" weight="bold" />
          <span>New Task</span>
        </motion.button>
      </motion.div>
    </div>
  );
}
