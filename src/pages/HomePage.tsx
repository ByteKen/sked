import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarBlank,
  CheckCircle,
  GlobeHemisphereWest,
  MagnifyingGlass,
  Plus,
  SignOut,
  Sparkle,
  Stack,
  UsersThree,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { FocusDashboardPanel } from '@/components/dashboard/FocusDashboardPanel';
import { AppFooter } from '@/components/layout/AppFooter';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { UserProfilePill } from '@/components/layout/UserProfilePill';
import { ConfirmationModal } from '@/components/modals/ConfirmationModal';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { ShareModal } from '@/components/modals/ShareModal';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { WorkspaceCard } from '@/components/workspace/WorkspaceCard';
import { buildPortfolioFocusSummary } from '@/domain/projectHealth';
import { TASK_STATUS_LABELS } from '@/domain/taskViews';
import { formatISODate, getTodayLocal } from '@/domain/timeline';
import { validateWorkspaceName } from '@/domain/validation';
import { subscribeToSharedWithMeCharts } from '@/services/shareRepository';
import { userDocumentSync } from '@/services/userDocumentSync';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { SharedChartAccess, Task, TaskStatus, Workspace } from '@/types';
import { cn } from '@/utils/cn';
import { FADE_UP_ITEM, STAGGER_CONTAINER } from '@/utils/motion';

type WorkspaceHealthFilter = 'all' | 'attention' | 'on-track' | 'completed';

const SUGGESTIONS = ['Product Roadmap 2026', 'Website Redesign', 'Sprint Launch Plan', 'Research Timeline'];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function HomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workspaceStats = useWorkspaceStore((s) => s.workspaceStats);
  const workspaceTasks = useWorkspaceStore((s) => s.workspaceTasks);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);
  const updateTaskStatusInWorkspace = useWorkspaceStore((s) => s.updateTaskStatusInWorkspace);
  const restoreWorkspaceTasksSnapshot = useWorkspaceStore((s) => s.restoreWorkspaceTasksSnapshot);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);

  const [searchQuery, setSearchQuery] = useState('');
  const [healthFilter, setHealthFilter] = useState<WorkspaceHealthFilter>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const [shareWorkspace, setShareWorkspace] = useState<Workspace | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [sharedWithMe, setSharedWithMe] = useState<SharedChartAccess[]>([]);

  // Subscribe to collaborative charts shared with this user's Google email ONLY while Home is open
  useEffect(() => {
    if (!user?.email) {
      return;
    }
    const unsubscribe = subscribeToSharedWithMeCharts(user.email, (charts) => {
      setSharedWithMe(charts.filter((c) => c.ownerId !== user.id));
    });
    return () => unsubscribe();
  }, [user?.email, user?.id]);

  const workspaceList = useMemo(
    () =>
      Object.values(workspaces).sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime(),
      ),
    [workspaces],
  );

  const todayISO = useMemo(() => formatISODate(getTodayLocal()), []);

  const portfolioFocus = useMemo(
    () => buildPortfolioFocusSummary(workspaces, workspaceTasks, todayISO),
    [workspaces, workspaceTasks, todayISO],
  );

  const filteredWorkspaces = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return workspaceList.filter((w) => {
      if (q && !w.title.toLowerCase().includes(q)) return false;
      if (healthFilter === 'all') return true;
      const health = portfolioFocus.healthByWorkspaceId[w.id]?.health;
      if (healthFilter === 'attention') {
        return health === 'at-risk' || health === 'off-track';
      }
      if (healthFilter === 'on-track') return health === 'on-track';
      if (healthFilter === 'completed') return health === 'completed';
      return true;
    });
  }, [workspaceList, searchQuery, healthFilter, portfolioFocus.healthByWorkspaceId]);

  const handleFocusStatusUpdate = async (
    workspaceId: string,
    taskId: number,
    status: TaskStatus,
  ) => {
    try {
      const result = await updateTaskStatusInWorkspace(workspaceId, taskId, status);
      if (!result.updatedTask) return;
      const taskName = result.updatedTask.name;
      toast.success(`Moved to ${TASK_STATUS_LABELS[status]}`, taskName, 5000, {
        label: 'Undo',
        onClick: () => {
          void restoreWorkspaceTasksSnapshot(workspaceId, result.previousTasks).then(() => {
            toast.info('Status restored', taskName);
          });
        },
      });
    } catch {
      toast.error('Could not update task status', 'Please try again.');
    }
  };

  const aggregateStats = useMemo(() => {
    let totalTasks = 0;
    let totalCompleted = 0;
    let sharedCount = 0;
    for (const ws of workspaceList) {
      const s = workspaceStats[ws.id];
      if (s) {
        totalTasks += s.total;
        totalCompleted += s.completed;
      }
      if (ws.isShared && ws.shareId) sharedCount += 1;
    }
    return { totalTasks, totalCompleted, sharedCount };
  }, [workspaceList, workspaceStats]);

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  const handleCreate = async () => {
    const err = validateWorkspaceName(newWorkspaceName, workspaceList);
    if (err) {
      setInputError(err);
      return;
    }

    setIsCreating(true);
    try {
      const created = await createWorkspace(newWorkspaceName.trim());
      if (created) {
        setNewWorkspaceName('');
        setInputError(null);
        setShowCreateModal(false);
        toast.success('Workspace created', created.title);
        navigate(`/workspace/${created.id}`);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveRename = async () => {
    if (!editingId) return;
    const err = validateWorkspaceName(editingName, workspaceList, editingId);
    if (err) {
      setEditError(err);
      return;
    }
    await updateWorkspace(editingId, { title: editingName.trim() });
    setEditingId(null);
    setEditingName('');
    setEditError(null);
    toast.success('Workspace renamed');
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const title = deleteTarget.title;
    await deleteWorkspace(deleteTarget.id);
    toast.info('Workspace deleted', title);
    setDeleteTarget(null);
  };

  const shareWorkspaceTasks = useMemo<Task[]>(() => {
    if (!shareWorkspace) return [];
    const snap = userDocumentSync.getLatestSnapshot();
    const raw = snap?.data?.[`tasks_${shareWorkspace.id}`];
    return Array.isArray(raw) ? (raw as Task[]) : [];
  }, [shareWorkspace]);

  const activeShareWorkspace = shareWorkspace ? (workspaces[shareWorkspace.id] ?? shareWorkspace) : null;

  return (
    <div className="relative min-h-screen flex flex-col studio-atmosphere text-slate-900 dark:text-slate-50">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 studio-grain" />

      {/* Substantial Unified Studio Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-white/[0.08] bg-white/85 dark:bg-[#090B10]/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 sm:h-[72px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandLogo size="md" />
            <span className="font-mono text-sm sm:text-[15px] font-bold uppercase tracking-[0.22em] text-slate-900 dark:text-slate-100">
              SKED
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5">
            <ThemeToggle />

            {user && (
              <UserProfilePill
                user={user}
                onClick={() => setShowSettingsModal(true)}
                hideDetailsBelow="sm"
              />
            )}

            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              aria-label="Sign out"
              title="Sign out"
              className="inline-flex items-center justify-center h-10 w-10 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-500/15 transition-colors cursor-pointer"
            >
              <SignOut className="w-5 h-5" weight="duotone" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
        {/* Kroma-Style Open Editorial Hero */}
        <motion.div
          variants={STAGGER_CONTAINER}
          initial="hidden"
          animate="visible"
          className="mb-10 sm:mb-12"
        >
          <motion.div
            variants={FADE_UP_ITEM}
            className="flex flex-col md:flex-row md:items-end justify-between gap-6"
          >
            <div>
              {workspaceList.length > 0 && (
                <div className="inline-flex flex-wrap items-center gap-3 px-3.5 py-1.5 rounded-full border border-slate-200/90 dark:border-white/[0.09] bg-white/85 dark:bg-white/[0.04] shadow-surface-sm text-xs mb-5">
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
                    <Stack className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" weight="duotone" />
                    <span className="font-mono font-semibold tabular-nums">
                      {workspaceList.length}
                    </span>{' '}
                    {workspaceList.length === 1 ? 'workspace' : 'workspaces'}
                  </span>
                  <span className="h-3 w-px bg-slate-200 dark:bg-white/10" />
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
                    <CheckCircle
                      className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400"
                      weight="duotone"
                    />
                    <span className="font-mono font-semibold tabular-nums">
                      {aggregateStats.totalCompleted}/{aggregateStats.totalTasks}
                    </span>{' '}
                    done
                  </span>
                  <span className="h-3 w-px bg-slate-200 dark:bg-white/10" />
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
                    <GlobeHemisphereWest
                      className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400"
                      weight="duotone"
                    />
                    <span className="font-mono font-semibold tabular-nums">
                      {aggregateStats.sharedCount}
                    </span>{' '}
                    shared
                  </span>
                  {portfolioFocus.counts.atRiskWorkspaces + portfolioFocus.counts.offTrackWorkspaces >
                    0 && (
                    <>
                      <span className="h-3 w-px bg-slate-200 dark:bg-white/10" />
                      <span className="inline-flex items-center gap-1.5 font-medium text-rose-700 dark:text-rose-300">
                        <WarningCircle className="w-3.5 h-3.5 text-rose-500" weight="duotone" />
                        <span className="font-mono font-semibold tabular-nums">
                          {portfolioFocus.counts.atRiskWorkspaces +
                            portfolioFocus.counts.offTrackWorkspaces}
                        </span>{' '}
                        need attention
                      </span>
                    </>
                  )}
                </div>
              )}

              <h1 className="text-3xl sm:text-5xl font-bold tracking-[-0.03em] text-slate-900 dark:text-white leading-[1.08]">
                {getGreeting()},{' '}
                <span className="font-serif-editorial italic font-normal text-[40px] sm:text-[58px] tracking-normal text-brand-600 dark:text-brand-400">
                  {firstName}
                </span>
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-2.5 max-w-lg">
                Pick up an active timeline, monitor progress across phases, or share a live chart
                link with collaborators.
              </p>
            </div>

            {workspaceList.length > 0 && (
              <Button
                variant="primary"
                size="lg"
                onClick={() => setShowCreateModal(true)}
                leftIcon={<Plus className="w-4 h-4" weight="bold" />}
              >
                New Workspace
              </Button>
            )}
          </motion.div>
        </motion.div>

        {/* Workspaces Grid or First-Time Onboarding */}
        {workspaceList.length > 0 ? (
          <>
            {aggregateStats.totalTasks > 0 && (
              <FocusDashboardPanel
                summary={portfolioFocus}
                onOpenTask={(wsId, taskId) => navigate(`/workspace/${wsId}?task=${taskId}`)}
                onUpdateTaskStatus={(wsId, taskId, status) =>
                  void handleFocusStatusUpdate(wsId, taskId, status)
                }
              />
            )}

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-200/80 dark:border-white/[0.07]">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Your Workspaces
                </h2>

                {workspaceList.length > 1 && (
                  <div
                    role="group"
                    aria-label="Filter workspaces by health"
                    className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/60 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08]"
                  >
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'attention', label: 'Needs Attention' },
                        { id: 'on-track', label: 'On Track' },
                        { id: 'completed', label: 'Completed' },
                      ] as const
                    ).map((opt) => {
                      const active = healthFilter === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setHealthFilter(opt.id)}
                          className={cn(
                            'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer',
                            active
                              ? 'bg-white dark:bg-surface-elevated text-slate-900 dark:text-white shadow-surface-sm'
                              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
                          )}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="relative w-full lg:w-72">
                <MagnifyingGlass
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                  weight="duotone"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter workspaces..."
                  aria-label="Filter workspaces"
                  className="w-full h-10 pl-9 pr-8 text-sm rounded-xl border border-slate-200/90 dark:border-white/[0.09] bg-white dark:bg-surface-dark text-slate-900 dark:text-slate-100 placeholder:text-slate-400 shadow-surface-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Clear filter"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" weight="bold" />
                  </button>
                )}
              </div>
            </div>

            {filteredWorkspaces.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/15 bg-white/70 dark:bg-surface-dark/70 p-10 text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {searchQuery
                    ? `No workspaces match "${searchQuery}"`
                    : 'No workspaces match this health filter'}
                </p>
                <Button
                  variant="subtle"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    setSearchQuery('');
                    setHealthFilter('all');
                  }}
                >
                  Reset filters
                </Button>
              </div>
            ) : (
              <motion.div
                variants={STAGGER_CONTAINER}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
              >
                {filteredWorkspaces.map((ws, idx) => (
                  <motion.div key={ws.id} variants={FADE_UP_ITEM}>
                    <WorkspaceCard
                      workspace={ws}
                      stats={workspaceStats[ws.id]}
                      health={portfolioFocus.healthByWorkspaceId[ws.id]}
                      accentIndex={idx}
                      isEditing={editingId === ws.id}
                      editingName={editingName}
                      inputError={editError}
                      onOpen={(id) => navigate(`/workspace/${id}`)}
                      onStartEdit={(target) => {
                        setEditingId(target.id);
                        setEditingName(target.title);
                        setEditError(null);
                      }}
                      onChangeEditName={(val) => {
                        setEditingName(val);
                        setEditError(null);
                      }}
                      onSaveEdit={() => void handleSaveRename()}
                      onCancelEdit={() => {
                        setEditingId(null);
                        setEditError(null);
                      }}
                      onShare={(target) => setShareWorkspace(target)}
                      onDelete={(target) => setDeleteTarget(target)}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-200/90 dark:border-white/[0.09] bg-white dark:bg-surface-dark p-8 sm:p-12 shadow-surface-md dark:shadow-dark-md"
          >
            <div className="max-w-md mx-auto text-center">
              <div className="inline-flex justify-center mb-6">
                <BrandLogo size="xl" glow />
              </div>

              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Create your first{' '}
                <span className="font-serif-editorial italic font-normal text-3xl sm:text-4xl text-brand-600 dark:text-brand-400">
                  workspace
                </span>
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 mb-6">
                Each workspace holds its own Gantt timeline, nested phases, and optional live share
                link.
              </p>

              <div className="space-y-3 text-left">
                <div>
                  <label htmlFor="first-workspace-name" className="sr-only">
                    Workspace name
                  </label>
                  <input
                    id="first-workspace-name"
                    type="text"
                    value={newWorkspaceName}
                    onChange={(e) => {
                      setNewWorkspaceName(e.target.value);
                      setInputError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleCreate();
                    }}
                    placeholder="e.g., Product Launch 2026"
                    className="w-full h-11 px-4 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-canvas-dark text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  {inputError && (
                    <p className="mt-1.5 text-xs text-rose-500 flex items-center gap-1">
                      <WarningCircle className="w-3.5 h-3.5" weight="duotone" />
                      {inputError}
                    </p>
                  )}
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  loading={isCreating}
                  onClick={() => void handleCreate()}
                  className="w-full"
                  leftIcon={<Plus className="w-4 h-4" weight="bold" />}
                >
                  Create Workspace
                </Button>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/[0.06] text-left">
                <p className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                  <Sparkle className="w-3.5 h-3.5 text-brand-500" weight="duotone" />
                  Quick ideas
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setNewWorkspaceName(s);
                        setInputError(null);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-white/[0.05] dark:hover:bg-white/[0.1] dark:text-slate-300 transition-colors cursor-pointer"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Shared With Me (Invited Collaborative Workspaces) */}
        {sharedWithMe.length > 0 && (
          <section aria-label="Shared with me" className="mt-12">
            <div className="flex items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-200/80 dark:border-white/[0.07]">
              <div className="flex items-center gap-2">
                <UsersThree
                  weight="duotone"
                  className="w-4 h-4 text-brand-600 dark:text-brand-400"
                />
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Shared With Me
                </h2>
                <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 tabular-nums">
                  {sharedWithMe.length}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {sharedWithMe.map((chart) => (
                <button
                  key={chart.shareId}
                  type="button"
                  data-testid={`shared-with-me-${chart.shareId}`}
                  onClick={() => navigate(`/share/${chart.shareId}`)}
                  className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-surface-dark p-4 text-left hover:border-brand-400/80 hover:shadow-surface-md dark:hover:border-brand-400/50 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200/80 dark:bg-brand-500/15 dark:text-brand-300 dark:border-brand-400/30 text-[10px] font-semibold">
                        <UsersThree weight="duotone" className="w-3 h-3" />
                        Editor
                      </span>
                      <ArrowUpRight
                        weight="bold"
                        className="w-4 h-4 text-slate-400 group-hover:text-brand-600 dark:group-hover:text-brand-400 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      />
                    </div>

                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 truncate">
                      {chart.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      Shared by {chart.ownerName}
                    </p>
                    <p className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                      <CalendarBlank className="w-3.5 h-3.5 shrink-0" weight="duotone" />
                      Updated{' '}
                      {new Date(chart.updatedAt || chart.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Live collaborative workspace</span>
                    <span className="font-semibold text-brand-600 dark:text-brand-400">Open</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      <AppFooter />

      {/* Create Workspace Modal (Wide-screen proportional) */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setNewWorkspaceName('');
          setInputError(null);
        }}
        title="New Workspace"
        description="Start a new project timeline with nested phases and live sharing"
        maxWidth="md"
        icon={
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
            <Stack weight="duotone" className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          </div>
        }
        footer={
          <div className="flex justify-end gap-2.5">
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setShowCreateModal(false);
                setNewWorkspaceName('');
                setInputError(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" size="md" loading={isCreating} onClick={() => void handleCreate()}>
              Create Workspace
            </Button>
          </div>
        }
      >
        <div className="p-6 sm:p-7 space-y-5">
          <div>
            <label
              htmlFor="new-workspace-input"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2"
            >
              Workspace Name
            </label>
            <input
              id="new-workspace-input"
              type="text"
              value={newWorkspaceName}
              onChange={(e) => {
                setNewWorkspaceName(e.target.value);
                setInputError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
              }}
              placeholder="e.g., Q3 Launch Roadmap"
              autoFocus
              className="w-full h-11 px-4 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas-dark text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {inputError && (
              <p className="mt-2 text-xs text-rose-500 flex items-center gap-1.5">
                <WarningCircle className="w-4 h-4" weight="duotone" />
                {inputError}
              </p>
            )}
          </div>

          <div>
            <p className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5">
              <Sparkle className="w-3.5 h-3.5 text-brand-500" weight="duotone" />
              Quick picks
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setNewWorkspaceName(s);
                    setInputError(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] dark:text-slate-300 transition-colors cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <SettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} />

      <ShareModal
        isOpen={Boolean(activeShareWorkspace)}
        workspace={activeShareWorkspace}
        tasksOverride={shareWorkspaceTasks}
        onClose={() => setShareWorkspace(null)}
      />

      <ConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
        title="Delete Workspace?"
        message={`This will permanently delete "${deleteTarget?.title ?? ''}" and all of its tasks${deleteTarget?.isShared ? ', and disable its public share link' : ''}.`}
        confirmText="Delete Workspace"
        type="delete"
      />

      <ConfirmationModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={() => void logout()}
        title="Sign Out?"
        message="You can sign back in anytime with your Google account."
        confirmText="Sign Out"
        type="logout"
      />
    </div>
  );
}
