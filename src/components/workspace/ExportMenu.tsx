import { useEffect, useRef, type RefObject } from 'react';
import { FileCode, FileCsv, FilePdf, ImageSquare } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import type { ExportFormat } from '@/types';
import { cn } from '@/utils/cn';
import { POPOVER_VARIANTS } from '@/utils/motion';

const EXPORT_ITEMS: Array<{
  format: ExportFormat;
  label: string;
  description: string;
  icon: typeof FilePdf;
}> = [
  {
    format: 'pdf',
    label: 'Export PDF',
    description: 'Print-ready landscape document',
    icon: FilePdf,
  },
  {
    format: 'png',
    label: 'Export PNG Image',
    description: 'High-resolution 2x chart snapshot',
    icon: ImageSquare,
  },
  {
    format: 'csv',
    label: 'Export CSV',
    description: 'Spreadsheet-compatible task table',
    icon: FileCsv,
  },
  {
    format: 'json',
    label: 'Export JSON',
    description: 'Full backup for re-importing',
    icon: FileCode,
  },
];

export interface ExportMenuProps {
  onSelect: (format: ExportFormat) => void;
  onClose: () => void;
  placement?: 'bottom' | 'top';
  triggerRef?: RefObject<HTMLElement | null>;
}

export function ExportMenu({
  onSelect,
  onClose,
  placement = 'bottom',
  triggerRef,
}: ExportMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef?.current?.contains(target)) {
        return;
      }
      onClose();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, triggerRef]);

  return (
    <motion.div
      ref={menuRef}
      variants={POPOVER_VARIANTS}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="menu"
      aria-label="Export options"
      className={cn(
        'absolute right-0 z-50 w-[272px] rounded-xl border p-1.5 shadow-surface-lg dark:shadow-dark-lg',
        'bg-white border-slate-200/90 dark:bg-surface-elevated dark:border-white/[0.12]',
        placement === 'top' ? 'bottom-full mb-2.5' : 'top-full mt-2',
      )}
    >
      {EXPORT_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.format}
            type="button"
            role="menuitem"
            onClick={() => {
              onSelect(item.format);
              onClose();
            }}
            className="w-full flex items-start gap-3 px-2.5 py-2 rounded-lg text-left hover:bg-slate-100/90 dark:hover:bg-white/[0.06] transition-colors cursor-pointer group"
          >
            <Icon
              className="w-[18px] h-[18px] mt-0.5 shrink-0 text-brand-600 dark:text-brand-400"
              weight="duotone"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {item.label}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {item.description}
              </p>
            </div>
          </button>
        );
      })}
    </motion.div>
  );
}
