import { Question, SignOut, Trash, Warning, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/utils/cn';

export type ConfirmationType = 'danger' | 'warning' | 'info' | 'delete' | 'logout';

const TYPE_CONFIG: Record<
  ConfirmationType,
  {
    icon: typeof WarningCircle;
    iconBg: string;
    iconColor: string;
    confirmVariant: 'danger' | 'primary';
  }
> = {
  danger: {
    icon: WarningCircle,
    iconBg: 'bg-rose-50 border border-rose-200/80 dark:bg-rose-500/15 dark:border-rose-500/25',
    iconColor: 'text-rose-600 dark:text-rose-400',
    confirmVariant: 'danger',
  },
  delete: {
    icon: Trash,
    iconBg: 'bg-rose-50 border border-rose-200/80 dark:bg-rose-500/15 dark:border-rose-500/25',
    iconColor: 'text-rose-600 dark:text-rose-400',
    confirmVariant: 'danger',
  },
  warning: {
    icon: Warning,
    iconBg: 'bg-amber-50 border border-amber-200/80 dark:bg-amber-500/15 dark:border-amber-500/25',
    iconColor: 'text-amber-600 dark:text-amber-400',
    confirmVariant: 'primary',
  },
  logout: {
    icon: SignOut,
    iconBg: 'bg-brand-500/10 border border-brand-500/20',
    iconColor: 'text-brand-600 dark:text-brand-400',
    confirmVariant: 'primary',
  },
  info: {
    icon: Question,
    iconBg: 'bg-brand-500/10 border border-brand-500/20',
    iconColor: 'text-brand-600 dark:text-brand-400',
    confirmVariant: 'primary',
  },
};

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmationType;
  loading?: boolean;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger',
  loading = false,
}: ConfirmationModalProps) {
  const cfg = TYPE_CONFIG[type];
  const Icon = cfg.icon;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="sm"
      icon={
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', cfg.iconBg)}>
          <Icon weight="duotone" className={cn('w-4 h-4', cfg.iconColor)} />
        </div>
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={cfg.confirmVariant}
            size="sm"
            loading={loading}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </Button>
        </div>
      }
    >
      <div className="px-5 sm:px-6 py-4">
        <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">
          {message}
        </p>
      </div>
    </Modal>
  );
}
