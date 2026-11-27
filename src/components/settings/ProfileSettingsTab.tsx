import { useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  GlobeHemisphereWest,
  Trash,
  UserCircle,
  WarningCircle,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { validateDisplayName } from '@/domain/validation';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

export interface ProfileSettingsTabProps {
  onRequestDeleteAccount: () => void;
}

export function ProfileSettingsTab({ onRequestDeleteAccount }: ProfileSettingsTabProps) {
  const user = useAuthStore((s) => s.user);
  const updateDisplayName = useAuthStore((s) => s.updateDisplayName);
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  const [draftName, setDraftName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const sharedCount = useMemo(
    () => Object.values(workspaces).filter((ws) => Boolean(ws?.isShared && ws.shareId)).length,
    [workspaces],
  );

  if (!user) return null;

  const trimmedDraft = draftName.trim();
  const previewName = trimmedDraft || user.name || user.email || 'Workspace Owner';
  const avatarInitial = previewName.charAt(0).toUpperCase();
  const isDirty = trimmedDraft !== user.name.trim();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationError = validateDisplayName(draftName);
    if (validationError) {
      setFieldError(validationError);
      return;
    }

    setSaving(true);
    setFieldError(null);
    try {
      const result = await updateDisplayName(trimmedDraft);
      if (result.ok) {
        const shareNote =
          result.syncedSharesCount && result.syncedSharesCount > 0
            ? `Updated "${result.name}" across ${result.syncedSharesCount} shared ${result.syncedSharesCount === 1 ? 'link' : 'links'}.`
            : `Public shares will now show "Shared by ${result.name}".`;
        toast.success('Profile name updated', shareNote);
      } else {
        setFieldError(result.error ?? 'Could not update display name.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Live Profile & Shared Attribution Preview */}
      <section className="space-y-3">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
          Public Identity
        </h3>

        <div className="p-4 sm:p-5 rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.025] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-white/[0.07]">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-500/20 border border-brand-200/90 dark:border-brand-400/30 text-brand-700 dark:text-brand-300 text-lg font-bold flex items-center justify-center shrink-0">
                {avatarInitial}
              </div>
              <div className="min-w-0">
                <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  {previewName}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-200/80 dark:border-brand-400/25 bg-white dark:bg-surface-dark text-xs text-slate-600 dark:text-slate-300 self-start sm:self-center max-w-full">
              <GlobeHemisphereWest
                weight="duotone"
                className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0"
              />
              <span className="truncate">
                Shared by <strong className="font-semibold text-slate-900 dark:text-white">{previewName}</strong>
              </span>
            </div>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="settings-display-name"
                className="text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                Display Name
              </label>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                {trimmedDraft.length}/60
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                id="settings-display-name"
                type="text"
                value={draftName}
                maxLength={60}
                onChange={(e) => {
                  setDraftName(e.target.value);
                  if (fieldError) setFieldError(null);
                }}
                placeholder="e.g., Alex Rivera or Product Team"
                className="flex-1 h-11 px-3.5 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas-dark text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <div className="flex items-center gap-2 shrink-0">
                {isDirty && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    disabled={saving}
                    onClick={() => {
                      setDraftName(user.name);
                      setFieldError(null);
                    }}
                  >
                    Reset
                  </Button>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={saving}
                  disabled={!isDirty || saving}
                  leftIcon={<Check weight="bold" className="w-4 h-4" />}
                >
                  Save Name
                </Button>
              </div>
            </div>

            {fieldError ? (
              <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <WarningCircle weight="duotone" className="w-4 h-4 shrink-0" />
                {fieldError}
              </p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Shown as the &ldquo;Shared by&rdquo; name on public Sked links and across your
                workspace header.
                {sharedCount > 0 && (
                  <>
                    {' '}
                    Saving updates your{' '}
                    <strong className="font-semibold text-slate-700 dark:text-slate-200">
                      {sharedCount} active shared {sharedCount === 1 ? 'chart' : 'charts'}
                    </strong>{' '}
                    automatically.
                  </>
                )}
              </p>
            )}
          </form>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="space-y-3 pt-2 border-t border-slate-200/80 dark:border-white/[0.08]">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
          Danger Zone
        </h3>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-rose-200/80 dark:border-rose-500/20 bg-rose-50/45 dark:bg-rose-500/[0.05]">
          <div className="flex items-center gap-3 min-w-0">
            <UserCircle weight="duotone" className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                Delete Account
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Permanently erase your account, workspaces, tasks, Telegram link, and public shares.
              </p>
            </div>
          </div>
          <Button
            variant="danger"
            size="sm"
            className="shrink-0 self-start sm:self-center"
            onClick={onRequestDeleteAccount}
            leftIcon={<Trash weight="duotone" className="w-4 h-4" />}
          >
            Delete Account
          </Button>
        </div>
      </section>
    </div>
  );
}
