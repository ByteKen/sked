import { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2, Edit2, Plus, CheckCircle2, Circle } from 'lucide-react';
import { useGanttStore } from '../store/ganttStore';
import { usePreferencesStore } from '../store/preferencesStore';

export default function TaskList({ tasks, onEdit, onDelete, onAddSubtask, selectedTaskId, onSelectTask }) {
  const [expanded, setExpanded] = useState({});
  const { toggleSubtaskDone } = useGanttStore();
  const { theme } = usePreferencesStore();

  const toggleExpand = (taskId) => {
    setExpanded((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  const TaskItem = ({ task, level = 0 }) => {
    const isExpanded = expanded[task.id];
    const hasChildren = task.children && task.children.length > 0;
    const isCompleted = task.progress === 100 || task.isDone;
    const isSubtask = level > 0;

    return (
      <div key={task.id}>
        <div
          className={`group flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-all duration-200 ${
            selectedTaskId === task.id
              ? 'bg-gradient-to-r from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20 border border-violet-400/30'
              : isCompleted
                ? theme === 'dark'
                  ? 'bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 hover:border-emerald-500/30'
                  : 'bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60 hover:border-emerald-300'
                : theme === 'dark'
                  ? 'hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06]'
                  : 'hover:bg-slate-50 border border-transparent hover:border-slate-200/60'
          }`}
          style={{ paddingLeft: `${12 + level * 18}px` }}
        >
          {/* Expand/Collapse or Done toggle for subtasks */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(task.id);
              }}
              className={`p-1 rounded-lg transition-all duration-200 ${
                theme === 'dark'
                  ? 'hover:bg-white/10 text-slate-400 hover:text-white'
                  : 'hover:bg-slate-200 text-slate-400 hover:text-slate-600'
              }`}
              title="Toggle expand"
            >
              <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}>
                <ChevronDown className="w-4 h-4" />
              </div>
            </button>
          ) : isSubtask ? (
            /* Done toggle for subtasks without children */
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleSubtaskDone(task.id);
              }}
              className={`p-1 rounded-lg transition-all duration-200 ${
                isCompleted 
                  ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10' 
                  : theme === 'dark'
                    ? 'text-slate-500 hover:text-slate-300 hover:bg-white/10'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200'
              }`}
              title={isCompleted ? 'Mark as incomplete' : 'Mark as done'}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Circle className="w-4 h-4" />
              )}
            </button>
          ) : (
            <div className="w-6" />
          )}

          <div 
            className="flex-1 min-w-0"
            onClick={() => onSelectTask(task.id)}
          >
            <p className={`text-sm font-medium truncate transition-colors ${
              selectedTaskId === task.id 
                ? 'text-white' 
                : isCompleted
                  ? theme === 'dark'
                    ? 'text-emerald-300 line-through decoration-emerald-500/30'
                    : 'text-emerald-600 line-through decoration-emerald-400/30'
                  : theme === 'dark'
                    ? 'text-slate-200'
                    : 'text-slate-700'
            }`}>
              {task.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className={`text-xs font-medium tracking-wide ${
                selectedTaskId === task.id
                  ? 'text-white/60'
                  : theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
              }`}>{task.start}</p>
              {hasChildren && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  task.progress === 100 
                    ? theme === 'dark'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-emerald-100 text-emerald-600'
                    : task.progress > 0
                      ? theme === 'dark'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-amber-100 text-amber-600'
                      : theme === 'dark'
                        ? 'bg-white/10 text-slate-400'
                        : 'bg-slate-100 text-slate-500'
                }`}>
                  {task.progress}%
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-0.5 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
            {!isSubtask && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddSubtask(task.id);
                }}
                className={`p-1.5 rounded-lg transition-all duration-200 active:scale-90 ${
                  theme === 'dark'
                    ? 'hover:bg-cyan-500/20 text-cyan-400/70 hover:text-cyan-400'
                    : 'hover:bg-cyan-100 text-cyan-500/70 hover:text-cyan-600'
                }`}
                title="Add subtask"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(task);
              }}
              className={`p-1.5 rounded-lg transition-all duration-200 active:scale-90 ${
                theme === 'dark'
                  ? 'hover:bg-white/10 text-slate-500 hover:text-slate-300'
                  : 'hover:bg-slate-200 text-slate-400 hover:text-slate-600'
              }`}
              title="Edit task"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task.id);
              }}
              className={`p-1.5 rounded-lg transition-all duration-200 active:scale-90 ${
                theme === 'dark'
                  ? 'hover:bg-red-500/20 text-red-400/70 hover:text-red-400'
                  : 'hover:bg-red-100 text-red-400/70 hover:text-red-500'
              }`}
              title="Delete task"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-0.5">
            {task.children.map((child) => (
              <TaskItem key={child.id} task={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} />
      ))}
    </div>
  );
}
