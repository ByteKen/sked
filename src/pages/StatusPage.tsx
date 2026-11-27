import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowClockwise,
  ArrowLeft,
  ChartBar,
  CheckCircle,
  Clock,
  CloudCheck,
  Database,
  PaperPlaneTilt,
  Pulse,
  WarningCircle,
} from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { AppFooter } from '@/components/layout/AppFooter';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { BrandLogo } from '@/components/ui/BrandLogo';
import {
  formatQuotaLimitShort,
  formatResetCountdown,
  formatStorageBytes,
  formatStoragePercent,
  type QuotaHealthLevel,
  type QuotaMetricKey,
  type QuotaMetricReport,
  type SystemStatusResponse,
} from '@/domain/systemStatus';
import { fetchSystemStatus } from '@/services/statusService';
import { cn } from '@/utils/cn';
import { FADE_UP_ITEM, STAGGER_CONTAINER, STUDIO_EASE } from '@/utils/motion';

const LEVEL_STYLES: Record<
  QuotaHealthLevel,
  {
    badge: string;
    dot: string;
    bar: string;
    headline: string;
  }
> = {
  operational: {
    badge:
      'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/25',
    dot: 'bg-emerald-500',
    bar: 'bg-brand-600 dark:bg-brand-400',
    headline: 'All Systems Operational',
  },
  elevated: {
    badge:
      'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/25',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500 dark:bg-amber-400',
    headline: 'Elevated Quota Usage',
  },
  critical: {
    badge:
      'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-400/25',
    dot: 'bg-rose-500',
    bar: 'bg-rose-500 dark:bg-rose-400',
    headline: 'Approaching Spark Limit',
  },
};

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatCheckedTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function StatusPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeChartMetric, setActiveChartMetric] = useState<QuotaMetricKey>('reads');
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSystemStatus()
      .then((data) => {
        if (cancelled) return;
        setStatus(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unable to load system status.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Update reset countdown every minute
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const data = await fetchSystemStatus({ forceRefresh: true });
      setStatus(data);
      setNowMs(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh system status.');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  const orderedMetrics: QuotaMetricReport[] = useMemo(() => {
    if (!status) return [];
    return [status.metrics.writes, status.metrics.reads, status.metrics.deletes];
  }, [status]);

  const activeMetricReport = status ? status.metrics[activeChartMetric] : null;
  const maxDailyChartValue = useMemo(() => {
    if (!activeMetricReport) return 1;
    return Math.max(1, ...activeMetricReport.daily7d.map((d) => d.count));
  }, [activeMetricReport]);

  const overallStyle =
    (status ? LEVEL_STYLES[status.overallLevel] : undefined) ?? LEVEL_STYLES.operational;

  return (
    <div className="min-h-screen flex flex-col studio-atmosphere relative overflow-x-clip">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 studio-dot-grid opacity-55 dark:opacity-35"
      />

      {/* Sticky Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-white/[0.08] bg-white/85 dark:bg-[#090B10]/85 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 h-16 sm:h-[68px] flex items-center justify-between gap-4">
          <Link
            to="/"
            className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xl"
          >
            <BrandLogo size="md" className="group-hover:scale-[1.04] transition-transform" />
            <span className="font-mono text-sm sm:text-[15px] font-bold uppercase tracking-[0.2em] text-slate-900 dark:text-slate-100">
              SKED
            </span>
          </Link>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-xs sm:text-sm font-semibold border border-slate-200/90 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <ArrowLeft weight="bold" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span>Back to Workspaces</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-5xl w-full mx-auto px-5 sm:px-8 py-10 sm:py-14">
        <motion.div variants={STAGGER_CONTAINER} initial="hidden" animate="visible" className="space-y-8">
          {/* Editorial Title + Overall Status + Refresh */}
          <motion.div
            variants={FADE_UP_ITEM}
            className="flex flex-col sm:flex-row sm:items-end justify-between gap-5"
          >
            <div>
              <div className="inline-flex items-center gap-2 mb-3">
                <span
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold',
                    status?.services.monitoring === 'unavailable'
                      ? 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/25'
                      : overallStyle.badge,
                  )}
                >
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      status?.services.monitoring === 'unavailable'
                        ? 'bg-amber-500'
                        : overallStyle.dot,
                    )}
                  />
                  {loading
                    ? 'Checking live metrics...'
                    : status?.services.monitoring === 'unavailable'
                      ? 'Metrics Temporarily Unavailable'
                      : overallStyle.headline}
                </span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-bold tracking-[-0.03em] text-slate-900 dark:text-white leading-tight">
                System{' '}
                <span className="font-serif-editorial italic font-normal text-[38px] sm:text-[56px] text-brand-600 dark:text-brand-400">
                  Status
                </span>
              </h1>
              <p className="mt-2.5 text-sm text-slate-600 dark:text-slate-400 max-w-xl">
                Live shared Cloud Firestore Spark-plan daily capacity across Sked and service
                health. Daily limits reset at midnight Pacific Time.
              </p>
            </div>

            <div className="flex items-center gap-3 self-start sm:self-end">
              {status && (
                <div className="text-right hidden sm:block">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                    Resets in
                  </p>
                  <p className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                    {formatResetCountdown(status.resetAtISO, nowMs)}
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing || loading}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-xs sm:text-sm font-semibold border border-slate-200/90 dark:border-white/[0.1] bg-white dark:bg-surface-elevated text-slate-700 dark:text-slate-200 hover:border-brand-300 dark:hover:border-brand-400/40 shadow-surface-sm transition-colors cursor-pointer disabled:opacity-60"
              >
                <ArrowClockwise
                  weight="bold"
                  className={cn('w-4 h-4 text-brand-600 dark:text-brand-400', refreshing && 'animate-spin')}
                />
                <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>
          </motion.div>

          {/* Error Banner */}
          {error && (
            <motion.div
              variants={FADE_UP_ITEM}
              role="alert"
              className="rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/90 dark:bg-rose-500/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <WarningCircle
                  weight="duotone"
                  className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                    Unable to load live quota metrics
                  </p>
                  <p className="text-xs text-rose-700 dark:text-rose-300/90 leading-relaxed">
                    {error}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleRefresh()}
                className="shrink-0 px-3.5 py-2 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors cursor-pointer self-start sm:self-center"
              >
                Try Again
              </button>
            </motion.div>
          )}

          {/* Partial Monitoring Warning (API reachable, Monitoring IAM/API issue) */}
          {status?.warning && (
            <motion.div
              variants={FADE_UP_ITEM}
              role="status"
              className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/90 dark:bg-amber-500/10 p-4 flex items-start gap-3"
            >
              <WarningCircle
                weight="duotone"
                className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
              />
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  Cloud Monitoring API notice
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">
                  {status.warning}
                </p>
              </div>
            </motion.div>
          )}

          {/* Loading Skeleton */}
          {loading && !status && (
            <div className="rounded-2xl border border-slate-200/90 dark:border-white/[0.09] bg-white/90 dark:bg-surface-dark/90 p-6 sm:p-8 space-y-6 animate-pulse">
              <div className="h-5 w-44 rounded bg-slate-200 dark:bg-white/10" />
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2.5 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
                  <div className="flex justify-between">
                    <div className="h-4 w-24 rounded bg-slate-200 dark:bg-white/10" />
                    <div className="h-4 w-32 rounded bg-slate-200 dark:bg-white/10" />
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-white/10" />
                </div>
              ))}
            </div>
          )}

          {/* Project Quotas Card (Firebase Spark Plan) */}
          {status && (
            <>
              <motion.section
                variants={FADE_UP_ITEM}
                aria-label="Project quotas"
                className="rounded-2xl border border-slate-200/90 dark:border-white/[0.09] bg-white/90 dark:bg-surface-dark/90 shadow-surface-md dark:shadow-dark-md overflow-hidden"
              >
                <div className="px-6 py-5 border-b border-slate-200/80 dark:border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
                      <Database weight="duotone" className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-bold text-slate-900 dark:text-white">
                          Platform Quotas
                        </h2>
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">
                          Cloud Firestore · {status.databaseId}
                        </span>
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                          Spark Plan
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Shared free-tier daily operations cap across all Sked workspaces. Sync
                        pauses until reset if a daily limit is reached.
                      </p>
                    </div>
                  </div>

                  <div className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                    <Clock weight="duotone" className="w-3.5 h-3.5 text-brand-500" />
                    <span>
                      Updated {formatCheckedTime(status.checkedAtISO)}
                      {status.cached ? ' · cached' : ''}
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-slate-200/80 dark:divide-white/[0.07]">
                  {orderedMetrics.map((metric) => {
                    const barWidth = Math.min(100, Math.max(metric.usedToday > 0 ? 1.5 : 0, metric.percentUsed));
                    const style = LEVEL_STYLES[metric.level];

                    return (
                      <div
                        key={metric.key}
                        data-testid={`quota-row-${metric.key}`}
                        className="px-6 py-5 grid grid-cols-1 md:grid-cols-[150px_190px_minmax(0,1fr)] items-center gap-3 md:gap-6"
                      >
                        <div className="flex items-center justify-between md:block">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {metric.label}
                          </p>
                          <p className="md:hidden font-mono text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                            {metric.percentUsed}% of limit used
                          </p>
                        </div>

                        <div className="hidden md:flex items-baseline gap-1.5">
                          <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
                            {metric.percentUsed}%
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            of limit used
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                            <span className="font-semibold text-slate-800 dark:text-slate-100">
                              {formatNumber(metric.usedToday)}
                            </span>
                            <span className="text-slate-500 dark:text-slate-400">
                              {formatQuotaLimitShort(metric.limit)} / day
                            </span>
                          </div>

                          <div
                            role="progressbar"
                            aria-label={`${metric.label} quota usage`}
                            aria-valuenow={metric.percentUsed}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            className="h-2.5 w-full rounded-full bg-slate-200/85 dark:bg-white/[0.08] overflow-hidden"
                          >
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${barWidth}%` }}
                              transition={{ duration: 0.55, ease: STUDIO_EASE }}
                              className={cn('h-full rounded-full', style.bar)}
                            />
                          </div>

                          <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <ChartBar weight="duotone" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            {metric.isTodayPeak ? (
                              <span className="italic">Highest daily usage in the last 7 days</span>
                            ) : metric.peak7d > 0 ? (
                              <span>
                                7-day peak:{' '}
                                <strong className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                                  {formatNumber(metric.peak7d)}
                                </strong>
                              </span>
                            ) : (
                              <span>No operations recorded in the last 7 days</span>
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {/* Database + Index Storage Row (1 GiB Spark total cap) */}
                  {status.storage && (
                    <div
                      data-testid="quota-row-storage"
                      className="px-6 py-5 grid grid-cols-1 md:grid-cols-[150px_190px_minmax(0,1fr)] items-center gap-3 md:gap-6"
                    >
                      <div className="flex items-center justify-between md:block">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Storage
                        </p>
                        <p className="md:hidden font-mono text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                          {formatStoragePercent(
                            status.storage.percentUsed,
                            status.storage.usedBytes,
                          )}{' '}
                          of limit used
                        </p>
                      </div>

                      <div className="hidden md:flex items-baseline gap-1.5">
                        <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
                          {formatStoragePercent(
                            status.storage.percentUsed,
                            status.storage.usedBytes,
                          )}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          of limit used
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                          <span className="font-semibold text-slate-800 dark:text-slate-100">
                            {formatStorageBytes(status.storage.usedBytes)}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            1 GiB total
                          </span>
                        </div>

                        <div
                          role="progressbar"
                          aria-label="Database storage quota usage"
                          aria-valuenow={status.storage.percentUsed}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          className="h-2.5 w-full rounded-full bg-slate-200/85 dark:bg-white/[0.08] overflow-hidden"
                        >
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${Math.min(100, Math.max(status.storage.usedBytes > 0 ? 1.5 : 0, status.storage.percentUsed))}%`,
                            }}
                            transition={{ duration: 0.55, ease: STUDIO_EASE }}
                            className={cn(
                              'h-full rounded-full',
                              (LEVEL_STYLES[status.storage.level] ?? LEVEL_STYLES.operational).bar,
                            )}
                          />
                        </div>

                        <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                          <Database weight="duotone" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>Total documents and indexes stored (cumulative, does not reset daily)</span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-6 py-3.5 bg-slate-50/80 dark:bg-white/[0.02] border-t border-slate-200/80 dark:border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>
                    Spark monthly outbound bandwidth allowance:{' '}
                    <strong className="text-slate-700 dark:text-slate-300">10 GiB / month</strong>
                  </span>
                  <span className="font-mono">
                    Next daily reset in {formatResetCountdown(status.resetAtISO, nowMs)} (00:00 PT)
                  </span>
                </div>
              </motion.section>

              {/* 7-Day Daily Trend + Service Health Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
                {/* 7-Day Daily Usage Breakdown */}
                {activeMetricReport && (
                  <motion.section
                    variants={FADE_UP_ITEM}
                    aria-label="7-day usage trend"
                    className="rounded-2xl border border-slate-200/90 dark:border-white/[0.09] bg-white/90 dark:bg-surface-dark/90 shadow-surface-md dark:shadow-dark-md p-6 space-y-5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                          Last 7 Days · {activeMetricReport.label}
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Daily operation totals grouped by Pacific calendar day
                        </p>
                      </div>

                      <div
                        role="tablist"
                        aria-label="Select metric for 7-day chart"
                        className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/60 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08]"
                      >
                        {(['writes', 'reads', 'deletes'] as const).map((key) => {
                          const active = activeChartMetric === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => setActiveChartMetric(key)}
                              className={cn(
                                'px-3 py-1 rounded-md text-[11px] font-semibold capitalize transition-colors cursor-pointer',
                                active
                                  ? 'bg-white dark:bg-surface-elevated text-slate-900 dark:text-white shadow-surface-sm'
                                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
                              )}
                            >
                              {key}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-7 gap-2 sm:gap-3 items-end h-44 pt-4">
                      {activeMetricReport.daily7d.map((day, idx) => {
                        const isToday = idx === activeMetricReport.daily7d.length - 1;
                        const heightPct =
                          day.count > 0 ? Math.max(8, Math.round((day.count / maxDailyChartValue) * 100)) : 4;
                        return (
                          <div key={day.dateISO} className="flex flex-col items-center gap-2 h-full justify-end">
                            <span className="font-mono text-[10px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                              {day.count >= 1000 ? `${(day.count / 1000).toFixed(1)}k` : day.count}
                            </span>
                            <div className="w-full max-w-[38px] flex-1 flex items-end">
                              <motion.div
                                key={`${activeChartMetric}-${day.dateISO}`}
                                initial={{ height: 0 }}
                                animate={{ height: `${heightPct}%` }}
                                transition={{ duration: 0.45, ease: STUDIO_EASE }}
                                title={`${day.label}: ${formatNumber(day.count)} ${activeChartMetric}`}
                                className={cn(
                                  'w-full rounded-t-lg transition-colors',
                                  day.count === 0
                                    ? 'bg-slate-200/80 dark:bg-white/[0.08]'
                                    : isToday
                                      ? 'bg-brand-600 dark:bg-brand-400'
                                      : 'bg-brand-500/45 dark:bg-brand-400/35',
                                )}
                              />
                            </div>
                            <span
                              className={cn(
                                'font-mono text-[10px] whitespace-nowrap',
                                isToday
                                  ? 'font-bold text-brand-600 dark:text-brand-400'
                                  : 'text-slate-500 dark:text-slate-400',
                              )}
                            >
                              {isToday ? 'Today' : day.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </motion.section>
                )}

                {/* Connected Services Health Card */}
                <motion.section
                  variants={FADE_UP_ITEM}
                  aria-label="Service health"
                  className="rounded-2xl border border-slate-200/90 dark:border-white/[0.09] bg-white/90 dark:bg-surface-dark/90 shadow-surface-md dark:shadow-dark-md p-6 space-y-4"
                >
                  <div className="flex items-center gap-2">
                    <Pulse weight="duotone" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Service Components
                    </h2>
                  </div>

                  <ul className="space-y-3">
                    <li className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                        <Database weight="duotone" className="w-4 h-4 text-slate-400" />
                        Cloud Firestore
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 font-mono text-[11px] font-semibold',
                          status.services.firestore === 'operational'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400',
                        )}
                      >
                        <CheckCircle weight="fill" className="w-3.5 h-3.5" />
                        {status.services.firestore === 'operational' ? 'Operational' : 'At Limit'}
                      </span>
                    </li>

                    <li className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                        <CloudCheck weight="duotone" className="w-4 h-4 text-slate-400" />
                        Cloud Monitoring
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 font-mono text-[11px] font-semibold',
                          status.services.monitoring === 'operational'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400',
                        )}
                      >
                        <CheckCircle weight="fill" className="w-3.5 h-3.5" />
                        {status.services.monitoring === 'operational' ? 'Operational' : 'Unavailable'}
                      </span>
                    </li>

                    <li className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                        <PaperPlaneTilt weight="duotone" className="w-4 h-4 text-slate-400" />
                        Telegram Bot
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 font-mono text-[11px] font-semibold',
                          status.services.telegramBot === 'configured'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400',
                        )}
                      >
                        <CheckCircle weight="fill" className="w-3.5 h-3.5" />
                        {status.services.telegramBot === 'configured' ? 'Active' : 'Optional'}
                      </span>
                    </li>
                  </ul>

                  <p className="pt-3 border-t border-slate-200/70 dark:border-white/[0.07] text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Metrics are cached for 5 minutes and read from Google Cloud Monitoring, so
                    checking this page uses zero Firestore document reads.
                  </p>
                </motion.section>
              </div>
            </>
          )}
        </motion.div>
      </main>

      <AppFooter />
    </div>
  );
}
