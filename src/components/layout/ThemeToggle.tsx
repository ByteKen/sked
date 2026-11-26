import { MoonStars, SunDim } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { usePreferencesStore } from '@/store/preferencesStore';
import { cn } from '@/utils/cn';
import { SPRING_SNAPPY } from '@/utils/motion';

export function ThemeToggle({ className }: { className?: string }) {
  const theme = usePreferencesStore((s) => s.theme);
  const toggleTheme = usePreferencesStore((s) => s.toggleTheme);

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      transition={SPRING_SNAPPY}
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className={cn(
        'inline-flex items-center justify-center h-10 w-10 rounded-xl border transition-colors duration-150 cursor-pointer',
        'border-slate-200/90 bg-white text-brand-600 hover:bg-slate-50 hover:border-slate-300 shadow-surface-sm',
        'dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-brand-300 dark:hover:bg-white/[0.09] dark:hover:border-white/[0.18]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        className,
      )}
    >
      {theme === 'dark' ? (
        <SunDim className="w-5 h-5" weight="duotone" />
      ) : (
        <MoonStars className="w-5 h-5" weight="duotone" />
      )}
    </motion.button>
  );
}
