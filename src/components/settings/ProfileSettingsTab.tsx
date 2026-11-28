import { useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  GlobeHemisphereWest,
  Trash,
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
      {/* Public Identity Rows */}
      <section>
        <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
          {/* Avatar & Live Shared Attribution Preview */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5 first:pt-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-brand-50 dark:bg-brand-500/20 border border-brand-200/80 dark:border-brand-400/30 text-brand-700 dark:text-brand-300 text-sm font-bold flex items-center justify-center shrink-0">
                {avatarInitial}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {previewName}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Public workspace profile
                </p>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200/80 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03] text-[11px] text-slate-600 dark:text-slate-300 self-start sm:self-center max-w-full">
              <GlobeHemisphereWest
                weight="duotone"
                className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400 shrink-0"
              />
              <span className="truncate">
                Shared by{' '}
                <strong className="font-semibold text-slate-900 dark:text-white">
                  {previewName}
                </strong>
              </span>
            </div>
          </div>

          {/* Account Email Row */}
          <div className="flex items-center justify-between gap-4 py-3.5">
            <span className="text-[13px] font-medium text-slate-900 dark:text-slate-100 shrink-0">
              Email
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
              {user.email}
            </span>
          </div>

          {/* Display Name Edit Row */}
          <form onSubmit={(e) => void handleSubmit(e)} className="py-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="settings-display-name"
                className="text-[13px] font-medium text-slate-900 dark:text-slate-100"
              >
                Display Name
              </label>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                {trimmedDraft.length}/60
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
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
                className="flex-1 h-9 px-3 text-[13px] rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas-dark text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                {isDirty && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
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
                  size="sm"
                  loading={saving}
                  disabled={!isDirty || saving}
                  leftIcon={<Check weight="bold" className="w-3.5 h-3.5" />}
                >
                  Save Name
                </Button>
              </div>
            </div>

            {fieldError ? (
              <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <WarningCircle weight="duotone" className="w-3.5 h-3.5 shrink-0" />
                {fieldError}
              </p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Shown as the &ldquo;Shared by&rdquo; name on public links and workspace headers.
                {sharedCount > 0 && (
                  <>
                    {' '}
                    Updates your{' '}
                    <strong className="font-medium text-slate-700 dark:text-slate-200">
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
      <section className="pt-2 border-t border-slate-100 dark:border-white/[0.07]">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-500/90 dark:text-rose-400/90 pb-2">
          Danger Zone
        </h4>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-rose-200/75 dark:border-rose-500/20 bg-rose-50/40 dark:bg-rose-500/[0.05]">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
              Delete Account
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
              Permanently erase your account, workspaces, tasks, Telegram link, and shares.
            </p>
          </div>
          <Button
            variant="danger"
            size="xs"
            className="shrink-0 self-start sm:self-center"
            onClick={onRequestDeleteAccount}
            leftIcon={<Trash weight="duotone" className="w-3.5 h-3.5" />}
          >
            Delete Account
          </Button>
        </div>
      </section>
    </div>
  );
}
