import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';
import { SPRING_SNAPPY } from '@/utils/motion';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  id?: string;
}

export function Switch({ checked, onChange, ariaLabel, disabled = false, id }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-surface-dark',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        checked ? 'bg-brand-600 dark:bg-brand-500' : 'bg-slate-300 dark:bg-white/15',
      )}
    >
      <motion.span
        layout
        transition={SPRING_SNAPPY}
        aria-hidden="true"
        className={cn(
          'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm',
          checked ? 'ml-auto' : 'mr-auto',
        )}
      />
    </button>
  );
}
