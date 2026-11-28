import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MagnifyingGlassMinus, Plus, UploadSimple } from '@phosphor-icons/react';
import { AnimatePresence } from 'framer-motion';
import { GanttWorkspace, type GanttWorkspaceHandle } from '@/components/gantt/GanttWorkspace';
import { AppHeader } from '@/components/layout/AppHeader';
import { MobileBottomBar } from '@/components/layout/MobileNav';
import { ConfirmationModal } from '@/components/modals/ConfirmationModal';
import { ImportModal } from '@/components/modals/ImportModal';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { ShareModal } from '@/components/modals/ShareModal';
import { TaskModal } from '@/components/modals/TaskModal';
import { GanttCanvasSkeleton, WorkspacePageSkeleton } from '@/components/skeletons/PageSkeletons';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Button } from '@/components/ui/Button';
import { KanbanBoardView } from '@/components/views/KanbanBoardView';
import { TaskListView } from '@/components/views/TaskListView';
import { FloatingActionDock } from '@/components/workspace/FloatingActionDock';
import { isCollaborativeWorkspace } from '@/domain/collaboration';
import { filterTasks } from '@/domain/taskTree';
import { TASK_STATUS_LABELS } from '@/domain/taskViews';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { exportGanttChart } from '@/services/export';
import { useAuthStore } from '@/store/authStore';
import { useGanttStore } from '@/store/ganttStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { toast } from '@/store/toastStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type {
  ExportFormat,
  FlatTask,
  ImportTaskInput,
  Task,
  TaskDraft,
  TaskStatus,
  WorkspaceViewMode,
} from '@/types';
import { cn } from '@/utils/cn';

export function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workspacesLoading = useWorkspaceStore((s) => s.loading);
  const workspacesLoadedForUid = useWorkspaceStore((s) => s.loadedForUid);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const switchWorkspace = useWorkspaceStore((s) => s.switchWorkspace);
  const saveBaseline = useWorkspaceStore((s) => s.saveBaseline);
  const clearBaseline = useWorkspaceStore((s) => s.clearBaseline);

  const {
    tasks,
    loading: tasksLoading,
    initTasks,
    cleanup: cleanupTasks,
    addTask,
    addSubtask,
    updateTask,
    rescheduleTask,
    setTaskStatus,
    restoreTasksSnapshot,
    deleteTask,
    toggleSubtaskDone,
    toggleCollapse,
    setAllCollapsed,
    importTasksBatch,
    findTaskById,
  } = useGanttStore();

  const ganttRef = useRef<GanttWorkspaceHandle | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const switchingRef = useRef(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(() => {
    const raw = searchParams.get('task');
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  });
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const [activeView, setActiveView] = useState<WorkspaceViewMode>('timeline');

  // Modal states
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [parentTaskId, setParentTaskId] = useState<number | null>(null);
  const [newTaskInitialStatus, setNewTaskInitialStatus] = useState<TaskStatus | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [deleteTargetTask, setDeleteTargetTask] = useState<Task | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const currentWorkspace = workspaceId ? (workspaces[workspaceId] ?? null) : null;

  const isWorkspacesPending = workspacesLoading || (Boolean(user?.id) && workspacesLoadedForUid !== user?.id);

  // Validate route param & switch workspace
  useEffect(() => {
    if (isWorkspacesPending || !workspaceId) return;

    if (!workspaces[workspaceId]) {
      navigate('/', { replace: true });
      return;
    }

    if (currentWorkspaceId !== workspaceId && !switchingRef.current) {
      switchingRef.current = true;
      void switchWorkspace(workspaceId).finally(() => {
        switchingRef.current = false;
      });
    }
  }, [workspaceId, workspaces, isWorkspacesPending, currentWorkspaceId, switchWorkspace, navigate]);

  const hasCurrentWorkspace = Boolean(currentWorkspace);
  const collabShareKey =
    isCollaborativeWorkspace(currentWorkspace) && currentWorkspace?.shareId
      ? currentWorkspace.shareId
      : '';

  // Subscribe to tasks for active workspace (re-subscribes ONLY when workspace or collab mode changes)
  useEffect(() => {
    if (!workspaceId || !hasCurrentWorkspace) return;
    const unsubscribe = initTasks(workspaceId);
    return () => {
      unsubscribe();
      cleanupTasks();
    };
  }, [workspaceId, hasCurrentWorkspace, collabShareKey, initTasks, cleanupTasks]);

  // Clean consumed ?task=<id> deep-link query param once the workspace is mounted
  useEffect(() => {
    if (searchParams.has('task')) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const visibleTasks = useMemo(
    () => (searchTerm.trim() ? filterTasks(tasks, searchTerm) : tasks),
    [tasks, searchTerm],
  );

  const handleChangeView = useCallback((view: WorkspaceViewMode) => {
    setActiveView(view);
    if (view !== 'timeline') {
      setIsChartExpanded(false);
    }
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

  const handleEditTask = useCallback((task: FlatTask | Task) => {
    setEditingTask(task);
    setParentTaskId(null);
    setNewTaskInitialStatus(null);
    setTaskModalOpen(true);
  }, []);

  const handleAddSubtask = useCallback((parentId: number) => {
    setEditingTask(null);
    setParentTaskId(parentId);
    setNewTaskInitialStatus(null);
    setTaskModalOpen(true);
  }, []);

  const handleSaveTask = useCallback(
    (draft: TaskDraft) => {
      if (editingTask) {
        updateTask(editingTask.id, draft);
        toast.success('Task updated', draft.name);
      } else if (parentTaskId !== null) {
        addSubtask(parentTaskId, draft);
        toast.success('Subtask added', draft.name);
      } else {
        addTask(draft);
        toast.success('Task created', draft.name);
      }
      setTaskModalOpen(false);
      setEditingTask(null);
      setParentTaskId(null);
      setNewTaskInitialStatus(null);
    },
    [editingTask, parentTaskId, updateTask, addSubtask, addTask],
  );

  const handleRequestDeleteTask = useCallback(
    (taskId: number) => {
      const target = findTaskById(taskId);
      if (target) setDeleteTargetTask(target);
    },
    [findTaskById],
  );

  const handleConfirmDeleteTask = useCallback(() => {
    if (!deleteTargetTask) return;
    deleteTask(deleteTargetTask.id);
    if (selectedTaskId === deleteTargetTask.id) {
      setSelectedTaskId(null);
    }
    toast.info('Task deleted', deleteTargetTask.name);
    setDeleteTargetTask(null);
  }, [deleteTargetTask, deleteTask, selectedTaskId]);

  const handleRescheduleTask = useCallback(
    (taskId: number, nextStart: string, nextEnd: string, autoCascade: boolean) => {
      const result = rescheduleTask(taskId, nextStart, nextEnd, autoCascade);
      if (!result.movedTask) return;
      const movedName = result.movedTask.name;
      const undoAction = {
        label: 'Undo',
        onClick: () => {
          restoreTasksSnapshot(result.previousTasks);
          toast.info('Schedule restored', movedName);
        },
      };
      const cascadeCount = result.cascadedTaskIds.length;
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
    },
    [rescheduleTask, restoreTasksSnapshot],
  );

  const handleStatusChange = useCallback(
    (taskId: number, nextStatus: TaskStatus) => {
      const result = setTaskStatus(taskId, nextStatus);
      if (!result.updatedTask) return;
      const taskName = result.updatedTask.name;
      toast.info(
        `Moved to ${TASK_STATUS_LABELS[nextStatus]}`,
        taskName,
        5000,
        {
          label: 'Undo',
          onClick: () => {
            restoreTasksSnapshot(result.previousTasks);
            toast.info('Status restored', taskName);
          },
        },
      );
    },
    [setTaskStatus, restoreTasksSnapshot],
  );

  const handleUpdateProgress = useCallback(
    (taskId: number, progress: number) => {
      updateTask(
        taskId,
        progress === 100
          ? { progress: 100, isDone: true, isWorking: false }
          : { progress, isDone: false },
        { debounce: true },
      );
    },
    [updateTask],
  );

  const handleSaveBaseline = useCallback(() => {
    if (!workspaceId) return;
    void saveBaseline(workspaceId, tasks)
      .then((saved) => {
        if (saved) {
          toast.success(
            'Baseline saved',
            'Ghost bars now compare your original plan against live dates.',
          );
        }
      })
      .catch(() => {
        toast.error('Could not save baseline', 'Please try again.');
      });
  }, [workspaceId, tasks, saveBaseline]);

  const handleClearBaseline = useCallback(() => {
    if (!workspaceId) return;
    void clearBaseline(workspaceId)
      .then(() => {
        toast.info('Baseline cleared');
      })
      .catch(() => {
        toast.error('Could not clear baseline', 'Please try again.');
      });
  }, [workspaceId, clearBaseline]);

  const handleImport = useCallback(
    (inputs: ImportTaskInput[]) => {
      const count = importTasksBatch(inputs);
      toast.success('Import complete', `Added ${count} ${count === 1 ? 'task' : 'tasks'} to your timeline.`);
    },
    [importTasksBatch],
  );

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      const prefs = usePreferencesStore.getState();
      const result = await exportGanttChart(format, tasks, {
        workspaceTitle: currentWorkspace?.title,
        theme: prefs.exportTheme,
        useRoundedSubtasks: prefs.useRoundedSubtasks,
        showDependencyLinesOnExport: prefs.showDependencyLinesOnExport,
        barHeight: prefs.barHeight,
        taskLabelPosition: prefs.taskLabelPosition,
        granularity: ganttRef.current?.getGranularity(),
        baseline: currentWorkspace?.baseline,
      });

      if (result.ok) {
        toast.success(`Exported ${format.toUpperCase()}`, result.filename);
      } else if (result.error) {
        toast.error('Export failed', result.error);
      }
    },
    [tasks, currentWorkspace?.title, currentWorkspace?.baseline],
  );

  const anyModalOpen =
    taskModalOpen ||
    shareModalOpen ||
    settingsModalOpen ||
    importModalOpen ||
    Boolean(deleteTargetTask) ||
    logoutConfirmOpen;

  useKeyboardShortcuts({
    enabled: !anyModalOpen,
    onFocusSearch: () => searchInputRef.current?.focus(),
    onNewTask: handleOpenNewTask,
    onViewChange: handleChangeView,
    onZoomIn: activeView === 'timeline' ? () => ganttRef.current?.zoomIn() : undefined,
    onZoomOut: activeView === 'timeline' ? () => ganttRef.current?.zoomOut() : undefined,
    onResetZoom: activeView === 'timeline' ? () => ganttRef.current?.resetZoom() : undefined,
    onAutoFit: activeView === 'timeline' ? () => ganttRef.current?.autoFit() : undefined,
    onGoToToday: activeView === 'timeline' ? () => ganttRef.current?.scrollToToday() : undefined,
  });

  if (isWorkspacesPending || !currentWorkspace) {
    return <WorkspacePageSkeleton variant="workspace" />;
  }

  return (
    <div
      className={cn(
        'min-h-screen flex flex-col studio-atmosphere text-slate-900 dark:text-slate-50',
        isChartExpanded ? 'overflow-y-auto' : 'h-dvh overflow-hidden',
      )}
    >
      {!isChartExpanded && (
        <AppHeader
          user={user}
          searchTerm={searchTerm}
          searchInputRef={searchInputRef}
          onSearchChange={setSearchTerm}
          onGoHome={() => navigate('/')}
          onOpenSettings={() => setSettingsModalOpen(true)}
          onRequestLogout={() => setLogoutConfirmOpen(true)}
          activeView={activeView}
          onChangeView={handleChangeView}
          isShared={Boolean(currentWorkspace.isShared && currentWorkspace.shareId)}
          onOpenShare={() => setShareModalOpen(true)}
        />
      )}

      <main
        className={cn(
          'relative z-0 flex-1 min-h-0 flex flex-col',
          !isChartExpanded && 'md:p-3 pb-[60px] md:pb-3',
        )}
      >
        {tasksLoading && tasks.length === 0 ? (
          <GanttCanvasSkeleton />
        ) : tasks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-sm w-full text-center rounded-2xl border border-slate-300/80 dark:border-white/10 bg-white dark:bg-surface-dark p-8 shadow-surface-md">
              <div className="inline-flex justify-center mb-4">
                <BrandLogo size="lg" />
              </div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-50">
                No tasks in {currentWorkspace.title}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 mb-6">
                Create your first task or import a JSON project schedule to start building your
                Gantt chart.
              </p>
              <div className="flex items-center justify-center gap-2.5 flex-wrap">
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleOpenNewTask}
                  leftIcon={<Plus className="w-4 h-4" weight="bold" />}
                >
                  Create Task
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setImportModalOpen(true)}
                  leftIcon={
                    <UploadSimple
                      className="w-4 h-4 text-brand-600 dark:text-brand-400"
                      weight="duotone"
                    />
                  }
                >
                  Import JSON
                </Button>
              </div>
            </div>
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-sm w-full text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/[0.06] text-brand-600 dark:text-brand-400 mb-3">
                <MagnifyingGlassMinus className="w-6 h-6" weight="duotone" />
              </div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                No tasks match &ldquo;{searchTerm}&rdquo;
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
                Try a different keyword or clear the search filter.
              </p>
              <Button variant="secondary" size="sm" onClick={() => setSearchTerm('')}>
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
                onTaskActivate={handleEditTask}
                onToggleCollapse={toggleCollapse}
                onSetAllCollapsed={setAllCollapsed}
                onToggleSubtaskDone={toggleSubtaskDone}
                onAddSubtask={handleAddSubtask}
                onDeleteTask={handleRequestDeleteTask}
                onRescheduleTask={handleRescheduleTask}
                baseline={currentWorkspace.baseline}
                onSaveBaseline={handleSaveBaseline}
                onClearBaseline={handleClearBaseline}
                onExpandedChange={setIsChartExpanded}
                mobileView="chart"
              />
            ) : activeView === 'board' ? (
              <KanbanBoardView
                tasks={visibleTasks}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                onTaskActivate={handleEditTask}
                onStatusChange={handleStatusChange}
                onAddTaskWithStatus={handleOpenNewTaskWithStatus}
                onDeleteTask={handleRequestDeleteTask}
                baseline={currentWorkspace.baseline}
              />
            ) : (
              <TaskListView
                tasks={visibleTasks}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                onTaskActivate={handleEditTask}
                onStatusChange={handleStatusChange}
                onUpdateProgress={handleUpdateProgress}
                onRescheduleTask={handleRescheduleTask}
                onToggleCollapse={toggleCollapse}
                onSetAllCollapsed={setAllCollapsed}
                onAddSubtask={handleAddSubtask}
                onDeleteTask={handleRequestDeleteTask}
                baseline={currentWorkspace.baseline}
              />
            )}
          </div>
        )}
      </main>

      {/* Floating Desktop Action Pillbar (Figma / Studio Dock) */}
      <AnimatePresence>
        {!isChartExpanded && (
          <FloatingActionDock
            workspace={currentWorkspace}
            onOpenShare={() => setShareModalOpen(true)}
            onOpenImport={() => setImportModalOpen(true)}
            onExport={(fmt) => void handleExport(fmt)}
            onAddTask={handleOpenNewTask}
          />
        )}
      </AnimatePresence>

      {/* Mobile Bottom Navigation */}
      {!isChartExpanded && (
        <MobileBottomBar
          activeView={activeView}
          onChangeView={handleChangeView}
          onAddTask={handleOpenNewTask}
          onOpenImport={() => setImportModalOpen(true)}
          onExport={(fmt) => void handleExport(fmt)}
        />
      )}

      {/* Modals */}
      {taskModalOpen && (
        <TaskModal
          isOpen={taskModalOpen}
          task={editingTask}
          allTasks={tasks}
          isSubtask={parentTaskId !== null || Boolean(editingTask?.parentId)}
          parentTask={parentTaskId !== null ? findTaskById(parentTaskId) : null}
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

      <ShareModal
        isOpen={shareModalOpen}
        workspace={currentWorkspace}
        onClose={() => setShareModalOpen(false)}
      />

      <SettingsModal isOpen={settingsModalOpen} onClose={() => setSettingsModalOpen(false)} />

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

      <ConfirmationModal
        isOpen={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={() => void logout()}
        title="Sign Out?"
        message="You can sign back in anytime with your Google account."
        confirmText="Sign Out"
        type="logout"
      />
    </div>
  );
}
