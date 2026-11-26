import { useState, type MouseEvent } from 'react';
import {
  ArrowUpRight,
  CalendarBlank,
  Check,
  DotsThree,
  GlobeHemisphereWest,
  PencilSimple,
  ShareNetwork,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge } from '@/components/ui/Badge';
import type { TaskStats, Workspace } from '@/types';
import { cn } from '@/utils/cn';
import { POPOVER_VARIANTS, SPRING_SNAPPY } from '@/utils/motion';

export interface WorkspaceCardProps {
  workspace: Workspace;
  stats?: TaskStats;
  accentIndex: number;
  isEditing: boolean;
  editingName: string;
  inputError: string | null;
  onOpen: (id: string) => void;
  onStartEdit: (workspace: Workspace) => void;
  onChangeEditName: (val: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onShare: (workspace: Workspace) => void;
  onDelete: (workspace: Workspace) => void;
}

const PREVIEW_LAYOUTS = [
  [
    { ml: '0%', w: '56%', cls: 'bg-brand-600 dark:bg-brand-500' },
    { ml: '24%', w: '44%', cls: 'bg-brand-400/90 dark:bg-brand-400/80' },
    { ml: '50%', w: '34%', cls: 'bg-emerald-500/90' },
  ],
  [
    { ml: '6%', w: '48%', cls: 'bg-brand-600 dark:bg-brand-500' },
    { ml: '18%', w: '52%', cls: 'bg-brand-400/90 dark:bg-brand-400/80' },
    { ml: '44%', w: '38%', cls: 'bg-slate-400/70 dark:bg-slate-500/80' },
  ],
  [
    { ml: '0%', w: '42%', cls: 'bg-emerald-500/90' },
    { ml: '28%', w: '46%', cls: 'bg-brand-600 dark:bg-brand-500' },
    { ml: '56%', w: '30%', cls: 'bg-brand-400/90 dark:bg-brand-400/80' },
  ],
];

export function WorkspaceCard({
  workspace,
  stats,
  accentIndex,
  isEditing,
  editingName,
  inputError,
  onOpen,
  onStartEdit,
  onChangeEditName,
  onSaveEdit,
  onCancelEdit,
  onShare,
  onDelete,
}: WorkspaceCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const bars = PREVIEW_LAYOUTS[accentIndex % PREVIEW_LAYOUTS.length] ?? PREVIEW_LAYOUTS[0]!;
  const taskCount = stats?.total ?? 0;
  const percent = stats?.completionPercent ?? 0;

  const stopAnd = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      whileHover={isEditing ? undefined : { y: -3 }}
      transition={SPRING_SNAPPY}
      onClick={() => !isEditing && onOpen(workspace.id)}
      onKeyDown={(e) => {
        if (!isEditing && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen(workspace.id);
        }
      }}
      className={cn(
        'group relative flex flex-col justify-between rounded-2xl border transition-[border-color,box-shadow] duration-150 cursor-pointer text-left',
        'bg-white border-slate-200/90 hover:border-brand-400/80 hover:shadow-surface-md',
        'dark:bg-surface-dark dark:border-white/[0.08] dark:hover:border-brand-400/50 dark:hover:shadow-dark-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        menuOpen && 'z-30',
      )}
    >
      {/* Harmonious Cohesive Cobalt Mini-Gantt Header */}
      <div className="relative h-24 px-4 py-3.5 rounded-t-2xl bg-slate-50/90 dark:bg-white/[0.025] border-b border-slate-200/70 dark:border-white/[0.06]">
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-t-2xl overflow-hidden bg-[linear-gradient(to_right,rgba(15,23,42,0.045)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:28px_100%]"
        />

        <div aria-hidden="true" className="relative space-y-2 pt-0.5">
          {bars.map((bar, i) => (
            <div
              key={i}
              style={{ marginLeft: bar.ml, width: bar.w }}
              className={cn('h-3 rounded-[5px] gantt-bar-polished', bar.cls)}
            />
          ))}
        </div>

        {/* Top-right controls */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          {workspace.isShared && (
            <Badge variant="emerald">
              <GlobeHemisphereWest className="w-3 h-3" weight="duotone" />
              Live
            </Badge>
          )}

          <div className="relative">
            <button
              type="button"
              aria-label={`Workspace options for ${workspace.title}`}
              onClick={stopAnd(() => setMenuOpen((v) => !v))}
              className="p-1.5 rounded-lg bg-white/95 dark:bg-surface-elevated/95 border border-slate-200/80 dark:border-white/10 text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white shadow-surface-sm cursor-pointer"
            >
              <DotsThree className="w-4 h-4" weight="bold" />
            </button>

            <AnimatePresence>
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={stopAnd(() => setMenuOpen(false))}
                  />
                  <motion.div
                    variants={POPOVER_VARIANTS}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="absolute right-0 top-full mt-1 z-40 w-40 rounded-xl border border-slate-200/90 dark:border-white/12 bg-white dark:bg-surface-elevated shadow-surface-lg dark:shadow-dark-lg p-1"
                  >
                    <button
                      type="button"
                      onClick={stopAnd(() => {
                        setMenuOpen(false);
                        onShare(workspace);
                      })}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer"
                    >
                      <ShareNetwork
                        className="w-4 h-4 text-brand-600 dark:text-brand-400"
                        weight="duotone"
                      />
                      Share Link
                    </button>
                    <button
                      type="button"
                      onClick={stopAnd(() => {
                        setMenuOpen(false);
                        onStartEdit(workspace);
                      })}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer"
                    >
                      <PencilSimple
                        className="w-4 h-4 text-slate-500 dark:text-slate-400"
                        weight="duotone"
                      />
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={stopAnd(() => {
                        setMenuOpen(false);
                        onDelete(workspace);
                      })}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/15 cursor-pointer"
                    >
                      <Trash className="w-4 h-4" weight="duotone" />
                      Delete
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          {isEditing ? (
            <div className="space-y-1.5 mb-2" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => onChangeEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSaveEdit();
                    if (e.key === 'Escape') onCancelEdit();
                  }}
                  autoFocus
                  className="flex-1 px-2.5 py-1.5 text-sm font-medium rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-canvas-dark text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  type="button"
                  aria-label="Save workspace name"
                  onClick={onSaveEdit}
                  className="p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 cursor-pointer"
                >
                  <Check className="w-4 h-4" weight="bold" />
                </button>
                <button
                  type="button"
                  aria-label="Cancel rename"
                  onClick={onCancelEdit}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-4 h-4" weight="bold" />
                </button>
              </div>
              {inputError && (
                <p className="text-xs text-rose-500 flex items-center gap-1">
                  <WarningCircle className="w-3.5 h-3.5" weight="duotone" />
                  {inputError}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 truncate">
                {workspace.title}
              </h3>
              <ArrowUpRight
                className="w-4 h-4 text-slate-400 group-hover:text-brand-600 dark:group-hover:text-brand-400 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                weight="bold"
              />
            </div>
          )}

          <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
            <CalendarBlank className="w-3.5 h-3.5 shrink-0 text-slate-400" weight="duotone" />
            Updated{' '}
            {new Date(workspace.updatedAt || workspace.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>

        {/* Bottom Progress & Task Count */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/[0.06] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono font-medium text-slate-600 dark:text-slate-300 tabular-nums">
              {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
            </span>
            <span
              className={cn(
                'font-mono font-bold tabular-nums',
                percent === 100
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-brand-600 dark:text-brand-400',
              )}
            >
              {percent}%
            </span>
          </div>

          <div className="h-1.5 rounded-full bg-slate-200/75 dark:bg-white/[0.07] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'h-full rounded-full',
                percent === 100 ? 'bg-emerald-500' : 'bg-brand-600 dark:bg-brand-500',
              )}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
