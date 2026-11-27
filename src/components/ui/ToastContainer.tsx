import { useEffect } from 'react';
import { CheckCircle, Info, Warning, WarningCircle, X } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useToastStore, type ToastItem, type ToastType } from '@/store/toastStore';
import { cn } from '@/utils/cn';
import { SPRING_SNAPPY } from '@/utils/motion';

const TOAST_STYLES: Record<
  ToastType,
  {
    icon: typeof CheckCircle;
    iconClass: string;
    barClass: string;
    borderClass: string;
  }
> = {
  success: {
    icon: CheckCircle,
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    barClass: 'bg-emerald-500',
    borderClass: 'border-emerald-200 dark:border-emerald-500/30',
  },
  error: {
    icon: WarningCircle,
    iconClass: 'text-rose-600 dark:text-rose-400',
    barClass: 'bg-rose-500',
    borderClass: 'border-rose-200 dark:border-rose-500/30',
  },
  warning: {
    icon: Warning,
    iconClass: 'text-amber-600 dark:text-amber-400',
    barClass: 'bg-amber-500',
    borderClass: 'border-amber-200 dark:border-amber-500/30',
  },
  info: {
    icon: Info,
    iconClass: 'text-brand-600 dark:text-brand-400',
    barClass: 'bg-brand-500',
    borderClass: 'border-brand-200 dark:border-brand-500/30',
  },
};

function ToastRow({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (item.duration <= 0) return;
    const timer = window.setTimeout(() => onDismiss(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [item.id, item.duration, onDismiss]);

  const style = TOAST_STYLES[item.type];
  const Icon = style.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 24, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.95 }}
      transition={SPRING_SNAPPY}
      role="status"
      className={cn(
        'relative overflow-hidden w-full max-w-sm rounded-xl border shadow-surface-lg dark:shadow-dark-lg',
        'bg-white dark:bg-surface-elevated',
        style.borderClass,
      )}
    >
      <div className="p-3.5 flex items-start gap-3">
        <Icon className={cn('w-5 h-5 mt-0.5 shrink-0', style.iconClass)} weight="duotone" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 leading-snug">
            {item.message}
          </p>
          {item.description && (
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {item.description}
            </p>
          )}
          {item.action && (
            <button
              type="button"
              onClick={() => {
                item.action?.onClick();
                onDismiss(item.id);
              }}
              className="mt-2 inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-white/[0.08] dark:hover:bg-white/[0.14] dark:text-slate-100 transition-colors cursor-pointer"
            >
              {item.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(item.id)}
          aria-label="Dismiss notification"
          className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" weight="bold" />
        </button>
      </div>
      {item.duration > 0 && (
        <div className="h-0.5 w-full bg-slate-100 dark:bg-white/5">
          <div
            className={cn('h-full animate-toast-progress', style.barClass)}
            style={{ animationDuration: `${item.duration}ms` }}
          />
        </div>
      )}
    </motion.div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);

  return (
    <div
      aria-live="polite"
      className="fixed bottom-[72px] md:bottom-4 right-4 z-[70] flex flex-col gap-2.5 w-[calc(100vw-2rem)] max-w-sm pointer-events-none"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((item) => (
          <div key={item.id} className="pointer-events-auto">
            <ToastRow item={item} onDismiss={dismissToast} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
