import { useState, type RefObject } from 'react';
import { MagnifyingGlass, ShareNetwork, SignOut, X } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { WorkspaceSelector } from '@/components/workspace/WorkspaceSelector';
import { WorkspaceViewSwitcher } from '@/components/workspace/WorkspaceViewSwitcher';
import type { AuthUser, WorkspaceViewMode } from '@/types';
import { cn } from '@/utils/cn';
import { ProfileMenu } from './ProfileMenu';
import { ThemeToggle } from './ThemeToggle';
import { UserProfilePill } from './UserProfilePill';

export interface AppHeaderProps {
  user: AuthUser | null;
  searchTerm: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onSearchChange: (val: string) => void;
  onGoHome: () => void;
  onOpenSettings: () => void;
  onRequestLogout: () => void;
  activeView?: WorkspaceViewMode;
  onChangeView?: (view: WorkspaceViewMode) => void;
  isShared?: boolean;
  onOpenShare?: () => void;
}

export function AppHeader({
  user,
  searchTerm,
  searchInputRef,
  onSearchChange,
  onGoHome,
  onOpenSettings,
  onRequestLogout,
  activeView,
  onChangeView,
  isShared = false,
  onOpenShare,
}: AppHeaderProps) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const hasViewSwitcher = Boolean(activeView && onChangeView);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-white/[0.08] bg-white/90 dark:bg-[#090B10]/90 backdrop-blur-md">
      <div className="h-16 sm:h-[68px] px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3">
        {/* Left: Brand Logo + Direct Workspace Switcher */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onGoHome}
            title="All Workspaces"
            aria-label="Go to all workspaces"
            className="flex items-center gap-2.5 sm:gap-3 group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xl shrink-0"
          >
            <BrandLogo size="md" className="group-hover:scale-[1.04] transition-transform" />
            <span className="hidden sm:inline font-mono text-sm font-bold uppercase tracking-[0.2em] text-slate-900 dark:text-slate-100">
              SKED
            </span>
          </button>

          <span className="h-5 sm:h-6 w-px bg-slate-200 dark:bg-white/[0.1] shrink-0" />

          <div className="min-w-0">
            <WorkspaceSelector />
          </div>
        </div>

        {/* Center: View Switcher (md+) + Search */}
        <div className="flex items-center justify-center gap-3 flex-1 min-w-0">
          {activeView && onChangeView && (
            <WorkspaceViewSwitcher
              value={activeView}
              onChange={onChangeView}
              className="hidden md:inline-flex"
            />
          )}

          <div
            className={cn(
              'flex-1 min-w-0',
              hasViewSwitcher ? 'hidden xl:block max-w-xs' : 'hidden lg:block max-w-md mx-2',
            )}
          >
            <div className="relative">
              <MagnifyingGlass
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                weight="duotone"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search tasks... (/)"
                aria-label="Search tasks"
                className="w-full h-10 pl-10 pr-9 text-sm rounded-xl border border-slate-200/90 dark:border-white/[0.09] bg-slate-50/80 dark:bg-white/[0.04] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:bg-white dark:focus:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition"
              />
              {searchTerm && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => onSearchChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" weight="bold" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Search Toggle + Mobile Share + Mobile Profile Menu / Desktop Theme + Profile Pill + Sign Out */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setMobileSearchOpen((v) => !v)}
            aria-label="Toggle task search"
            className={cn(
              'inline-flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.08] cursor-pointer',
              hasViewSwitcher ? 'xl:hidden' : 'lg:hidden',
            )}
          >
            <MagnifyingGlass className="w-[18px] h-[18px]" weight="duotone" />
          </button>

          {onOpenShare && (
            <button
              type="button"
              onClick={onOpenShare}
              aria-label="Share workspace"
              title="Share live read-only link"
              className="md:hidden relative inline-flex items-center justify-center h-9 w-9 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.08] cursor-pointer"
            >
              <ShareNetwork className="w-[18px] h-[18px]" weight="duotone" />
              {isShared && (
                <span
                  aria-label="Public link active"
                  className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#090B10]"
                />
              )}
            </button>
          )}

          {user && (
            <ProfileMenu
              user={user}
              onGoHome={onGoHome}
              onOpenSettings={onOpenSettings}
              onRequestLogout={onRequestLogout}
              className="md:hidden"
            />
          )}

          <ThemeToggle className="hidden md:inline-flex" />

          {user && (
            <UserProfilePill
              user={user}
              onClick={onOpenSettings}
              hideDetailsBelow="md"
              className="hidden md:inline-flex"
            />
          )}

          <button
            type="button"
            onClick={onRequestLogout}
            aria-label="Sign out"
            title={user ? `Sign out (${user.email})` : 'Sign out'}
            className="hidden md:inline-flex items-center justify-center h-10 w-10 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-500/15 transition-colors cursor-pointer"
          >
            <SignOut className="w-5 h-5" weight="duotone" />
          </button>
        </div>
      </div>

      {/* Expandable Compact/Mobile Search Bar */}
      <AnimatePresence>
        {mobileSearchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={cn('overflow-hidden px-4 pb-3', hasViewSwitcher ? 'xl:hidden' : 'lg:hidden')}
          >
            <div className="relative">
              <MagnifyingGlass
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                weight="duotone"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search tasks..."
                autoFocus
                className="w-full h-10 pl-9 pr-9 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-canvas-dark text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => onSearchChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400"
                >
                  <X className="w-4 h-4" weight="bold" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
