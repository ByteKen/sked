import { useMemo, useState } from 'react';
import {
  ArrowSquareOut,
  BellRinging,
  Check,
  Clock,
  Copy,
  GlobeHemisphereWest,
  LinkBreak,
  PaperPlaneTilt,
  TelegramLogo,
} from '@phosphor-icons/react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import {
  createTelegramLink,
  disconnectTelegram,
  sendTelegramTestNotification,
  updateTelegramSettings,
} from '@/services/telegramService';
import { usePreferencesStore } from '@/store/preferencesStore';
import { toast } from '@/store/toastStore';
import { AVAILABLE_REMINDER_OFFSETS, DEFAULT_REMINDER_OFFSETS } from '@/types';
import { cn } from '@/utils/cn';

const COMMON_TIMEZONES = [
  'Asia/Manila',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
];

const HOURS = Array.from({ length: 24 }, (_, h) => {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { value: h, label: `${hour12}:00 ${suffix}` };
});

function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function formatOffsetLabel(days: number): string {
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day before';
  return `${days} days before`;
}

export interface TelegramSettingsSectionProps {
  embedded?: boolean;
}

export function TelegramSettingsSection({ embedded = false }: TelegramSettingsSectionProps) {
  const telegram = usePreferencesStore((s) => s.telegram);
  const browserTz = useMemo(() => detectBrowserTimezone(), []);

  const [connecting, setConnecting] = useState(false);
  const [pendingLink, setPendingLink] = useState<{ deepLink: string; botUsername: string } | null>(
    null,
  );
  const [copiedLink, setCopiedLink] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const timezoneOptions = useMemo(() => {
    const set = new Set<string>([browserTz, ...COMMON_TIMEZONES]);
    if (telegram?.timezone) set.add(telegram.timezone);
    return Array.from(set);
  }, [browserTz, telegram?.timezone]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const result = await createTelegramLink({
        timezone: browserTz,
        reminderHour: 9,
        reminderOffsets: DEFAULT_REMINDER_OFFSETS,
        includeOverdue: true,
      });
      setPendingLink({ deepLink: result.deepLink, botUsername: result.botUsername });
      window.open(result.deepLink, '_blank', 'noopener,noreferrer');
      toast.info(
        'Finish connecting in Telegram',
        `Tap Start inside @${result.botUsername} to link your deadlines.`,
      );
    } catch (err) {
      toast.error(
        'Could not start Telegram link',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!pendingLink) return;
    try {
      await navigator.clipboard.writeText(pendingLink.deepLink);
      setCopiedLink(true);
      toast.success('Telegram connect link copied');
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleUpdate = async (patch: {
    enabled?: boolean;
    timezone?: string;
    reminderHour?: number;
    reminderOffsets?: number[];
    includeOverdue?: boolean;
  }) => {
    setSaving(true);
    try {
      await updateTelegramSettings(patch);
    } catch (err) {
      toast.error(
        'Failed to save Telegram settings',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleOffset = (dayOffset: number) => {
    if (!telegram) return;
    const current = telegram.reminderOffsets;
    const exists = current.includes(dayOffset);
    if (exists && current.length === 1) {
      toast.info('Keep at least one reminder timing active');
      return;
    }
    const next = exists
      ? current.filter((d) => d !== dayOffset)
      : [...current, dayOffset].sort((a, b) => b - a);
    void handleUpdate({ reminderOffsets: next });
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await sendTelegramTestNotification();
      toast.success('Test alert sent', 'Check your Telegram chat for the confirmation message.');
    } catch (err) {
      toast.error(
        'Test notification failed',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectTelegram();
      setPendingLink(null);
      toast.info('Telegram disconnected', 'You will no longer receive Telegram deadline alerts.');
    } catch (err) {
      toast.error(
        'Could not disconnect Telegram',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setDisconnecting(false);
    }
  };

  const connectedHandle = telegram?.username
    ? `@${telegram.username}`
    : telegram?.firstName || 'Telegram Chat';

  return (
    <section
      className={cn(
        'space-y-3',
        !embedded && 'pt-2 border-t border-slate-200/80 dark:border-white/[0.08]',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
          Telegram Deadline Alerts
        </h3>
        {telegram?.connected && (
          <Badge variant={telegram.enabled ? 'emerald' : 'neutral'}>
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                telegram.enabled ? 'bg-emerald-500' : 'bg-slate-400',
              )}
            />
            {telegram.enabled ? `Connected · ${connectedHandle}` : `Paused · ${connectedHandle}`}
          </Badge>
        )}
      </div>

      {!telegram?.connected ? (
        <div className="p-4 sm:p-5 rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.025] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <TelegramLogo
                  weight="duotone"
                  className="w-5 h-5 text-brand-600 dark:text-brand-400"
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Upcoming Deadline Reminders via Telegram
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Get timezone-aware deadline reminders and manage tasks right from Telegram with{' '}
                  <code className="font-mono">/tasks</code>,{' '}
                  <code className="font-mono">/today</code>,{' '}
                  <code className="font-mono">/upcoming</code>, and{' '}
                  <code className="font-mono">/summary</code>.
                </p>
              </div>
            </div>

            <Button
              variant="primary"
              size="sm"
              loading={connecting}
              onClick={() => void handleConnect()}
              className="shrink-0 self-start sm:self-center"
              leftIcon={<TelegramLogo weight="duotone" className="w-4 h-4" />}
            >
              Connect Telegram
            </Button>
          </div>

          {pendingLink && (
            <div className="p-3.5 rounded-xl border border-brand-200/80 dark:border-brand-400/25 bg-brand-50/60 dark:bg-brand-500/10 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  Waiting for you to tap <span className="font-mono">Start</span> in @
                  {pendingLink.botUsername}...
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => void handleCopyLink()}
                    leftIcon={
                      copiedLink ? (
                        <Check weight="bold" className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy weight="duotone" className="w-3.5 h-3.5" />
                      )
                    }
                  >
                    {copiedLink ? 'Copied' : 'Copy Link'}
                  </Button>
                  <a
                    href={pendingLink.deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                  >
                    Open Bot
                    <ArrowSquareOut weight="duotone" className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                This panel updates automatically the moment you tap Start in Telegram (link expires
                in 15 minutes).
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 sm:p-5 rounded-xl border border-slate-200/90 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.025] space-y-4">
          {/* Enable / Pause Row */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <BellRinging
                weight="duotone"
                className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Enable Deadline Reminders
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Delivered to {connectedHandle} across all of your workspaces
                </p>
              </div>
            </div>
            <Switch
              checked={telegram.enabled}
              disabled={saving}
              onChange={(next) => void handleUpdate({ enabled: next })}
              ariaLabel="Toggle Telegram deadline reminders"
            />
          </div>

          {/* Reminder Offsets Chips */}
          <div className="space-y-2 pt-2 border-t border-slate-200/70 dark:border-white/[0.06]">
            <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Notify Me When Deadlines Are
            </span>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_REMINDER_OFFSETS.map((days) => {
                const active = telegram.reminderOffsets.includes(days);
                return (
                  <button
                    key={days}
                    type="button"
                    disabled={saving}
                    onClick={() => handleToggleOffset(days)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-60',
                      active
                        ? 'bg-brand-600 text-white border-brand-500 shadow-brand-glow-sm dark:bg-brand-500'
                        : 'bg-white dark:bg-surface-dark text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-brand-300 dark:hover:border-brand-400/40',
                    )}
                  >
                    {formatOffsetLabel(days)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Overdue + Timezone + Delivery Hour */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div>
              <label
                htmlFor="telegram-timezone"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                <GlobeHemisphereWest
                  weight="duotone"
                  className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400"
                />
                Timezone (for exact day math)
              </label>
              <select
                id="telegram-timezone"
                value={telegram.timezone}
                disabled={saving}
                onChange={(e) => void handleUpdate({ timezone: e.target.value })}
                className="w-full h-10 px-3 text-xs font-mono rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-surface-dark text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {timezoneOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="telegram-hour"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                <Clock weight="duotone" className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                Preferred Local Hour (Hourly Cron)
              </label>
              <select
                id="telegram-hour"
                value={telegram.reminderHour}
                disabled={saving}
                onChange={(e) => void handleUpdate({ reminderHour: Number(e.target.value) })}
                className="w-full h-10 px-3 text-xs font-mono rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-surface-dark text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {HOURS.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Also alert once if a task becomes 1 day overdue
            </span>
            <Switch
              checked={telegram.includeOverdue}
              disabled={saving}
              onChange={(next) => void handleUpdate({ includeOverdue: next })}
              ariaLabel="Toggle overdue reminder alert"
            />
          </div>

          {/* Interactive Bot Commands Hint */}
          <div className="p-3 rounded-lg bg-white/80 dark:bg-surface-dark/60 border border-slate-200/70 dark:border-white/[0.06] text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            <span className="font-semibold text-slate-800 dark:text-slate-200">Bot commands:</span>{' '}
            <code className="font-mono text-brand-600 dark:text-brand-400">/tasks</code> browse &amp;
            mark done · <code className="font-mono text-brand-600 dark:text-brand-400">/today</code>{' '}
            urgent items ·{' '}
            <code className="font-mono text-brand-600 dark:text-brand-400">/upcoming</code> next 14d ·{' '}
            <code className="font-mono text-brand-600 dark:text-brand-400">/summary</code> overview
          </div>

          {/* Actions Row */}
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200/70 dark:border-white/[0.06] flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              loading={testing}
              onClick={() => void handleTest()}
              leftIcon={
                <PaperPlaneTilt
                  weight="duotone"
                  className="w-4 h-4 text-brand-600 dark:text-brand-400"
                />
              }
            >
              Send Test Alert
            </Button>

            <Button
              variant="ghost"
              size="sm"
              loading={disconnecting}
              onClick={() => void handleDisconnect()}
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/15"
              leftIcon={<LinkBreak weight="duotone" className="w-4 h-4" />}
            >
              Disconnect
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
