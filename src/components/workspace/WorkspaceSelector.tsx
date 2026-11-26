import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CaretDown,
  Check,
  FolderSimple,
  GlobeHemisphereWest,
  PencilSimple,
  Plus,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { ConfirmationModal } from '@/components/modals/ConfirmationModal';
import { validateWorkspaceName } from '@/domain/validation';
import { toast } from '@/store/toastStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Workspace } from '@/types';
import { cn } from '@/utils/cn';
import { POPOVER_VARIANTS } from '@/utils/motion';

export function WorkspaceSelector() {
  const navigate = useNavigate();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);

  const [isOpen, setIsOpen] = useState(false);
  const [showNewInput, setShowNewInput] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);

  const currentWorkspace = currentWorkspaceId ? workspaces[currentWorkspaceId] : null;
  const workspaceList = Object.values(workspaces).sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt).getTime() -
      new Date(a.updatedAt || a.createdAt).getTime(),
  );

  const handleCreate = async () => {
    const err = validateWorkspaceName(newName, workspaceList);
    if (err) {
      setInputError(err);
      return;
    }
    const created = await createWorkspace(newName.trim());
    if (created) {
      setNewName('');
      setShowNewInput(false);
      setInputError(null);
      setIsOpen(false);
      toast.success('Workspace created', created.title);
      navigate(`/workspace/${created.id}`);
    }
  };

  const handleSaveRename = async () => {
    if (!editingId) return;
    const err = validateWorkspaceName(editingName, workspaceList, editingId);
    if (err) {
      setInputError(err);
      return;
    }
    await updateWorkspace(editingId, { title: editingName.trim() });
    setEditingId(null);
    setEditingName('');
    setInputError(null);
    toast.success('Workspace renamed');
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const deletedTitle = deleteTarget.title;
    const wasActive = deleteTarget.id === currentWorkspaceId;
    await deleteWorkspace(deleteTarget.id);
    toast.info('Workspace deleted', deletedTitle);
    if (wasActive) {
      const remaining = workspaceList.filter((w) => w.id !== deleteTarget.id);
      if (remaining[0]) {
        navigate(`/workspace/${remaining[0].id}`, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    }
    setDeleteTarget(null);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="flex items-center gap-1.5 sm:gap-2 h-9 px-2.5 sm:px-3 rounded-lg border border-slate-200/90 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.08] text-slate-900 dark:text-slate-100 shadow-surface-sm transition-colors cursor-pointer max-w-[155px] sm:max-w-[230px]"
      >
        <FolderSimple className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0" weight="duotone" />
        <span className="text-[13px] font-semibold truncate">
          {currentWorkspace?.title || 'Select Workspace'}
        </span>
        <CaretDown
          className={cn(
            'w-3.5 h-3.5 text-slate-400 transition-transform shrink-0',
            isOpen && 'rotate-180',
          )}
          weight="bold"
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => {
                setIsOpen(false);
                setShowNewInput(false);
                setEditingId(null);
                setInputError(null);
              }}
            />
            <motion.div
              variants={POPOVER_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="absolute left-0 top-full mt-2 z-50 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-slate-200/90 dark:border-white/[0.12] bg-white dark:bg-surface-elevated shadow-surface-lg dark:shadow-dark-lg overflow-hidden"
            >
              <div className="px-3.5 py-2.5 border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.02]">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Workspaces</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Switch, rename, or start a new timeline
                </p>
              </div>

              <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
                {workspaceList.map((ws) => {
                  const isActive = ws.id === currentWorkspaceId;
                  return (
                    <div
                      key={ws.id}
                      className={cn(
                        'group rounded-lg transition-colors',
                        isActive
                          ? 'bg-brand-50 dark:bg-brand-500/15'
                          : 'hover:bg-slate-100/90 dark:hover:bg-white/[0.06]',
                      )}
                    >
                      {editingId === ws.id ? (
                        <div className="p-2 space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => {
                                setEditingName(e.target.value);
                                setInputError(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleSaveRename();
                                if (e.key === 'Escape') {
                                  setEditingId(null);
                                  setInputError(null);
                                }
                              }}
                              autoFocus
                              className="flex-1 px-2.5 py-1 text-xs rounded-md border border-slate-300 dark:border-white/15 bg-white dark:bg-canvas-dark text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                            <button
                              type="button"
                              aria-label="Save name"
                              onClick={() => void handleSaveRename()}
                              className="p-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 rounded cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" weight="bold" />
                            </button>
                            <button
                              type="button"
                              aria-label="Cancel rename"
                              onClick={() => {
                                setEditingId(null);
                                setInputError(null);
                              }}
                              className="p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 rounded cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" weight="bold" />
                            </button>
                          </div>
                          {inputError && (
                            <p className="text-[11px] text-rose-500 flex items-center gap-1">
                              <WarningCircle className="w-3 h-3" weight="duotone" />
                              {inputError}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setIsOpen(false);
                              if (ws.id !== currentWorkspaceId) {
                                navigate(`/workspace/${ws.id}`);
                              }
                            }}
                            className="flex-1 flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                          >
                            <FolderSimple
                              className={cn(
                                'w-4 h-4 shrink-0',
                                isActive
                                  ? 'text-brand-600 dark:text-brand-400'
                                  : 'text-slate-400 dark:text-slate-500',
                              )}
                              weight="duotone"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={cn(
                                    'text-xs font-medium truncate',
                                    isActive
                                      ? 'text-brand-700 dark:text-brand-300 font-semibold'
                                      : 'text-slate-800 dark:text-slate-100',
                                  )}
                                >
                                  {ws.title}
                                </span>
                                {ws.isShared && (
                                  <GlobeHemisphereWest
                                    className="w-3.5 h-3.5 text-emerald-500 shrink-0"
                                    weight="duotone"
                                    aria-label="Shared publicly"
                                  />
                                )}
                              </div>
                            </div>
                            {isActive && (
                              <Check
                                className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400 shrink-0"
                                weight="bold"
                              />
                            )}
                          </button>

                          <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <button
                              type="button"
                              aria-label={`Rename ${ws.title}`}
                              onClick={() => {
                                setEditingId(ws.id);
                                setEditingName(ws.title);
                                setInputError(null);
                              }}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10 cursor-pointer"
                            >
                              <PencilSimple className="w-3.5 h-3.5" weight="duotone" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${ws.title}`}
                              onClick={() => {
                                setDeleteTarget(ws);
                                setIsOpen(false);
                              }}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                            >
                              <Trash className="w-3.5 h-3.5" weight="duotone" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="p-2 border-t border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.02]">
                {showNewInput ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => {
                          setNewName(e.target.value);
                          setInputError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleCreate();
                          if (e.key === 'Escape') {
                            setShowNewInput(false);
                            setNewName('');
                            setInputError(null);
                          }
                        }}
                        placeholder="Workspace name..."
                        autoFocus
                        className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-canvas-dark text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      <button
                        type="button"
                        onClick={() => void handleCreate()}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-500 cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                    {inputError && (
                      <p className="text-[11px] text-rose-500 flex items-center gap-1">
                        <WarningCircle className="w-3 h-3" weight="duotone" />
                        {inputError}
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowNewInput(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/15 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" weight="bold" />
                    New Workspace
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
        title="Delete Workspace?"
        message={`This will permanently delete "${deleteTarget?.title ?? ''}" and all of its tasks${deleteTarget?.isShared ? ' (and revoke its public share link)' : ''}.`}
        confirmText="Delete Workspace"
        type="delete"
      />
    </div>
  );
}
