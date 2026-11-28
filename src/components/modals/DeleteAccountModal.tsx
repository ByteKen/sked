import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldWarning, Trash, WarningCircle, WarningOctagon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

export interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}

export function DeleteAccountModal({ isOpen, onClose, onDeleted }: DeleteAccountModalProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  const [confirmationText, setConfirmationText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const workspaceList = Object.values(workspaces);
  const sharedCount = workspaceList.filter((w) => w.isShared && w.shareId).length;
  const isConfirmed = confirmationText.trim().toUpperCase() === 'DELETE';

  const handleClose = () => {
    if (deleting) return;
    setConfirmationText('');
    setErrorMessage(null);
    onClose();
  };

  const handleDelete = async () => {
    if (!isConfirmed || deleting) return;
    setDeleting(true);
    setErrorMessage(null);

    const result = await deleteAccount();
    setDeleting(false);

    if (result.ok) {
      setConfirmationText('');
      onDeleted?.();
      onClose();
      toast.info('Account deleted', 'Your workspaces, public share links, and profile were permanently removed.');
      navigate('/', { replace: true });
      return;
    }

    if (result.cancelled) {
      toast.info('Deletion cancelled', 'Your account and workspaces remain intact.');
      return;
    }

    setErrorMessage(result.error || 'Could not delete your account. Please try again.');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Delete Account Permanently"
      description="This action cannot be undone and erases all cloud data"
      maxWidth="md"
      icon={
        <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200/80 dark:bg-rose-500/15 dark:border-rose-500/25 flex items-center justify-center">
          <WarningOctagon weight="duotone" className="w-4 h-4 text-rose-600 dark:text-rose-400" />
        </div>
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={handleClose} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={deleting}
            disabled={!isConfirmed || deleting}
            onClick={() => void handleDelete()}
            leftIcon={<Trash weight="duotone" className="w-3.5 h-3.5" />}
          >
            Permanently Delete Account
          </Button>
        </div>
      }
    >
      <div className="p-5 sm:p-6 space-y-4">
        {user && (
          <div className="p-4 rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.025] flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {user.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
            </div>
            <div className="text-right shrink-0 font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
              <p>
                {workspaceList.length} {workspaceList.length === 1 ? 'workspace' : 'workspaces'}
              </p>
              {sharedCount > 0 && (
                <p className="text-rose-600 dark:text-rose-400">
                  {sharedCount} live {sharedCount === 1 ? 'share link' : 'share links'}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="p-4 rounded-xl border border-rose-200/90 dark:border-rose-500/25 bg-rose-50/70 dark:bg-rose-500/[0.07] space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
            <ShieldWarning weight="duotone" className="w-4 h-4" />
            What will be permanently deleted
          </div>
          <ul className="space-y-1.5 text-xs sm:text-[13px] text-rose-900/90 dark:text-rose-200/90 list-disc pl-5">
            <li>All workspaces, tasks, nested subtasks, dates, and dependencies.</li>
            <li>All public read-only share links will be immediately invalidated.</li>
            <li>Your Sked account record and synced display preferences.</li>
          </ul>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          For your security, Google will open a quick confirmation popup to re-verify your identity
          before any data is deleted. Need a copy first? Export JSON backups of your workspaces
          before proceeding.
        </p>

        <div>
          <label
            htmlFor="delete-account-confirm"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2"
          >
            Type <span className="font-mono font-bold text-rose-600 dark:text-rose-400">DELETE</span>{' '}
            to confirm
          </label>
          <input
            id="delete-account-confirm"
            type="text"
            value={confirmationText}
            onChange={(e) => {
              setConfirmationText(e.target.value);
              setErrorMessage(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isConfirmed) void handleDelete();
            }}
            placeholder="DELETE"
            autoComplete="off"
            disabled={deleting}
            className="w-full h-10 px-3.5 font-mono text-[13px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas-dark text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition"
          />
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3.5 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10"
          >
            <WarningCircle weight="duotone" className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <p className="text-xs font-medium text-rose-700 dark:text-rose-200">{errorMessage}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
