import { motion } from 'framer-motion';
import type { AuthUser } from '@/types';
import { cn } from '@/utils/cn';
import { SPRING_SNAPPY } from '@/utils/motion';

export interface UserProfilePillProps {
  user: AuthUser;
  onClick: () => void;
  className?: string;
  hideDetailsBelow?: 'sm' | 'md' | 'xl';
}

export function UserProfilePill({
  user,
  onClick,
  className,
  hideDetailsBelow = 'sm',
}: UserProfilePillProps) {
  const initial = (user.name?.trim() || user.email?.trim() || 'U').charAt(0).toUpperCase();

  const detailsVisibility =
    hideDetailsBelow === 'xl'
      ? 'hidden xl:block'
      : hideDetailsBelow === 'md'
        ? 'hidden md:block'
        : 'hidden sm:block';

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      transition={SPRING_SNAPPY}
      onClick={onClick}
      aria-label={`Account and display settings for ${user.name}`}
      title="Display, export & account settings"
      className={cn(
        'group inline-flex items-center gap-2.5 h-11 p-1.5 rounded-full border transition-colors cursor-pointer text-left',
        hideDetailsBelow === 'xl'
          ? 'xl:pr-4'
          : hideDetailsBelow === 'md'
            ? 'md:pr-4'
            : 'sm:pr-4',
        'bg-slate-100/85 hover:bg-slate-200/75 border-slate-200/85 hover:border-slate-300/90',
        'dark:bg-white/[0.045] dark:hover:bg-white/[0.085] dark:border-white/[0.09] dark:hover:border-white/[0.16]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        className,
      )}
    >
      <span className="w-8 h-8 rounded-full bg-brand-50 dark:bg-brand-500/20 border border-brand-200/90 dark:border-brand-400/30 text-brand-700 dark:text-brand-300 text-xs font-bold flex items-center justify-center shrink-0">
        {initial}
      </span>

      <span className={cn('min-w-0 leading-tight', detailsVisibility)}>
        <span className="block text-xs sm:text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[180px]">
          {user.name}
        </span>
        <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[190px]">
          {user.email}
        </span>
      </span>
    </motion.button>
  );
}
