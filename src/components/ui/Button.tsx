import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import { cn } from '@/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-500 active:scale-[0.985] dark:bg-brand-500 dark:hover:bg-brand-400 shadow-brand-glow-sm hover:shadow-brand-glow border border-brand-500/50',
  secondary:
    'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 hover:border-slate-300 active:scale-[0.985] dark:bg-white/[0.04] dark:text-slate-200 dark:border-white/[0.1] dark:hover:bg-white/[0.08] dark:hover:border-white/[0.18] shadow-surface-sm',
  subtle:
    'bg-slate-100 text-slate-700 hover:bg-slate-200/80 active:scale-[0.985] dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.12] border border-transparent',
  ghost:
    'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.07] dark:hover:text-slate-100 border border-transparent',
  danger:
    'bg-rose-600 text-white hover:bg-rose-500 active:scale-[0.985] border border-rose-500/40 shadow-surface-sm',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs rounded-lg gap-1.5',
  sm: 'h-8 px-3 text-xs font-semibold rounded-lg gap-1.5',
  md: 'h-9 px-3.5 text-[13px] font-semibold rounded-lg gap-2',
  lg: 'h-11 px-5 text-sm font-semibold rounded-xl gap-2',
  icon: 'h-9 w-9 p-0 rounded-lg justify-center',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      disabled,
      leftIcon,
      rightIcon,
      className,
      children,
      type = 'button',
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap font-semibold transition-all duration-150 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-canvas-dark',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className,
        )}
        {...props}
      >
        {loading ? <CircleNotch className="w-4 h-4 animate-spin shrink-0" weight="bold" /> : leftIcon}
        {children}
        {!loading && rightIcon}
      </button>
    );
  },
);

Button.displayName = 'Button';
