import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChartBarHorizontal,
  DownloadSimple,
  GearSix,
  House,
  ListChecks,
  Plus,
  ShareNetwork,
  SignOut,
  UploadSimple,
  X,
} from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { ExportMenu } from '@/components/workspace/ExportMenu';
import { WorkspaceSelector } from '@/components/workspace/WorkspaceSelector';
import type { AuthUser, ExportFormat, Workspace } from '@/types';
import { cn } from '@/utils/cn';
import { SPRING_MODAL } from '@/utils/motion';
import { ThemeToggle } from './ThemeToggle';

export interface MobileDrawerProps {
  isOpen: boolean;
  user: AuthUser | null;
  onClose: () => void;
  onGoHome: () => void;
  onOpenShare: () => void;
  onOpenImport: () => void;
  onOpenSettings: () => void;
  onRequestLogout: () => void;
}

export function MobileDrawer({
  isOpen,
  user,
  onClose,
  onGoHome,
  onOpenShare,
  onOpenImport,
  onOpenSettings,
  onRequestLogout,
}: MobileDrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={SPRING_MODAL}
            className="relative z-10 flex flex-col w-72 max-w-[85vw] h-full bg-white dark:bg-surface-dark border-r border-slate-200 dark:border-white/10 shadow-surface-lg"
          >
            <div className="flex items-center justify-between px-4 h-16 border-b border-slate-200/80 dark:border-white/[0.08] safe-area-inset-top">
              <div className="flex items-center gap-2.5">
                <BrandLogo size="sm" />
                <span className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-slate-900 dark:text-slate-100">
                  GANTT
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <ThemeToggle />
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close menu"
                  className="inline-flex items-center justify-center h-10 w-10 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.08] cursor-pointer"
                >
                  <X className="w-5 h-5" weight="bold" />
                </button>
              </div>
            </div>

            {user && (
              <div className="px-4 py-3 border-b border-slate-200/80 dark:border-white/[0.08]">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {user.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
              </div>
            )}

            <div className="p-4 border-b border-slate-200/80 dark:border-white/[0.08] space-y-2">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Active Workspace
              </p>
              <WorkspaceSelector />
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onGoHome();
                }}
                className="w-full flex items-center gap-3 px-3 h-11 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer"
              >
                <House className="w-[18px] h-[18px] text-brand-600 dark:text-brand-400" weight="duotone" />
                All Workspaces
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenShare();
                }}
                className="w-full flex items-center gap-3 px-3 h-11 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer"
              >
                <ShareNetwork
                  className="w-[18px] h-[18px] text-brand-600 dark:text-brand-400"
                  weight="duotone"
                />
                Share Gantt Chart
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenImport();
                }}
                className="w-full flex items-center gap-3 px-3 h-11 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer"
              >
                <UploadSimple
                  className="w-[18px] h-[18px] text-brand-600 dark:text-brand-400"
                  weight="duotone"
                />
                Import JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="w-full flex items-center gap-3 px-3 h-11 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer"
              >
                <GearSix
                  className="w-[18px] h-[18px] text-brand-600 dark:text-brand-400"
                  weight="duotone"
                />
                Display &amp; Export Settings
              </button>
            </div>

            <div className="p-3 border-t border-slate-200/80 dark:border-white/[0.08] space-y-2.5 safe-area-inset-bottom">
              <div className="flex items-center justify-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
                <Link to="/terms" onClick={onClose} className="hover:text-brand-600 dark:hover:text-brand-400">
                  Terms of Use
                </Link>
                <span className="opacity-40">·</span>
                <Link to="/privacy" onClick={onClose} className="hover:text-brand-600 dark:hover:text-brand-400">
                  Privacy Policy
                </Link>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRequestLogout();
                }}
                className="w-full flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 cursor-pointer"
              >
                <SignOut className="w-[18px] h-[18px]" weight="duotone" />
                Sign Out
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

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
