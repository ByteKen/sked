import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  CaretDown,
  ChartBarHorizontal,
  CopySimple,
  DownloadSimple,
  ListChecks,
  LockKey,
  MagnifyingGlass,
  MagnifyingGlassMinus,
  X,
} from '@phosphor-icons/react';
import { AnimatePresence } from 'framer-motion';
import { GanttWorkspace, type GanttWorkspaceHandle } from '@/components/gantt/GanttWorkspace';
import { AppFooter } from '@/components/layout/AppFooter';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { TaskDetailModal } from '@/components/modals/TaskDetailModal';
import { Badge } from '@/components/ui/Badge';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ExportMenu } from '@/components/workspace/ExportMenu';
import { filterTasks } from '@/domain/taskTree';
import { exportGanttChart } from '@/services/export';
import { subscribeToSharedChart } from '@/services/shareRepository';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { toast } from '@/store/toastStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { ExportFormat, FlatTask, SharedChart } from '@/types';
import { cn } from '@/utils/cn';

export function SharedChartPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.loading);
  const duplicateSharedChart = useWorkspaceStore((s) => s.duplicateSharedChart);
  const exportTheme = usePreferencesStore((s) => s.exportTheme);
  const showDependencyLinesOnExport = usePreferencesStore((s) => s.showDependencyLinesOnExport);

  const [chart, setChart] = useState<SharedChart | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [detailTask, setDetailTask] = useState<FlatTask | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [mobileView, setMobileView] = useState<'chart' | 'list'>('chart');

  const ganttRef = useRef<GanttWorkspaceHandle | null>(null);
  const exportBtnRef = useRef<HTMLDivElement | null>(null);
  const autoDuplicateTriggered = useRef(false);

  useEffect(() => {
    if (!shareId) {
      setLoading(false);
      setChart(null);
      return;
    }

    setLoading(true);
    setLoadError(null);

    const unsubscribe = subscribeToSharedChart(
      shareId,
      (nextChart) => {
        setChart(nextChart);
        setLoading(false);
      },
      (err) => {
        setLoadError(err.message || 'Unable to load this shared chart.');
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [shareId]);

  const handleDuplicate = useCallback(async () => {
    if (!chart || duplicating) return;

    if (!isAuthenticated) {
      const target = `/share/${chart.shareId}?action=duplicate`;
      navigate(`/?redirect=${encodeURIComponent(target)}`);
      return;
    }

    setDuplicating(true);
    try {
      const created = await duplicateSharedChart(chart);
      if (created) {
        toast.success('Copied to your workspace', created.title);
        navigate(`/workspace/${created.id}`);
      } else {
        toast.error('Could not duplicate chart', 'Please try again.');
      }
    } catch (err) {
      console.error('Duplicate failed:', err);
      toast.error('Could not duplicate chart', 'Please try again.');
    } finally {
      setDuplicating(false);
    }
  }, [chart, duplicating, isAuthenticated, duplicateSharedChart, navigate]);

  useEffect(() => {
    const wantsDuplicate = searchParams.get('action') === 'duplicate';
    if (
      wantsDuplicate &&
      isAuthenticated &&
      !authLoading &&
      chart &&
      !autoDuplicateTriggered.current
    ) {
      autoDuplicateTriggered.current = true;
      setSearchParams({}, { replace: true });
      void handleDuplicate();
    }
  }, [searchParams, isAuthenticated, authLoading, chart, handleDuplicate, setSearchParams]);

  const visibleTasks = useMemo(() => {
    if (!chart) return [];
    return searchTerm.trim() ? filterTasks(chart.tasks, searchTerm) : chart.tasks;
  }, [chart, searchTerm]);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!chart) return;
      const result = await exportGanttChart(format, chart.tasks, {
        workspaceTitle: chart.title,
        theme: exportTheme,
        useRoundedSubtasks: chart.preferences.useRoundedSubtasks,
        showDependencyLinesOnExport,
        barHeight: chart.preferences.barHeight,
        taskLabelPosition: chart.preferences.taskLabelPosition,
        granularity: ganttRef.current?.getGranularity(),
      });
      if (result.ok) {
        toast.success(`Exported ${format.toUpperCase()}`, result.filename);
      } else if (result.error) {
        toast.error('Export failed', result.error);
      }
    },
    [chart, exportTheme, showDependencyLinesOnExport],
  );

  if (loading) {
    return (
      <div className="min-h-screen studio-atmosphere p-6 space-y-4">
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-[75vh] md:col-span-1" />
          <Skeleton className="h-[75vh] md:col-span-3" />
        </div>
      </div>
    );
  }

  if (!chart || loadError) {
    return (
      <div className="min-h-screen flex flex-col studio-atmosphere text-slate-900 dark:text-slate-50">
        <header className="h-16 sm:h-[72px] px-5 sm:px-8 border-b border-slate-200/80 dark:border-white/[0.08] bg-white/85 dark:bg-[#090B10]/85 backdrop-blur-md flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <BrandLogo size="md" />
            <span className="font-mono text-sm sm:text-[15px] font-bold uppercase tracking-[0.22em]">
              GANTT
            </span>
          </Link>
          <ThemeToggle />
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-slate-200/90 dark:border-white/[0.1] bg-white dark:bg-surface-dark p-8 text-center shadow-surface-lg">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-400 mb-4">
              <LockKey className="w-6 h-6" weight="duotone" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              Chart Unavailable
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 mb-6">
              {loadError ||
                'This shared Gantt chart link may have been disabled, regenerated, or deleted by its owner.'}
            </p>
            <Link to="/">
              <Button variant="primary">
                {isAuthenticated ? 'Go to My Workspaces' : 'Sign in to Gantt'}
              </Button>
            </Link>
          </div>
        </main>

        <AppFooter />
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col overflow-hidden studio-atmosphere text-slate-900 dark:text-slate-50">
      {/* Substantial Studio Public Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-white/[0.08] bg-white/90 dark:bg-[#090B10]/90 backdrop-blur-md">
        <div className="h-16 sm:h-[68px] px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <Link to="/" title="Gantt" className="shrink-0">
              <BrandLogo size="md" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-sm sm:text-base font-bold truncate text-slate-900 dark:text-white">
                  {chart.title}
                </h1>
                <Badge variant="emerald" className="hidden sm:inline-flex">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Live · Read-only
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Shared by {chart.ownerName}
              </p>
            </div>
          </div>

          <div className="hidden lg:block flex-1 max-w-sm">
            <div className="relative">
              <MagnifyingGlass
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                weight="duotone"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search tasks..."
                aria-label="Search shared tasks"
                className="w-full h-10 pl-10 pr-9 text-sm rounded-xl border border-slate-200/90 dark:border-white/[0.09] bg-slate-50/80 dark:bg-white/[0.04] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" weight="bold" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div ref={exportBtnRef} className="relative hidden sm:block">
              <Button
                variant="secondary"
                size="md"
                className="h-10"
                onClick={() => setExportOpen((v) => !v)}
                leftIcon={
                  <DownloadSimple
                    className="w-4 h-4 text-brand-600 dark:text-brand-400"
                    weight="duotone"
                  />
                }
                rightIcon={<CaretDown className="w-3 h-3 opacity-60 hidden md:inline" weight="bold" />}
              >
                <span className="hidden md:inline">Export</span>
              </Button>
              <AnimatePresence>
                {exportOpen && (
                  <ExportMenu
                    triggerRef={exportBtnRef}
                    onSelect={(fmt) => void handleExport(fmt)}
                    onClose={() => setExportOpen(false)}
                  />
                )}
              </AnimatePresence>
            </div>

            <Button
              variant="primary"
              size="md"
              className="h-10"
              loading={duplicating}
              onClick={() => void handleDuplicate()}
              leftIcon={<CopySimple className="w-4 h-4" weight="duotone" />}
            >
              <span className="hidden sm:inline">Duplicate to Workspace</span>
              <span className="sm:hidden">Duplicate</span>
            </Button>

            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="relative z-0 flex-1 min-h-0 flex flex-col md:p-3 pb-[56px] md:pb-2">
        {chart.tasks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <div>
              <p className="text-base font-bold text-slate-800 dark:text-slate-200">
                This shared timeline has no tasks yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Updates added by {chart.ownerName} will appear here automatically.
              </p>
            </div>
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <div>
              <MagnifyingGlassMinus
                className="w-8 h-8 text-brand-500 mx-auto mb-2"
                weight="duotone"
              />
              <p className="text-sm font-semibold">No tasks match &ldquo;{searchTerm}&rdquo;</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => setSearchTerm('')}
              >
                Clear Search
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0">
            <GanttWorkspace
              ref={ganttRef}
              tasks={visibleTasks}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
              onTaskActivate={(task) => setDetailTask(task)}
              readOnly
              viewPrefsOverride={chart.preferences}
              mobileView={mobileView}
            />
          </div>
        )}
      </main>

      <AppFooter compact className="hidden md:block" />

      <nav
        aria-label="Shared view switcher"
        className="fixed bottom-0 left-0 right-0 z-30 md:hidden grid grid-cols-2 border-t border-slate-200/90 dark:border-white/[0.08] bg-white/95 dark:bg-surface-dark/95 backdrop-blur-md p-1.5 safe-area-inset-bottom"
      >
        <button
          type="button"
          onClick={() => setMobileView('chart')}
          className={cn(
            'flex items-center justify-center gap-2 min-h-[44px] rounded-xl text-xs font-semibold cursor-pointer',
            mobileView === 'chart'
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
              : 'text-slate-500 dark:text-slate-400',
          )}
        >
          <ChartBarHorizontal className="w-4 h-4" weight="duotone" />
          Timeline
        </button>
        <button
          type="button"
          onClick={() => setMobileView('list')}
          className={cn(
            'flex items-center justify-center gap-2 min-h-[44px] rounded-xl text-xs font-semibold cursor-pointer',
            mobileView === 'list'
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
              : 'text-slate-500 dark:text-slate-400',
          )}
        >
          <ListChecks className="w-4 h-4" weight="duotone" />
          Tasks
        </button>
      </nav>

      <TaskDetailModal
        task={detailTask}
        allTasks={chart.tasks}
        onClose={() => setDetailTask(null)}
      />
    </div>
  );
}
