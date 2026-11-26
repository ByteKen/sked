import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/utils/cn';
import { SPRING_MODAL } from '@/utils/motion';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  subHeader?: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  footer?: ReactNode;
  children: ReactNode;
}

const MAX_WIDTH_MAP: Record<NonNullable<ModalProps['maxWidth']>, string> = {
  sm: 'max-w-md sm:max-w-[480px]',
  md: 'max-w-xl sm:max-w-[600px]',
  lg: 'max-w-2xl lg:max-w-[760px]',
  xl: 'max-w-3xl lg:max-w-[880px]',
  '2xl': 'max-w-4xl lg:max-w-[980px]',
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  icon,
  subHeader,
  maxWidth = 'md',
  footer,
  children,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const titleId = `modal-title-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 md:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-[4px]"
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={SPRING_MODAL}
            className={cn(
              'relative z-10 w-full flex flex-col max-h-[90vh] rounded-2xl overflow-hidden',
              'bg-white border border-slate-200/90 shadow-surface-lg',
              'dark:bg-surface-dark dark:border-white/[0.11] dark:shadow-dark-lg dark:ring-1 dark:ring-inset dark:ring-white/[0.04]',
              MAX_WIDTH_MAP[maxWidth],
            )}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-6 sm:px-7 py-5 border-b border-slate-200/80 dark:border-white/[0.08] shrink-0">
              <div className="flex items-center gap-3.5 min-w-0">
                {icon && <div className="shrink-0">{icon}</div>}
                <div className="min-w-0">
                  <h2
                    id={titleId}
                    className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 truncate"
                  >
                    {title}
                  </h2>
                  {description && (
                    <p className="text-xs sm:text-[13px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {description}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="inline-flex items-center justify-center h-9 w-9 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X className="w-[18px] h-[18px]" weight="bold" />
              </button>
            </div>

            {/* Optional Pinned Sub-Header (e.g. Tabs) */}
            {subHeader && (
              <div className="px-6 sm:px-7 py-2.5 border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.02] shrink-0">
                {subHeader}
              </div>
            )}

            {/* Body */}
            <div className="overflow-y-auto flex-1">{children}</div>

            {/* Optional Footer */}
            {footer && (
              <div className="px-6 sm:px-7 py-4 border-t border-slate-200/80 dark:border-white/[0.08] bg-slate-50/75 dark:bg-white/[0.025] shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
