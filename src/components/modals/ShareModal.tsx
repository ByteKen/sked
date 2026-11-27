import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowSquareOut,
  ArrowsClockwise,
  Check,
  Copy,
  GlobeHemisphereWest,
  LockKey,
  ShareNetwork,
  UserPlus,
  UsersThree,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import {
  MAX_EDITORS_PER_WORKSPACE,
  normalizeEditorEmails,
  validateEditorEmailInput,
} from '@/domain/collaboration';
import { buildShareUrl } from '@/services/shareRepository';
import { useAuthStore } from '@/store/authStore';
import { useGanttStore } from '@/store/ganttStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { toast } from '@/store/toastStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Task, Workspace } from '@/types';
import { STUDIO_EASE } from '@/utils/motion';

export interface ShareModalProps {
  isOpen: boolean;
  workspace: Workspace | null;
  tasksOverride?: readonly Task[];
  onClose: () => void;
}

export function ShareModal({ isOpen, workspace, tasksOverride, onClose }: ShareModalProps) {
  const user = useAuthStore((s) => s.user);
  const storeTasks = useGanttStore((s) => s.tasks);
  const getPreferencesSnapshot = usePreferencesStore((s) => s.getPreferencesSnapshot);
  const enableSharing = useWorkspaceStore((s) => s.enableSharing);
  const disableSharing = useWorkspaceStore((s) => s.disableSharing);
  const regenerateSharing = useWorkspaceStore((s) => s.regenerateSharing);
  const updateWorkspaceEditors = useWorkspaceStore((s) => s.updateWorkspaceEditors);

  const [busy, setBusy] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [updatingEditors, setUpdatingEditors] = useState(false);
  const [copied, setCopied] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  if (!workspace) return null;

  const isShared = Boolean(workspace.isShared && workspace.shareId);
  const shareUrl = workspace.shareId ? buildShareUrl(workspace.shareId) : '';
  const tasksToShare = tasksOverride ?? storeTasks;
  const ownerName = user?.name || user?.email || 'Workspace Owner';
  const editorEmails = normalizeEditorEmails(workspace.editorEmails);

  const handleToggleShare = async (nextEnabled: boolean) => {
    setBusy(true);
    try {
      if (nextEnabled) {
        const updated = await enableSharing(
          workspace.id,
          tasksToShare,
          getPreferencesSnapshot(),
          ownerName,
        );
        if (updated?.shareId) {
          toast.success('Public link enabled', 'Anyone with the link can now view this chart live.');
        }
      } else {
        await disableSharing(workspace.id);
        toast.info(
          'Sharing disabled',
          editorEmails.length > 0
            ? 'Public link and collaborator edit access have been revoked.'
            : 'Previously shared URLs are no longer accessible.',
        );
      }
    } catch (err) {
      console.error('Failed to toggle sharing:', err);
      toast.error(
        'Could not update share settings',
        'Verify that your Firestore rules allow writes to sharedCharts.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const updated = await regenerateSharing(
        workspace.id,
        tasksToShare,
        getPreferencesSnapshot(),
        ownerName,
      );
      if (updated?.shareId) {
        toast.success('Share link regenerated', 'The old link has been permanently invalidated.');
      }
    } catch (err) {
      console.error('Failed to regenerate link:', err);
      toast.error('Failed to regenerate link', 'Please try again.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleInviteEditor = async (e: FormEvent) => {
    e.preventDefault();
    setEmailError(null);

    const validation = validateEditorEmailInput(emailInput, editorEmails, user?.email);
    if (!validation.valid) {
      setEmailError(validation.error);
      return;
    }

    setUpdatingEditors(true);
    try {
      const nextEmails = [...editorEmails, validation.email];
      await updateWorkspaceEditors(
        workspace.id,
        tasksToShare,
        getPreferencesSnapshot(),
        ownerName,
        nextEmails,
      );
      setEmailInput('');
      toast.success(
        'Editor invited',
        `${validation.email} can now edit live via the share link or Shared with me.`,
      );
    } catch (err) {
      console.error('Failed to invite editor:', err);
      toast.error(
        'Could not invite editor',
        'Make sure your updated Firestore rules are deployed.',
      );
    } finally {
      setUpdatingEditors(false);
    }
  };

  const handleRemoveEditor = async (emailToRemove: string) => {
    setUpdatingEditors(true);
    setEmailError(null);
    try {
      const nextEmails = editorEmails.filter((email) => email !== emailToRemove);
      await updateWorkspaceEditors(
        workspace.id,
        tasksToShare,
        getPreferencesSnapshot(),
        ownerName,
        nextEmails,
      );
      toast.info('Editor removed', emailToRemove);
    } catch (err) {
      console.error('Failed to remove editor:', err);
      toast.error('Could not remove editor', 'Please try again.');
    } finally {
      setUpdatingEditors(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed', 'Select the URL field and copy manually.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Share & Collaborate"
      description={workspace.title}
      maxWidth="md"
      icon={
        <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
          <ShareNetwork weight="duotone" className="w-5 h-5 text-brand-600 dark:text-brand-400" />
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Shared as{' '}
            <strong className="font-semibold text-slate-700 dark:text-slate-200">
              {ownerName}
            </strong>{' '}
            · edit in Settings → Profile
          </span>
          <Button variant="primary" size="md" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="p-6 sm:p-7 space-y-5">
        {/* Public Read-Only Toggle Card */}
        <div className="flex items-center justify-between gap-4 p-4 sm:p-5 rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.025]">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="mt-0.5 shrink-0">
              {isShared ? (
                <GlobeHemisphereWest
                  weight="duotone"
                  className="w-6 h-6 text-brand-600 dark:text-brand-400"
                />
              ) : (
                <LockKey weight="duotone" className="w-6 h-6 text-slate-400 dark:text-slate-500" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Public Read-Only Link
                </p>
                {isShared && (
                  <Badge variant="brand">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                    Live
                  </Badge>
                )}
              </div>
              <p className="text-xs sm:text-[13px] text-slate-500 dark:text-slate-400 mt-1">
                {isShared
                  ? 'Anyone with the link can view updates live without signing in. Only invited editors can make changes.'
                  : 'Only you can access this workspace right now.'}
              </p>
            </div>
          </div>

          <Switch
            checked={isShared}
            disabled={busy || regenerating || updatingEditors}
            onChange={(checked) => void handleToggleShare(checked)}
            ariaLabel="Toggle public read-only link"
          />
        </div>

        {/* Share Link Field & Actions */}
        <AnimatePresence initial={false}>
          {isShared && shareUrl && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: STUDIO_EASE }}
              className="overflow-hidden"
            >
              <div className="space-y-3 pt-0.5">
                <div>
                  <label
                    htmlFor="share-link-url"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2"
                  >
                    Shareable URL
                  </label>
                  <div className="flex items-center gap-2.5">
                    <input
                      id="share-link-url"
                      type="text"
                      readOnly
                      value={shareUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 h-11 px-3.5 text-xs sm:text-[13px] font-mono rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-canvas-dark text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <Button
                      variant={copied ? 'primary' : 'secondary'}
                      size="md"
                      className="h-11 px-4"
                      onClick={() => void handleCopy()}
                      leftIcon={
                        copied ? (
                          <Check weight="bold" className="w-4 h-4" />
                        ) : (
                          <Copy weight="duotone" className="w-4 h-4" />
                        )
                      }
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs sm:text-[13px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
                  >
                    <ArrowSquareOut weight="duotone" className="w-4 h-4" />
                    Open shared link
                  </a>

                  <Button
                    variant="ghost"
                    size="sm"
                    loading={regenerating}
                    disabled={busy || updatingEditors}
                    onClick={() => void handleRegenerate()}
                    leftIcon={<ArrowsClockwise weight="duotone" className="w-4 h-4" />}
                  >
                    Regenerate link
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Invited Editors Section */}
        <div className="pt-4 border-t border-slate-200/80 dark:border-white/[0.08] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <UsersThree
                weight="duotone"
                className="w-4 h-4 text-brand-600 dark:text-brand-400"
              />
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Invited Editors
              </h3>
            </div>
            <span className="font-mono text-[11px] font-semibold text-slate-400 tabular-nums">
              {editorEmails.length} / {MAX_EDITORS_PER_WORKSPACE}
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Invite specific Google accounts to edit this project live across Timeline, Board, and
            List views. Invited editors see it automatically under{' '}
            <strong className="font-semibold text-slate-700 dark:text-slate-200">
              Shared with me
            </strong>{' '}
            after signing in.
          </p>

          <form onSubmit={(e) => void handleInviteEditor(e)} className="flex items-center gap-2">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value);
                setEmailError(null);
              }}
              placeholder="teammate@gmail.com"
              aria-label="Collaborator Google email"
              disabled={updatingEditors || busy}
              className="flex-1 h-10 px-3.5 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas-dark text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <Button
              type="submit"
              variant="secondary"
              size="md"
              className="h-10 shrink-0"
              loading={updatingEditors}
              disabled={busy || regenerating || editorEmails.length >= MAX_EDITORS_PER_WORKSPACE}
              leftIcon={<UserPlus weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />}
            >
              Invite
            </Button>
          </form>

          {emailError && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <WarningCircle weight="duotone" className="w-3.5 h-3.5 shrink-0" />
              {emailError}
            </p>
          )}

          {editorEmails.length > 0 && (
            <ul
              aria-label="Invited editors list"
              className="divide-y divide-slate-100 dark:divide-white/[0.06] rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.02] overflow-hidden"
            >
              {editorEmails.map((email) => (
                <li
                  key={email}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-slate-800 dark:text-slate-100 truncate">
                      {email}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 text-[10px] font-semibold shrink-0">
                      Editor
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={updatingEditors}
                    onClick={() => void handleRemoveEditor(email)}
                    aria-label={`Remove ${email}`}
                    className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-500/15 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <X weight="bold" className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
