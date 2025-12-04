import { useState } from 'react';
import { X, Check, Calendar, Clock, Target, CheckCircle2, Play, AlertCircle } from 'lucide-react';
import { usePreferencesStore } from '../store/preferencesStore';
import { useGanttStore } from '../store/ganttStore';

export default function TaskModal({ task, onSave, onClose, allTasks = [], isSubtask = false, parentTask = null }) {
  const { theme } = usePreferencesStore();
  const { findTaskById } = useGanttStore();
  const [isDeadlineOnly, setIsDeadlineOnly] = useState(task?.isDeadline || false);
  const [isDone, setIsDone] = useState(task?.isDone || task?.progress === 100 || false);
  const [isWorking, setIsWorking] = useState(task?.isWorking || false);
  const [validationError, setValidationError] = useState(null);
  
  // Check if this task has children (is a parent task)
  const hasChildren = task?.children && task.children.length > 0;
  
  // Find parent task if this is a subtask
  const parent = parentTask || (task?.parentId ? findTaskById(task.parentId) : null);
  
  const [formData, setFormData] = useState(
    task || {
      name: '',
      start: '',
      end: '',
      progress: 0,
      isMilestone: false,
      isDeadline: false,
      isDone: false,
      isWorking: false,
      dependencies: [],
    }
  );

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setValidationError(null); // Clear error on change
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? parseInt(value) : value,
    }));
  };

  const handleDeadlineModeToggle = (deadlineMode) => {
    setValidationError(null);
    setIsDeadlineOnly(deadlineMode);
    if (deadlineMode) {
      // When switching to deadline mode, copy end date to start (same day)
      setFormData((prev) => ({
        ...prev,
        isDeadline: true,
        start: prev.end || prev.start,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        isDeadline: false,
      }));
    }
  };

  const handleDeadlineDateChange = (e) => {
    const date = e.target.value;
    setValidationError(null);
    setFormData((prev) => ({
      ...prev,
      start: date,
      end: date,
    }));
  };

  const handleDependencyToggle = (taskId) => {
    setFormData((prev) => ({
      ...prev,
      dependencies: prev.dependencies?.includes(taskId)
        ? prev.dependencies.filter((id) => id !== taskId)
        : [...(prev.dependencies || []), taskId],
    }));
  };

  // Validation helper functions
  const validateTaskName = (name) => {
    if (!name.trim()) {
      return { valid: false, error: 'Task name is required', description: 'Please enter a name for your task.' };
    }
    if (name.trim().length < 2) {
      return { valid: false, error: 'Task name too short', description: 'Task name should be at least 2 characters long.' };
    }
    if (name.trim().length > 100) {
      return { valid: false, error: 'Task name too long', description: 'Task name should be less than 100 characters.' };
    }
    return { valid: true };
  };

  const validateDates = (start, end, isDeadline) => {
    if (isDeadline) {
      if (!end) {
        return { valid: false, error: 'Deadline date required', description: 'Please select a deadline date for your task.' };
      }
    } else {
      if (!start) {
        return { valid: false, error: 'Start date required', description: 'Please select when this task should begin.' };
      }
      if (!end) {
        return { valid: false, error: 'End date required', description: 'Please select when this task should be completed.' };
      }
      
      const startDate = new Date(start);
      const endDate = new Date(end);
      
      if (endDate < startDate) {
        return { 
          valid: false, 
          error: 'Invalid date range', 
          description: 'The end date cannot be before the start date. Please adjust your dates.' 
        };
      }
    }
    return { valid: true };
  };

  const validateSubtaskDates = (start, end, parentStart, parentEnd) => {
    const taskStart = new Date(start);
    const taskEnd = new Date(end);
    const pStart = new Date(parentStart);
    const pEnd = new Date(parentEnd);
    
    if (taskStart < pStart) {
      return { 
        valid: false, 
        error: 'Start date outside parent range', 
        description: `Subtask cannot start before the parent task (${formatDate(parentStart)}). Please choose a later start date.`
      };
    }
    
    if (taskEnd > pEnd) {
      return { 
        valid: false, 
        error: 'End date exceeds parent deadline', 
        description: `Subtask must end by ${formatDate(parentEnd)} (parent's end date). Please adjust the end date.`
      };
    }
    
    return { valid: true };
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError(null);
    
    // Validate task name
    const nameValidation = validateTaskName(formData.name);
    if (!nameValidation.valid) {
      setValidationError(nameValidation);
      return;
    }
    
    // Validate dates
    const dateValidation = validateDates(formData.start, formData.end, isDeadlineOnly);
    if (!dateValidation.valid) {
      setValidationError(dateValidation);
      return;
    }
    
    // For subtasks, validate dates are within parent range
    if ((isSubtask || parent) && parent) {
      const subtaskDateValidation = validateSubtaskDates(
        isDeadlineOnly ? formData.end : formData.start,
        formData.end,
        parent.start,
        parent.end
      );
      if (!subtaskDateValidation.valid) {
        setValidationError(subtaskDateValidation);
        return;
      }
    }
    
    // For subtasks, set progress based on isDone
    const progressValue = isSubtask ? (isDone ? 100 : 0) : formData.progress;
    
    if (isDeadlineOnly) {
      // Ensure start equals end for deadline tasks
      onSave({ 
        ...formData, 
        start: formData.end, 
        isDeadline: true, 
        isDone: isSubtask ? isDone : false,
        isWorking: isSubtask ? isWorking : false,
        progress: progressValue 
      });
    } else {
      onSave({ 
        ...formData, 
        isDeadline: false,
        isDone: isSubtask ? isDone : false,
        isWorking: isSubtask ? isWorking : false,
        progress: progressValue
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className={`rounded-2xl max-w-md w-full shadow-2xl border overflow-hidden ${
        theme === 'dark' 
          ? 'bg-slate-900 border-white/10' 
          : 'bg-white border-slate-200'
      }`}>
        {/* Gradient accent */}
        <div className="h-1 bg-gradient-to-r from-cyan-500 via-violet-500 to-cyan-500" />
        
        {/* Header */}
        <div className={`flex items-center justify-between p-5 border-b ${
          theme === 'dark' ? 'border-white/5' : 'border-slate-200'
        }`}>
          <h2 className={`text-lg font-bold ${
            theme === 'dark' 
              ? 'bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent' 
              : 'text-slate-900'
          }`}>
            {task ? 'Edit Task' : 'New Task'}
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition ${
              theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-slate-100'
            }`}
          >
            <X className={`w-5 h-5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className={`p-5 space-y-4 max-h-[70vh] overflow-y-auto ${
          theme === 'dark' ? '' : 'bg-slate-50'
        }`}>
          {/* Validation Error Banner */}
          {validationError && (
            <div className={`flex items-start gap-3 p-4 rounded-xl border animate-shake ${
              theme === 'dark'
                ? 'bg-red-500/10 border-red-500/20'
                : 'bg-red-50 border-red-200'
            }`}>
              <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                theme === 'dark' ? 'text-red-400' : 'text-red-500'
              }`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${
                  theme === 'dark' ? 'text-red-300' : 'text-red-700'
                }`}>
                  {validationError.error}
                </p>
                {validationError.description && (
                  <p className={`text-sm mt-0.5 ${
                    theme === 'dark' ? 'text-red-400/80' : 'text-red-600'
                  }`}>
                    {validationError.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setValidationError(null)}
                className={`flex-shrink-0 p-1 rounded-lg transition-colors ${
                  theme === 'dark'
                    ? 'hover:bg-white/10 text-red-400'
                    : 'hover:bg-red-100 text-red-500'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          
          {/* Parent task info banner for subtasks */}
          {(isSubtask || parent) && parent && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
              theme === 'dark'
                ? 'bg-violet-500/10 border border-violet-500/20 text-violet-300'
                : 'bg-violet-50 border border-violet-200 text-violet-700'
            }`}>
              <Calendar className="w-3.5 h-3.5" />
              <span>
                Subtask of <strong>{parent.name}</strong> • Must be within {formatDate(parent.start)} – {formatDate(parent.end)}
              </span>
            </div>
          )}

          {/* Task name */}
          <div>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="Task name..."
              className={`w-full px-4 py-3 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all ${
                theme === 'dark' 
                  ? 'bg-white/5 border-white/10 text-slate-100 placeholder-slate-500' 
                  : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
              }`}
              autoFocus
            />
          </div>

          {/* Date Type Toggle - only show for subtasks or if user wants */}
          <div className="space-y-3">
            <label className={`text-xs font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>Date Type</label>
            <div className={`grid grid-cols-2 gap-2 p-1 rounded-xl ${theme === 'dark' ? 'bg-white/5' : 'bg-slate-100'}`}>
              <button
                type="button"
                onClick={() => handleDeadlineModeToggle(false)}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  !isDeadlineOnly
                    ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-lg'
                    : theme === 'dark' 
                      ? 'text-slate-400 hover:text-slate-200 hover:bg-white/5' 
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Calendar className="w-4 h-4" />
                Date Range
              </button>
              <button
                type="button"
                onClick={() => handleDeadlineModeToggle(true)}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  isDeadlineOnly
                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg'
                    : theme === 'dark' 
                      ? 'text-slate-400 hover:text-slate-200 hover:bg-white/5' 
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Target className="w-4 h-4" />
                Deadline
              </button>
            </div>
          </div>

          {/* Date inputs - conditional based on mode */}
          {isDeadlineOnly ? (
            <div>
              <label className={`text-xs block mb-2 flex items-center gap-2 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                <Clock className="w-3.5 h-3.5" />
                Deadline Date
              </label>
              <input
                type="date"
                name="end"
                value={formData.end}
                onChange={handleDeadlineDateChange}
                required
                className={`w-full px-4 py-3 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all ${
                  theme === 'dark' 
                    ? 'bg-white/5 border-white/10 text-slate-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:invert' 
                    : 'bg-white border-slate-200 text-slate-900'
                } [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer`}
              />
              <p className={`mt-2 text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>This task will appear as a single-day deadline marker</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`text-xs block mb-2 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>Start Date</label>
                <input
                  type="date"
                  name="start"
                  value={formData.start}
                  onChange={handleChange}
                  required
                  className={`w-full px-3 py-3 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all ${
                    theme === 'dark' 
                      ? 'bg-white/5 border-white/10 text-slate-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:invert' 
                      : 'bg-white border-slate-200 text-slate-900'
                  } [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer`}
                />
              </div>
              <div>
                <label className={`text-xs block mb-2 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>End Date</label>
                <input
                  type="date"
                  name="end"
                  value={formData.end}
                  onChange={handleChange}
                  required
                  className={`w-full px-3 py-3 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all ${
                    theme === 'dark' 
                      ? 'bg-white/5 border-white/10 text-slate-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:invert' 
                      : 'bg-white border-slate-200 text-slate-900'
                  } [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer`}
                />
              </div>
            </div>
          )}

          {/* Progress - different UI based on task type */}
          {hasChildren ? (
            /* Parent task with children - progress is auto-calculated */
            <div className={`p-4 rounded-xl border ${
              theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>Progress</span>
                <span className={`text-sm font-bold ${formData.progress === 100 ? 'text-emerald-400' : 'text-cyan-400'}`}>
                  {formData.progress}%
                </span>
              </div>
              <div className={`h-2 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-white/10' : 'bg-slate-200'}`}>
                <div 
                  className={`h-full rounded-full transition-all ${formData.progress === 100 ? 'bg-emerald-500' : 'bg-cyan-500'}`}
                  style={{ width: `${formData.progress}%` }}
                />
              </div>
              <p className={`text-xs mt-2 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
                Progress is automatically calculated from completed subtasks
              </p>
            </div>
          ) : isSubtask ? (
            /* Subtask - Status buttons */
            <div className="space-y-3">
              <label className={`text-xs font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>Status</label>
              
              {/* Currently Working Button */}
              {!isDone && (
                <button
                  type="button"
                  onClick={() => setIsWorking(!isWorking)}
                  className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
                    isWorking
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25'
                      : theme === 'dark'
                        ? 'bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                        : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  <Play className={`w-5 h-5 ${isWorking ? 'fill-white/30' : ''}`} />
                  {isWorking ? 'Currently Working' : 'Mark as Working'}
                </button>
              )}
              
              {/* Done Button */}
              <button
                type="button"
                onClick={() => {
                  setIsDone(!isDone);
                  if (!isDone) setIsWorking(false); // Clear working status when marking done
                }}
                className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${
                  isDone
                    ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-lg shadow-emerald-500/25'
                    : theme === 'dark'
                      ? 'bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                      : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <CheckCircle2 className={`w-5 h-5 ${isDone ? 'fill-white/20' : ''}`} />
                {isDone ? 'Completed!' : 'Mark as Done'}
              </button>
              
              <p className={`text-xs text-center ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
                {isDone ? 'This subtask is complete' : isWorking ? 'You are currently working on this' : 'Set your current status'}
              </p>
            </div>
          ) : (
            /* Regular task without children - Progress slider */
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className={`text-xs font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>Progress</label>
                <span className={`text-xs font-bold ${formData.progress === 100 ? 'text-emerald-400' : 'text-cyan-400'}`}>
                  {formData.progress}%
                </span>
              </div>
              <div className="relative">
                <div className={`absolute inset-0 h-2 rounded-full ${theme === 'dark' ? 'bg-white/5' : 'bg-slate-200'}`} />
                <div 
                  className={`absolute h-2 rounded-full transition-all ${
                    formData.progress === 100 
                      ? 'bg-gradient-to-r from-emerald-500 to-green-500' 
                      : 'bg-gradient-to-r from-cyan-500 to-violet-500'
                  }`}
                  style={{ width: `${formData.progress}%` }}
                />
                <input
                  type="range"
                  name="progress"
                  min="0"
                  max="100"
                  value={formData.progress}
                  onChange={handleChange}
                  className={`relative w-full h-2 bg-transparent rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer ${
                    theme === 'dark' ? '[&::-webkit-slider-thumb]:bg-white' : '[&::-webkit-slider-thumb]:bg-slate-700'
                  }`}
                />
              </div>
              {formData.progress === 100 && (
                <p className="text-xs text-emerald-400 text-center flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Task complete!
                </p>
              )}
            </div>
          )}

          {/* Dependencies - only show for parent tasks, not subtasks */}
          {!isSubtask && !parent && allTasks.length > (task ? 1 : 0) && (
            <div className="space-y-2">
              <label className={`text-xs font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>Dependent on</label>
              <div className={`space-y-1 max-h-32 overflow-y-auto p-2 rounded-xl ${
                theme === 'dark' ? 'bg-white/5' : 'bg-slate-50'
              }`}>
                {allTasks
                  .filter((t) => !task || t.id !== task.id)
                  .map((t) => (
                    <label key={t.id} className={`flex items-center gap-3 cursor-pointer p-2 rounded-lg transition ${
                      theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-slate-100'
                    }`}>
                      <input
                        type="checkbox"
                        checked={formData.dependencies?.includes(t.id) || false}
                        onChange={() => handleDependencyToggle(t.id)}
                        className={`w-4 h-4 rounded text-cyan-500 focus:ring-cyan-500 ${
                          theme === 'dark' ? 'border-slate-600 bg-slate-700' : 'border-slate-300 bg-white'
                        }`}
                      />
                      <span className={`text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>{t.name}</span>
                    </label>
                  ))}
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className={`flex gap-3 pt-5 border-t ${theme === 'dark' ? 'border-white/5' : 'border-slate-200'}`}>
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 px-4 py-3 text-sm border rounded-xl font-medium transition-all ${
                theme === 'dark'
                  ? 'border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="group relative flex-1 px-4 py-3 text-sm font-semibold rounded-xl transition-all overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-violet-500 transition-transform group-hover:scale-105" />
              <span className="relative flex items-center justify-center gap-2 text-white">
                <Check className="w-4 h-4" />
                Save Task
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
