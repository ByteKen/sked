import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { FloatingActionDock } from '@/components/workspace/FloatingActionDock';
import { filterTasks } from '@/domain/taskTree';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { exportGanttChart } from '@/services/export';
import { useAuthStore } from '@/store/authStore';
import { useGanttStore } from '@/store/ganttStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { toast } from '@/store/toastStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { ExportFormat, FlatTask, ImportTaskInput, Task, TaskDraft } from '@/types';
import { cn } from '@/utils/cn';

export function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workspacesLoading = useWorkspaceStore((s) => s.loading);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const switchWorkspace = useWorkspaceStore((s) => s.switchWorkspace);

  const {
    tasks,
    initTasks,
    cleanup: cleanupTasks,
    addTask,
    addSubtask,
    updateTask,
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
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const [mobileView, setMobileView] = useState<'chart' | 'list'>('chart');

  // Modal states
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [parentTaskId, setParentTaskId] = useState<number | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [deleteTargetTask, setDeleteTargetTask] = useState<Task | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const currentWorkspace = workspaceId ? (workspaces[workspaceId] ?? null) : null;

  // Validate route param & switch workspace
  useEffect(() => {
    if (workspacesLoading || !workspaceId) return;

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
  }, [workspaceId, workspaces, workspacesLoading, currentWorkspaceId, switchWorkspace, navigate]);

  // Subscribe to tasks for active workspace
  useEffect(() => {
    if (!workspaceId || !workspaces[workspaceId]) return;
    const unsubscribe = initTasks(workspaceId);
    return () => {
      unsubscribe();
      cleanupTasks();
    };
  }, [workspaceId, workspaces, initTasks, cleanupTasks]);

  const visibleTasks = useMemo(
    () => (searchTerm.trim() ? filterTasks(tasks, searchTerm) : tasks),
    [tasks, searchTerm],
  );

  const handleOpenNewTask = useCallback(() => {
    setEditingTask(null);
    setParentTaskId(null);
    setTaskModalOpen(true);
  }, []);

  const handleEditTask = useCallback((task: FlatTask | Task) => {
    setEditingTask(task);
    setParentTaskId(null);
    setTaskModalOpen(true);
  }, []);

  const handleAddSubtask = useCallback((parentId: number) => {
    setEditingTask(null);
    setParentTaskId(parentId);
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
      });

      if (result.ok) {
        toast.success(`Exported ${format.toUpperCase()}`, result.filename);
      } else if (result.error) {
        toast.error('Export failed', result.error);
      }
    },
    [tasks, currentWorkspace?.title],
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
    onZoomIn: () => ganttRef.current?.zoomIn(),
    onZoomOut: () => ganttRef.current?.zoomOut(),
    onResetZoom: () => ganttRef.current?.resetZoom(),
    onAutoFit: () => ganttRef.current?.autoFit(),
    onGoToToday: () => ganttRef.current?.scrollToToday(),
  });

  if (workspacesLoading || !currentWorkspace) {
    return (
      <div className="min-h-screen bg-canvas-light dark:bg-canvas-dark p-6 space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-[75vh] md:col-span-1" />
          <Skeleton className="h-[75vh] md:col-span-3" />
        </div>
      </div>
    );
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
        />
      )}

      <main
        className={cn(
          'relative z-0 flex-1 min-h-0 flex flex-col',
          !isChartExpanded && 'md:p-3 pb-[60px] md:pb-3',
        )}
      >
        {tasks.length === 0 ? (
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
              onExpandedChange={setIsChartExpanded}
              mobileView={mobileView}
            />
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
          workspace={currentWorkspace}
          mobileView={mobileView}
          onChangeView={setMobileView}
          onAddTask={handleOpenNewTask}
          onOpenShare={() => setShareModalOpen(true)}
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
          onSave={handleSaveTask}
          onClose={() => {
            setTaskModalOpen(false);
            setEditingTask(null);
            setParentTaskId(null);
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
