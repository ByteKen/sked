import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CaretDown,
  GearSix,
  House,
  MoonStars,
  SignOut,
  SunDim,
  UploadSimple,
} from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePreferencesStore } from '@/store/preferencesStore';
import type { AuthUser } from '@/types';
import { cn } from '@/utils/cn';
import { POPOVER_VARIANTS, SPRING_SNAPPY } from '@/utils/motion';

export interface ProfileMenuProps {
  user: AuthUser;
  onGoHome: () => void;
  onOpenSettings: () => void;
  onOpenImport?: () => void;
  onRequestLogout: () => void;
  className?: string;
}

export function ProfileMenu({
  user,
  onGoHome,
  onOpenSettings,
  onOpenImport,
  onRequestLogout,
  className,
}: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const theme = usePreferencesStore((s) => s.theme);
  const toggleTheme = usePreferencesStore((s) => s.toggleTheme);

  const initial = (user.name?.trim() || user.email?.trim() || 'U').charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        transition={SPRING_SNAPPY}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Open profile menu for ${user.name}`}
        className={cn(
          'inline-flex items-center gap-1 h-9 pl-1 pr-2 rounded-full border transition-colors cursor-pointer',
          'bg-slate-100/85 hover:bg-slate-200/75 border-slate-200/90',
          'dark:bg-white/[0.05] dark:hover:bg-white/[0.09] dark:border-white/[0.1]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        )}
      >
        <span className="w-7 h-7 rounded-full bg-brand-50 dark:bg-brand-500/20 border border-brand-200/90 dark:border-brand-400/30 text-brand-700 dark:text-brand-300 text-xs font-bold flex items-center justify-center shrink-0">
          {initial}
        </span>
        <CaretDown
          className={cn(
            'w-3 h-3 text-slate-500 dark:text-slate-400 transition-transform',
            open && 'rotate-180',
          )}
          weight="bold"
        />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            variants={POPOVER_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute right-0 top-full mt-2 z-50 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200/90 dark:border-white/[0.12] bg-white dark:bg-surface-elevated shadow-surface-lg dark:shadow-dark-lg overflow-hidden"
          >
            {/* Account Header */}
            <div className="px-4 py-3 border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.02]">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {user.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
            </div>

            {/* Menu Actions */}
            <div className="p-1.5 space-y-0.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onOpenSettings();
                }}
                className="w-full flex items-center gap-2.5 px-3 h-10 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer text-left"
              >
                <GearSix
                  className="w-[18px] h-[18px] text-brand-600 dark:text-brand-400 shrink-0"
                  weight="duotone"
                />
                Settings &amp; Alerts
              </button>

              {onOpenImport && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onOpenImport();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 h-10 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer text-left"
                >
                  <UploadSimple
                    className="w-[18px] h-[18px] text-brand-600 dark:text-brand-400 shrink-0"
                    weight="duotone"
                  />
                  Import JSON
                </button>
              )}

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onGoHome();
                }}
                className="w-full flex items-center gap-2.5 px-3 h-10 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer text-left"
              >
                <House
                  className="w-[18px] h-[18px] text-brand-600 dark:text-brand-400 shrink-0"
                  weight="duotone"
                />
                All Workspaces
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={toggleTheme}
                className="w-full flex items-center justify-between gap-2.5 px-3 h-10 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer text-left"
              >
                <span className="flex items-center gap-2.5">
                  {theme === 'dark' ? (
                    <SunDim
                      className="w-[18px] h-[18px] text-brand-600 dark:text-brand-400 shrink-0"
                      weight="duotone"
                    />
                  ) : (
                    <MoonStars
                      className="w-[18px] h-[18px] text-brand-600 dark:text-brand-400 shrink-0"
                      weight="duotone"
                    />
                  )}
                  Theme
                </span>
                <span className="font-mono text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {theme === 'dark' ? 'Dark' : 'Light'}
                </span>
              </button>
            </div>

            {/* Footer: Legal + Sign Out */}
            <div className="p-2 border-t border-slate-200/80 dark:border-white/[0.08] space-y-2 bg-slate-50/50 dark:bg-white/[0.015]">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onRequestLogout();
                }}
                className="w-full flex items-center justify-center gap-2 h-9 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors cursor-pointer"
              >
                <SignOut className="w-4 h-4" weight="duotone" />
                Sign Out
              </button>

              <div className="flex items-center justify-center gap-3 pb-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                <Link
                  to="/terms"
                  onClick={() => setOpen(false)}
                  className="hover:text-brand-600 dark:hover:text-brand-400"
                >
                  Terms
                </Link>
                <span className="opacity-40">·</span>
                <Link
                  to="/privacy"
                  onClick={() => setOpen(false)}
                  className="hover:text-brand-600 dark:hover:text-brand-400"
                >
                  Privacy
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
