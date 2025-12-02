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
          className={`group flex items-center gap-1.5 p-2 rounded-lg cursor-pointer transition ${
            selectedTaskId === task.id
              ? 'bg-gradient-to-r from-cyan-600 to-violet-600 border border-cyan-500/50'
              : isCompleted
                ? theme === 'dark'
                  ? 'bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20'
                  : 'bg-emerald-100 hover:bg-emerald-200 border border-emerald-300'
                : theme === 'dark'
                  ? 'hover:bg-white/5 border border-transparent'
                  : 'hover:bg-slate-100 border border-transparent'
          }`}
          style={{ paddingLeft: `${8 + level * 16}px` }}
        >
          {/* Expand/Collapse or Done toggle for subtasks */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(task.id);
              }}
              className="p-0.5 hover:bg-white/10 rounded transition"
              title="Toggle expand"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </button>
          ) : isSubtask ? (
            /* Done toggle for subtasks without children */
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleSubtaskDone(task.id);
              }}
              className={`p-0.5 rounded transition ${
                isCompleted 
                  ? 'text-emerald-400 hover:text-emerald-300' 
                  : 'text-slate-500 hover:text-slate-300'
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
            <div className="w-5" />
          )}

          <div 
            className="flex-1 min-w-0"
            onClick={() => onSelectTask(task.id)}
          >
            <p className={`text-sm font-medium truncate ${
              selectedTaskId === task.id 
                ? 'text-white' 
                : isCompleted
                  ? theme === 'dark'
                    ? 'text-emerald-300 line-through decoration-emerald-500/50'
                    : 'text-emerald-600 line-through decoration-emerald-400/50'
                  : theme === 'dark'
                    ? 'text-slate-200'
                    : 'text-slate-700'
            }`}>
              {task.name}
            </p>
            <div className="flex items-center gap-2">
              <p className={`text-xs font-medium ${
                theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
              }`}>{task.start}</p>
              {hasChildren && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  task.progress === 100 
                    ? theme === 'dark'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-emerald-100 text-emerald-600'
                    : theme === 'dark'
                      ? 'bg-white/10 text-slate-400'
                      : 'bg-slate-100 text-slate-500'
                }`}>
                  {task.progress}%
                </span>
              )}
            </div>
          </div>

          {/* Action buttons - always visible for better mobile UX */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {!isSubtask && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddSubtask(task.id);
                }}
                className={`p-1.5 rounded transition ${
                  theme === 'dark'
                    ? 'hover:bg-cyan-600/50 text-cyan-400/70 hover:text-cyan-400'
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
              className={`p-1.5 rounded transition ${
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
              className={`p-1.5 rounded transition ${
                theme === 'dark'
                  ? 'hover:bg-red-600/50 text-red-400/70 hover:text-red-400'
                  : 'hover:bg-red-100 text-red-400/70 hover:text-red-500'
              }`}
              title="Delete task"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div>
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
