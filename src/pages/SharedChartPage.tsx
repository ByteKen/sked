import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  CaretDown,
  ChartBarHorizontal,
  CopySimple,
  DownloadSimple,
  Kanban,
  ListBullets,
  LockKey,
  MagnifyingGlass,
  MagnifyingGlassMinus,
  PencilSimple,
  Plus,
  SignIn,
  X,
} from '@phosphor-icons/react';
import { AnimatePresence } from 'framer-motion';
import { GanttWorkspace, type GanttWorkspaceHandle } from '@/components/gantt/GanttWorkspace';
import { AppFooter } from '@/components/layout/AppFooter';
import { MobileBottomBar } from '@/components/layout/MobileNav';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { ConfirmationModal } from '@/components/modals/ConfirmationModal';
import { ImportModal } from '@/components/modals/ImportModal';
import { TaskDetailModal } from '@/components/modals/TaskDetailModal';
import { TaskModal } from '@/components/modals/TaskModal';
import { Badge } from '@/components/ui/Badge';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { KanbanBoardView } from '@/components/views/KanbanBoardView';
import { TaskListView } from '@/components/views/TaskListView';
import { ExportMenu } from '@/components/workspace/ExportMenu';
import { FloatingActionDock } from '@/components/workspace/FloatingActionDock';
import { WorkspaceViewSwitcher } from '@/components/workspace/WorkspaceViewSwitcher';
import { canUserEditSharedChart } from '@/domain/collaboration';
import { createWorkspaceBaseline, rescheduleTaskInTree } from '@/domain/scheduling';
import {
  addSubtaskToTree,
  addTaskToTree,
  deleteTaskFromTree,
  filterTasks,
  findTaskById,
  prepareImportedTasks,
  sanitizeTaskTree,
  toggleSubtaskDoneInTree,
  updateTaskInTree,
} from '@/domain/taskTree';
import { setTaskStatusInTree, TASK_STATUS_LABELS } from '@/domain/taskViews';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { exportGanttChart } from '@/services/export';
import {
  commitCollaborativeChartMutation,
  subscribeToSharedChart,
  type CollaborativeChartMutationResult,
} from '@/services/shareRepository';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { toast } from '@/store/toastStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type {
  ExportFormat,
  FlatTask,
  ImportTaskInput,
  SharedChart,
  Task,
  TaskDraft,
  TaskStatus,
  WorkspaceBaseline,
  WorkspaceViewMode,
} from '@/types';
import { cn } from '@/utils/cn';

const PROGRESS_SLIDER_DEBOUNCE_MS = 500;

export function SharedChartPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const user = useAuthStore((s) => s.user);
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
  const [activeView, setActiveView] = useState<WorkspaceViewMode>('timeline');
  const [isChartExpanded, setIsChartExpanded] = useState(false);

  // Collaborative edit modal states (active only when canEdit === true)
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [parentTaskId, setParentTaskId] = useState<number | null>(null);
  const [newTaskInitialStatus, setNewTaskInitialStatus] = useState<TaskStatus | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [deleteTargetTask, setDeleteTargetTask] = useState<Task | null>(null);

  const ganttRef = useRef<GanttWorkspaceHandle | null>(null);
  const exportBtnRef = useRef<HTMLDivElement | null>(null);
  const autoDuplicateTriggered = useRef(false);
  const progressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgressUpdatesRef = useRef<Map<number, number>>(new Map());

  const canEdit = useMemo(() => canUserEditSharedChart(chart, user), [chart, user]);
  const hasInvitedEditors = Boolean(chart?.editorEmails && chart.editorEmails.length > 0);

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

    return () => {
      if (progressDebounceRef.current) {
        clearTimeout(progressDebounceRef.current);
        progressDebounceRef.current = null;
      }
      unsubscribe();
    };
  }, [shareId]);

  const commitCollabMutation = useCallback(
    async (
      mutate: (current: {
        tasks: Task[];
        nextId: number;
        baseline: WorkspaceBaseline | null;
      }) => CollaborativeChartMutationResult | null,
      optimisticPatch?: (prev: SharedChart) => SharedChart,
    ) => {
      if (!shareId || !user || !canEdit) return false;
      const prevChart = chart;
      if (optimisticPatch) {
        setChart((curr) => (curr ? optimisticPatch(curr) : curr));
      }

      try {
        await commitCollaborativeChartMutation({
          shareId,
          editor: {
            uid: user.id,
            name: user.name || user.email || 'Collaborator',
            email: user.email,
          },
          mutate,
        });
        return true;
      } catch (err) {
        console.error('Collaborative edit failed:', err);
        if (prevChart) setChart(prevChart);
        toast.error(
          'Could not save collaborative edit',
          'Check your connection or verify you still have editor access.',
        );
        return false;
      }
    },
    [shareId, user, canEdit, chart],
  );

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

  const handleChangeView = useCallback((view: WorkspaceViewMode) => {
    setActiveView(view);
    if (view !== 'timeline') setIsChartExpanded(false);
  }, []);

  const handleOpenNewTask = useCallback(() => {
    setEditingTask(null);
    setParentTaskId(null);
    setNewTaskInitialStatus(null);
    setTaskModalOpen(true);
  }, []);

  const handleOpenNewTaskWithStatus = useCallback((status: TaskStatus) => {
    setEditingTask(null);
    setParentTaskId(null);
    setNewTaskInitialStatus(status);
    setTaskModalOpen(true);
  }, []);

  const handleTaskActivate = useCallback(
    (task: FlatTask) => {
      if (canEdit) {
        setEditingTask(task);
        setParentTaskId(null);
        setNewTaskInitialStatus(null);
        setTaskModalOpen(true);
      } else {
        setDetailTask(task);
      }
    },
    [canEdit],
  );

  const handleAddSubtask = useCallback((parentId: number) => {
    setEditingTask(null);
    setParentTaskId(parentId);
    setNewTaskInitialStatus(null);
    setTaskModalOpen(true);
  }, []);

  const handleSaveTask = useCallback(
    (draft: TaskDraft) => {
      if (!chart) return;
      if (editingTask) {
        const targetId = editingTask.id;
        void commitCollabMutation(
          (curr) => ({
            tasks: updateTaskInTree(curr.tasks, targetId, draft),
            nextId: curr.nextId,
          }),
          (prev) => ({ ...prev, tasks: updateTaskInTree(prev.tasks, targetId, draft) }),
        ).then((ok) => {
          if (ok) toast.success('Task updated', draft.name);
        });
      } else if (parentTaskId !== null) {
        const pId = parentTaskId;
        void commitCollabMutation(
          (curr) => {
            const next = addSubtaskToTree(curr.tasks, curr.nextId, pId, draft);
            return { tasks: next.tasks, nextId: next.nextId };
          },
          (prev) => {
            const next = addSubtaskToTree(prev.tasks, prev.nextId ?? 1, pId, draft);
            return { ...prev, tasks: next.tasks, nextId: next.nextId };
          },
        ).then((ok) => {
          if (ok) toast.success('Subtask added', draft.name);
        });
      } else {
        void commitCollabMutation(
          (curr) => {
            const next = addTaskToTree(curr.tasks, curr.nextId, draft);
            return { tasks: next.tasks, nextId: next.nextId };
          },
          (prev) => {
            const next = addTaskToTree(prev.tasks, prev.nextId ?? 1, draft);
            return { ...prev, tasks: next.tasks, nextId: next.nextId };
          },
        ).then((ok) => {
          if (ok) toast.success('Task created', draft.name);
        });
      }

      setTaskModalOpen(false);
      setEditingTask(null);
      setParentTaskId(null);
      setNewTaskInitialStatus(null);
    },
    [chart, editingTask, parentTaskId, commitCollabMutation],
  );

  const handleRestoreSnapshot = useCallback(
    (previousTasks: Task[], label: string) => {
      const clean = sanitizeTaskTree(previousTasks);
      void commitCollabMutation(
        (curr) => ({ tasks: clean, nextId: curr.nextId }),
        (prev) => ({ ...prev, tasks: clean }),
      ).then((ok) => {
        if (ok) toast.info('Change undone', label);
      });
    },
    [commitCollabMutation],
  );

  const handleRescheduleTask = useCallback(
    (taskId: number, nextStart: string, nextEnd: string, autoCascade: boolean) => {
      if (!chart) return;
      const previousTasks = chart.tasks;
      const preview = rescheduleTaskInTree(previousTasks, {
        taskId,
        nextStart,
        nextEnd,
        autoCascade,
      });
      if (!preview.movedTask) return;
      const movedName = preview.movedTask.name;
      const cascadeCount = preview.cascadedTaskIds.length;

      void commitCollabMutation(
        (curr) => {
          const next = rescheduleTaskInTree(curr.tasks, {
            taskId,
            nextStart,
            nextEnd,
            autoCascade,
          });
          return next.movedTask ? { tasks: next.tasks, nextId: curr.nextId } : null;
        },
        (prev) => ({ ...prev, tasks: preview.tasks }),
      ).then((ok) => {
        if (!ok) return;
        const undoAction = {
          label: 'Undo',
          onClick: () => handleRestoreSnapshot(previousTasks, movedName),
        };
        if (cascadeCount > 0) {
          toast.success(
            `Rescheduled "${movedName}"`,
            `Auto-shifted ${cascadeCount} dependent ${cascadeCount === 1 ? 'task' : 'tasks'}.`,
            6000,
            undoAction,
          );
        } else {
          toast.info('Schedule updated', movedName, 5000, undoAction);
        }
      });
    },
    [chart, commitCollabMutation, handleRestoreSnapshot],
  );

  const handleStatusChange = useCallback(
    (taskId: number, nextStatus: TaskStatus) => {
      if (!chart) return;
      const previousTasks = chart.tasks;
      const preview = setTaskStatusInTree(previousTasks, taskId, nextStatus);
      if (!preview.updatedTask) return;
      const taskName = preview.updatedTask.name;

      void commitCollabMutation(
        (curr) => {
          const next = setTaskStatusInTree(curr.tasks, taskId, nextStatus);
          return next.updatedTask ? { tasks: next.tasks, nextId: curr.nextId } : null;
        },
        (prev) => ({ ...prev, tasks: preview.tasks }),
      ).then((ok) => {
        if (!ok) return;
        toast.info(`Moved to ${TASK_STATUS_LABELS[nextStatus]}`, taskName, 5000, {
          label: 'Undo',
          onClick: () => handleRestoreSnapshot(previousTasks, taskName),
        });
      });
    },
    [chart, commitCollabMutation, handleRestoreSnapshot],
  );

  // Debounced progress slider saves (coalesces rapid range dragging into 1 single Firestore transaction)
  const handleUpdateProgress = useCallback(
    (taskId: number, progress: number) => {
      const patch =
        progress === 100
          ? { progress: 100, isDone: true, isWorking: false }
          : { progress, isDone: false };

      setChart((prev) => (prev ? { ...prev, tasks: updateTaskInTree(prev.tasks, taskId, patch) } : prev));
      pendingProgressUpdatesRef.current.set(taskId, progress);

      if (progressDebounceRef.current) clearTimeout(progressDebounceRef.current);
      progressDebounceRef.current = setTimeout(() => {
        progressDebounceRef.current = null;
        const batch = Array.from(pendingProgressUpdatesRef.current.entries());
        pendingProgressUpdatesRef.current.clear();
        if (batch.length === 0) return;

        void commitCollabMutation((curr) => {
          let nextTasks = curr.tasks;
          for (const [id, pct] of batch) {
            nextTasks = updateTaskInTree(
              nextTasks,
              id,
              pct === 100 ? { progress: 100, isDone: true, isWorking: false } : { progress: pct, isDone: false },
            );
          }
          return { tasks: nextTasks, nextId: curr.nextId };
        });
      }, PROGRESS_SLIDER_DEBOUNCE_MS);
    },
    [commitCollabMutation],
  );

  const handleToggleSubtaskDone = useCallback(
    (taskId: number) => {
      void commitCollabMutation(
        (curr) => ({
          tasks: toggleSubtaskDoneInTree(curr.tasks, taskId),
          nextId: curr.nextId,
        }),
        (prev) => ({ ...prev, tasks: toggleSubtaskDoneInTree(prev.tasks, taskId) }),
      );
    },
    [commitCollabMutation],
  );

  const handleRequestDeleteTask = useCallback(
    (taskId: number) => {
      if (!chart) return;
      const target = findTaskById(chart.tasks, taskId);
      if (target) setDeleteTargetTask(target);
    },
    [chart],
  );

  const handleConfirmDeleteTask = useCallback(() => {
    if (!deleteTargetTask) return;
    const targetId = deleteTargetTask.id;
    const name = deleteTargetTask.name;
    setDeleteTargetTask(null);
    if (selectedTaskId === targetId) setSelectedTaskId(null);

    void commitCollabMutation(
      (curr) => ({
        tasks: deleteTaskFromTree(curr.tasks, targetId),
        nextId: curr.nextId,
      }),
      (prev) => ({ ...prev, tasks: deleteTaskFromTree(prev.tasks, targetId) }),
    ).then((ok) => {
      if (ok) toast.info('Task deleted', name);
    });
  }, [deleteTargetTask, selectedTaskId, commitCollabMutation]);

  const handleSaveBaseline = useCallback(() => {
    if (!chart) return;
    const baseline = createWorkspaceBaseline(chart.tasks);
    void commitCollabMutation(
      (curr) => ({
        tasks: curr.tasks,
        nextId: curr.nextId,
        baseline: createWorkspaceBaseline(curr.tasks),
      }),
      (prev) => ({ ...prev, baseline }),
    ).then((ok) => {
      if (ok) {
        toast.success(
          'Baseline saved',
          'Ghost bars now compare your original plan against live dates.',
        );
      }
    });
  }, [chart, commitCollabMutation]);

  const handleClearBaseline = useCallback(() => {
    void commitCollabMutation(
      (curr) => ({
        tasks: curr.tasks,
        nextId: curr.nextId,
        baseline: null,
      }),
      (prev) => ({ ...prev, baseline: null }),
    ).then((ok) => {
      if (ok) toast.info('Baseline cleared');
    });
  }, [commitCollabMutation]);

  const handleImport = useCallback(
    (inputs: ImportTaskInput[]) => {
      void commitCollabMutation((curr) => {
        const prepared = prepareImportedTasks(curr.tasks, curr.nextId, inputs);
        return { tasks: prepared.tasks, nextId: prepared.nextId };
      }).then((ok) => {
        if (ok) {
          toast.success(
            'Import complete',
            `Added ${inputs.length} ${inputs.length === 1 ? 'task' : 'tasks'} to the shared project.`,
          );
        }
      });
    },
    [commitCollabMutation],
  );

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
        baseline: chart.baseline,
      });
      if (result.ok) {
        toast.success(`Exported ${format.toUpperCase()}`, result.filename);
      } else if (result.error) {
        toast.error('Export failed', result.error);
      }
    },
    [chart, exportTheme, showDependencyLinesOnExport],
  );

  const anyModalOpen =
    taskModalOpen || importModalOpen || Boolean(deleteTargetTask) || Boolean(detailTask);

  useKeyboardShortcuts({
    enabled: Boolean(chart) && !anyModalOpen,
    onNewTask: canEdit ? handleOpenNewTask : undefined,
    onViewChange: handleChangeView,
    onZoomIn: activeView === 'timeline' ? () => ganttRef.current?.zoomIn() : undefined,
    onZoomOut: activeView === 'timeline' ? () => ganttRef.current?.zoomOut() : undefined,
    onResetZoom: activeView === 'timeline' ? () => ganttRef.current?.resetZoom() : undefined,
    onAutoFit: activeView === 'timeline' ? () => ganttRef.current?.autoFit() : undefined,
    onGoToToday: activeView === 'timeline' ? () => ganttRef.current?.scrollToToday() : undefined,
  });

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
              SKED
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
                'This shared chart link may have been disabled, regenerated, or deleted by its owner.'}
            </p>
            <Link to="/">
              <Button variant="primary">
                {isAuthenticated ? 'Go to My Workspaces' : 'Sign in to Sked'}
              </Button>
            </Link>
          </div>
        </main>

        <AppFooter />
      </div>
    );
  }

  const lastEditorLabel =
    chart.lastEditedBy?.name && chart.lastEditedBy.uid !== user?.id
      ? `Edited by ${chart.lastEditedBy.name}`
      : null;

  return (
    <div
      className={cn(
        'min-h-screen flex flex-col studio-atmosphere text-slate-900 dark:text-slate-50',
        isChartExpanded ? 'overflow-y-auto' : 'h-dvh overflow-hidden',
      )}
    >
      {/* Substantial Studio Public / Collaborative Header */}
      {!isChartExpanded && (
        <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-white/[0.08] bg-white/90 dark:bg-[#090B10]/90 backdrop-blur-md">
          <div className="h-16 sm:h-[68px] px-4 sm:px-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <Link to="/" title="Sked" className="shrink-0">
                <BrandLogo size="md" />
              </Link>
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-sm sm:text-base font-bold truncate text-slate-900 dark:text-white">
                    {chart.title}
                  </h1>
                  {canEdit ? (
                    <Badge variant="brand" className="hidden sm:inline-flex">
                      <PencilSimple weight="bold" className="w-3 h-3" />
                      Live · Editing
                    </Badge>
                  ) : (
                    <Badge variant="emerald" className="hidden sm:inline-flex">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Live · Read-only
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Shared by {chart.ownerName}
                  {lastEditorLabel ? ` · ${lastEditorLabel}` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 flex-1 min-w-0">
              <WorkspaceViewSwitcher
                value={activeView}
                onChange={handleChangeView}
                layoutId="shared-view-active-pill"
                className="hidden md:inline-flex"
              />

              <div className="hidden xl:block flex-1 max-w-xs">
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
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isAuthenticated && hasInvitedEditors && (
                <Button
                  variant="secondary"
                  size="md"
                  className="h-10"
                  onClick={() =>
                    navigate(`/?redirect=${encodeURIComponent(`/share/${chart.shareId}`)}`)
                  }
                  leftIcon={<SignIn className="w-4 h-4 text-brand-600 dark:text-brand-400" weight="duotone" />}
                >
                  <span className="hidden sm:inline">Sign in to edit</span>
                  <span className="sm:hidden">Sign in</span>
                </Button>
              )}

              {!canEdit && (
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
                    rightIcon={
                      <CaretDown className="w-3 h-3 opacity-60 hidden md:inline" weight="bold" />
                    }
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
              )}

              <Button
                variant={canEdit ? 'secondary' : 'primary'}
                size="md"
                className="h-10"
                loading={duplicating}
                onClick={() => void handleDuplicate()}
                leftIcon={<CopySimple className="w-4 h-4" weight="duotone" />}
              >
                <span className="hidden sm:inline">
                  {canEdit ? 'Duplicate Copy' : 'Duplicate to Workspace'}
                </span>
                <span className="sm:hidden">Duplicate</span>
              </Button>

              <ThemeToggle />
            </div>
          </div>
        </header>
      )}

      <main
        className={cn(
          'relative z-0 flex-1 min-h-0 flex flex-col',
          !isChartExpanded && 'md:p-3 pb-[60px] md:pb-2',
        )}
      >
        {chart.tasks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <div className="max-w-sm">
              <p className="text-base font-bold text-slate-800 dark:text-slate-200">
                This shared timeline has no tasks yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
                {canEdit
                  ? 'Add the first task to start collaborating live.'
                  : `Updates added by ${chart.ownerName} will appear here automatically.`}
              </p>
              {canEdit && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleOpenNewTask}
                  leftIcon={<Plus className="w-4 h-4" weight="bold" />}
                >
                  Create Task
                </Button>
              )}
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
            {activeView === 'timeline' ? (
              <GanttWorkspace
                ref={ganttRef}
                tasks={visibleTasks}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                onTaskActivate={handleTaskActivate}
                onToggleSubtaskDone={canEdit ? handleToggleSubtaskDone : undefined}
                onAddSubtask={canEdit ? handleAddSubtask : undefined}
                onDeleteTask={canEdit ? handleRequestDeleteTask : undefined}
                onRescheduleTask={canEdit ? handleRescheduleTask : undefined}
                baseline={chart.baseline}
                onSaveBaseline={canEdit ? handleSaveBaseline : undefined}
                onClearBaseline={canEdit ? handleClearBaseline : undefined}
                onExpandedChange={setIsChartExpanded}
                readOnly={!canEdit}
                viewPrefsOverride={chart.preferences}
                mobileView="chart"
              />
            ) : activeView === 'board' ? (
              <KanbanBoardView
                tasks={visibleTasks}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                onTaskActivate={handleTaskActivate}
                onStatusChange={canEdit ? handleStatusChange : undefined}
                onAddTaskWithStatus={canEdit ? handleOpenNewTaskWithStatus : undefined}
                onDeleteTask={canEdit ? handleRequestDeleteTask : undefined}
                baseline={chart.baseline}
                readOnly={!canEdit}
              />
            ) : (
              <TaskListView
                tasks={visibleTasks}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                onTaskActivate={handleTaskActivate}
                onStatusChange={canEdit ? handleStatusChange : undefined}
                onUpdateProgress={canEdit ? handleUpdateProgress : undefined}
                onRescheduleTask={canEdit ? handleRescheduleTask : undefined}
                onAddSubtask={canEdit ? handleAddSubtask : undefined}
                onDeleteTask={canEdit ? handleRequestDeleteTask : undefined}
                baseline={chart.baseline}
                readOnly={!canEdit}
              />
            )}
          </div>
        )}
      </main>

      {!canEdit && <AppFooter compact className="hidden md:block" />}

      {/* Desktop Collaborative Floating Action Dock */}
      {canEdit && !isChartExpanded && (
        <FloatingActionDock
          workspace={null}
          onOpenShare={() => {
            if (chart.ownerId === user?.id) {
              navigate(`/workspace/${chart.workspaceId}`);
            } else {
              void navigator.clipboard
                ?.writeText(window.location.href)
                .then(() => toast.success('Collaborative link copied'));
            }
          }}
          onOpenImport={() => setImportModalOpen(true)}
          onExport={(fmt) => void handleExport(fmt)}
          onAddTask={handleOpenNewTask}
        />
      )}

      {/* Mobile Bottom Nav: Full edit bar for collaborators, 3-view switcher for read-only viewers */}
      {!isChartExpanded &&
        (canEdit ? (
          <MobileBottomBar
            activeView={activeView}
            onChangeView={handleChangeView}
            onAddTask={handleOpenNewTask}
            onOpenImport={() => setImportModalOpen(true)}
            onExport={(fmt) => void handleExport(fmt)}
          />
        ) : (
          <nav
            aria-label="Shared view switcher"
            className="fixed bottom-0 left-0 right-0 z-30 md:hidden grid grid-cols-3 gap-1 border-t border-slate-200/90 dark:border-white/[0.08] bg-white/95 dark:bg-surface-dark/95 backdrop-blur-md p-1.5 safe-area-inset-bottom"
          >
            <button
              type="button"
              onClick={() => setActiveView('timeline')}
              aria-pressed={activeView === 'timeline'}
              className={cn(
                'flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl text-xs font-semibold cursor-pointer',
                activeView === 'timeline'
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                  : 'text-slate-500 dark:text-slate-400',
              )}
            >
              <ChartBarHorizontal className="w-4 h-4" weight="duotone" />
              Timeline
            </button>
            <button
              type="button"
              onClick={() => setActiveView('board')}
              aria-pressed={activeView === 'board'}
              className={cn(
                'flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl text-xs font-semibold cursor-pointer',
                activeView === 'board'
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                  : 'text-slate-500 dark:text-slate-400',
              )}
            >
              <Kanban className="w-4 h-4" weight="duotone" />
              Board
            </button>
            <button
              type="button"
              onClick={() => setActiveView('list')}
              aria-pressed={activeView === 'list'}
              className={cn(
                'flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl text-xs font-semibold cursor-pointer',
                activeView === 'list'
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                  : 'text-slate-500 dark:text-slate-400',
              )}
            >
              <ListBullets className="w-4 h-4" weight="duotone" />
              List
            </button>
          </nav>
        ))}

      {/* Read-Only Detail Modal */}
      <TaskDetailModal
        task={detailTask}
        allTasks={chart.tasks}
        baseline={chart.baseline}
        onClose={() => setDetailTask(null)}
      />

      {/* Collaborative Editor Modals */}
      {canEdit && taskModalOpen && (
        <TaskModal
          isOpen={taskModalOpen}
          task={editingTask}
          allTasks={chart.tasks}
          isSubtask={parentTaskId !== null || Boolean(editingTask?.parentId)}
          parentTask={parentTaskId !== null ? findTaskById(chart.tasks, parentTaskId) : null}
          initialStatus={newTaskInitialStatus}
          onSave={handleSaveTask}
          onClose={() => {
            setTaskModalOpen(false);
            setEditingTask(null);
            setParentTaskId(null);
            setNewTaskInitialStatus(null);
          }}
        />
      )}

      {canEdit && (
        <>
          <ImportModal
            isOpen={importModalOpen}
            onImport={handleImport}
            onClose={() => setImportModalOpen(false)}
          />
          <ConfirmationModal
            isOpen={Boolean(deleteTargetTask)}
            onClose={() => setDeleteTargetTask(null)}
            onConfirm={handleConfirmDeleteTask}
            title="Delete Task?"
            message={
              deleteTargetTask?.children && deleteTargetTask.children.length > 0
                ? `Are you sure you want to delete "${deleteTargetTask.name}"? This will also delete ${deleteTargetTask.children.length} ${deleteTargetTask.children.length === 1 ? 'subtask' : 'subtasks'}.`
                : `Are you sure you want to delete "${deleteTargetTask?.name ?? ''}"? This cannot be undone.`
            }
            confirmText="Delete Task"
            type="delete"
          />
        </>
      )}
    </div>
  );
}
