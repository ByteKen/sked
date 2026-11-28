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
  /** Render children directly as the full modal surface (e.g., split-pane Settings layout). */
  hideHeader?: boolean;
  panelClassName?: string;
  children: ReactNode;
}

/**
 * Industry-standard modal width scale:
 * - sm (400px): confirmations & quick alerts
 * - md (480px): focused forms, share, agenda & detail dialogs
 * - lg (560px): rich multi-field forms (e.g., Task editor)
 * - xl (660px): structured data / JSON import dialogs
 * - 2xl (740px): split-pane sidebar dialogs (e.g., Settings)
 */
const MAX_WIDTH_MAP: Record<NonNullable<ModalProps['maxWidth']>, string> = {
  sm: 'max-w-[400px]',
  md: 'max-w-[480px]',
  lg: 'max-w-[560px]',
  xl: 'max-w-[660px]',
  '2xl': 'max-w-[740px]',
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
  hideHeader = false,
  panelClassName,
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

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  const titleId = `modal-title-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-3.5 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-[6px]"
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.965, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.965, y: 6 }}
            transition={SPRING_MODAL}
            className={cn(
              'relative z-10 w-full flex flex-col max-h-[86vh] rounded-[20px] overflow-hidden',
              'bg-white border border-slate-200/85 shadow-[0_24px_64px_-16px_rgba(15,23,42,0.24)] ring-1 ring-slate-950/[0.04]',
              'dark:bg-surface-dark dark:border-white/[0.1] dark:shadow-[0_28px_72px_-16px_rgba(0,0,0,0.72)] dark:ring-1 dark:ring-inset dark:ring-white/[0.05]',
              MAX_WIDTH_MAP[maxWidth],
              panelClassName,
            )}
          >
            {hideHeader ? (
              <>
                <h2 id={titleId} className="sr-only">
                  {title}
                </h2>
                {children}
              </>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-white/[0.07] shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    {icon && <div className="shrink-0">{icon}</div>}
                    <div className="min-w-0">
                      <h2
                        id={titleId}
                        className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-50 truncate leading-snug"
                      >
                        {title}
                      </h2>
                      {description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {description}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close modal"
                    className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <X className="w-4 h-4" weight="bold" />
                  </button>
                </div>

                {/* Optional Pinned Sub-Header */}
                {subHeader && (
                  <div className="px-5 sm:px-6 py-2.5 border-b border-slate-100 dark:border-white/[0.07] bg-slate-50/70 dark:bg-white/[0.02] shrink-0">
                    {subHeader}
                  </div>
                )}

                {/* Body */}
                <div className="overflow-y-auto flex-1">{children}</div>

                {/* Optional Footer */}
                {footer && (
                  <div className="px-5 sm:px-6 py-3.5 border-t border-slate-100 dark:border-white/[0.07] bg-slate-50/65 dark:bg-white/[0.02] shrink-0">
                    {footer}
                  </div>
                )}
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
