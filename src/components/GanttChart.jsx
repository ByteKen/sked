import { useMemo, useState, forwardRef, useImperativeHandle, useCallback, useEffect, memo } from 'react';
import { ChevronDown, ChevronRight, ZoomIn, ZoomOut, Maximize2, CalendarDays, Minimize2, PanelLeftClose, PanelLeft } from 'lucide-react';
import { usePreferencesStore } from '../store/preferencesStore';

const GanttChart = forwardRef(({ tasks, onTaskClick, onTaskEdit, onExpandedChange }, ref) => {
  const [expandedTasks, setExpandedTasks] = useState({});
  const [zoom, setZoom] = useState(1);
  const [granularity, setGranularity] = useState('days');
  const [isExpandedView, setIsExpandedView] = useState(false); // Full height mode for screenshots
  const [isMobile, setIsMobile] = useState(false);
  const [showTaskNames, setShowTaskNames] = useState(true); // Toggle task name column on mobile
  
  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      const wasMobile = isMobile;
      setIsMobile(mobile);
      // Auto-hide task names when switching to mobile, show when switching to desktop
      if (mobile && !wasMobile) {
        setShowTaskNames(false);
      } else if (!mobile && wasMobile) {
        setShowTaskNames(true);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [isMobile]);
  
  // Get preferences from store
  const { useRoundedSubtasks, theme, barHeight, taskLabelPosition, subtaskLabelPosition, showDependencyLines, showSubtaskConnectors } = usePreferencesStore();
  
  // Calculate bar dimensions based on preference
  const barHeightPx = {
    compact: 20,
    normal: 28,
    large: 36
  }[barHeight] || 28;
  
  // Determine if either label position is 'top' (affects row height)
  const hasTopLabelPosition = taskLabelPosition === 'top' || subtaskLabelPosition === 'top';
  
  // Row height scales with bar height - extra space needed for 'top' label
  const rowHeight = barHeightPx + (hasTopLabelPosition ? 24 : 16);

  // Toggle expanded view (removes vertical scroll for full capture)
  const toggleExpandedView = () => {
    const newValue = !isExpandedView;
    setIsExpandedView(newValue);
    // Notify parent component
    if (onExpandedChange) {
      onExpandedChange(newValue);
    }
  };

  // Expand all tasks for PDF export
  const expandAllTasks = useCallback(() => {
    const flatTasks = flattenTasks(tasks);
    const allExpanded = {};
    flatTasks.forEach(task => {
      if (task.children && task.children.length > 0) {
        allExpanded[task.id] = true;
      }
    });
    setExpandedTasks(allExpanded);
  }, [tasks]);

  // Calculate date range - aligned to granularity boundaries
  // Returns timestamps to avoid new Date object references
  const { startTimestamp, days } = useMemo(() => {
    const flatTasks = flattenTasks(tasks);
    if (flatTasks.length === 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return {
        startTimestamp: today.getTime(),
        endTimestamp: today.getTime() + 30 * 24 * 60 * 60 * 1000,
        days: 30,
      };
    }

    const dates = flatTasks.flatMap((t) => [new Date(t.start), new Date(t.end)]);
    let start = new Date(Math.min(...dates));
    let end = new Date(Math.max(...dates));
    
    // Normalize to start of day
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    // Align start to the first of the month (for month/quarter/year views)
    // This ensures task positions align with month headers
    const alignedStart = new Date(start.getFullYear(), start.getMonth(), 1);
    
    // Add buffer - go back one more month for breathing room
    alignedStart.setMonth(alignedStart.getMonth() - 1);
    
    // Align end to end of month + buffer
    const alignedEnd = new Date(end.getFullYear(), end.getMonth() + 2, 0); // Last day of next month

    const diffTime = Math.abs(alignedEnd - alignedStart);
    const dayCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return { startTimestamp: alignedStart.getTime(), endTimestamp: alignedEnd.getTime(), days: dayCount };
  }, [tasks]);
  
  // Create stable Date object reference from timestamp
  const startDate = useMemo(() => new Date(startTimestamp), [startTimestamp]);

  // Adjust cell width based on granularity and zoom
  const baseCellWidth = 40;
  const cellWidth = (() => {
    let width = baseCellWidth;
    if (granularity === 'weeks') width = baseCellWidth * 2;
    if (granularity === 'months') width = baseCellWidth * 4;
    if (granularity === 'quarters') width = baseCellWidth * 6;
    if (granularity === 'years') width = baseCellWidth * 8;
    return width * zoom;
  })();

  // Responsive task name column width
  const taskNameWidth = isMobile ? 140 : 280;

  // Calculate display range - extends dynamically based on zoom and granularity
  const displayDays = useMemo(() => {
    // Base days from task data plus minimum buffer
    const baseDays = Math.max(days, 60);
    
    // Zoom multiplier - when zoomed out (zoom < 1), we need more days visible
    // At 50% zoom, we need 2x the days; at 100% zoom, 1x; at 200% zoom, 0.5x
    const zoomMultiplier = 1 / zoom;
    
    // Granularity multiplier - coarser views need more days to fill the screen
    const granularityMultiplier = {
      days: 1,
      weeks: 2,
      months: 4,
      quarters: 8,
      years: 16
    };
    
    const granMult = granularityMultiplier[granularity] || 1;
    
    // Calculate total days needed
    // Formula: base * zoom factor * granularity factor + generous buffer
    const calculatedDays = baseDays * zoomMultiplier * granMult;
    
    // Add extra buffer that scales with granularity
    const buffer = {
      days: 30,
      weeks: 90,
      months: 365,
      quarters: 730,
      years: 1460
    };
    
    return Math.ceil(calculatedDays) + (buffer[granularity] || 60);
  }, [days, zoom, granularity]);

  // Calculate pixels per day based on granularity
  // This is the fundamental unit for positioning everything on the timeline
  const pixelsPerDay = useMemo(() => {
    // Base pixels per day scales with zoom
    const basePixelsPerDay = 4 * zoom; // Base: 4 pixels per day at 100% zoom
    
    // Granularity affects the scale
    switch (granularity) {
      case 'days':
        return cellWidth; // Each cell is one day
      case 'weeks':
        return basePixelsPerDay * 2; // More spread out
      case 'months':
        return basePixelsPerDay * 1.2; // Balanced for month view
      case 'quarters':
        return basePixelsPerDay * 0.8;
      case 'years':
        return basePixelsPerDay * 0.4;
      default:
        return basePixelsPerDay;
    }
  }, [cellWidth, zoom, granularity]);

  // Scroll to today's date (centers today in the viewport)
  const scrollToToday = useCallback(() => {
    const container = document.getElementById('gantt-timeline-container');
    if (container && startDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
      const todayPosition = daysDiff * pixelsPerDay;
      // Scroll so today is centered in viewport
      const scrollTo = Math.max(0, todayPosition - container.clientWidth / 2);
      container.scrollLeft = scrollTo;
    }
  }, [startDate, pixelsPerDay]);

  // Scroll to show all tasks (used for PDF export)
  const scrollToFitTasks = useCallback(() => {
    const container = document.getElementById('gantt-timeline-container');
    const flatTasks = flattenTasks(tasks);
    if (container && flatTasks.length > 0 && startDate) {
      // Find the earliest task start and latest task end
      const taskDates = flatTasks.flatMap(t => [new Date(t.start), new Date(t.end)]);
      const earliestTask = new Date(Math.min(...taskDates));
      const latestTask = new Date(Math.max(...taskDates));
      
      earliestTask.setHours(0, 0, 0, 0);
      latestTask.setHours(0, 0, 0, 0);
      
      const msPerDay = 1000 * 60 * 60 * 24;
      const startDaysDiff = Math.floor((earliestTask - startDate) / msPerDay);
      
      const taskStartPos = startDaysDiff * pixelsPerDay;
      
      // Calculate scroll position to center the tasks, with some padding
      const padding = 50; // pixels padding on left
      const scrollTo = Math.max(0, taskStartPos - padding);
      container.scrollLeft = scrollTo;
    }
  }, [tasks, startDate, pixelsPerDay]);

  // Calculate optimal zoom to fit all tasks in viewport (for PDF export)
  const getOptimalZoomForExport = useCallback(() => {
    const container = document.getElementById('gantt-timeline-container');
    const flatTasks = flattenTasks(tasks);
    if (container && flatTasks.length > 0 && startDate) {
      const taskDates = flatTasks.flatMap(t => [new Date(t.start), new Date(t.end)]);
      const earliestTask = new Date(Math.min(...taskDates));
      const latestTask = new Date(Math.max(...taskDates));
      
      const msPerDay = 1000 * 60 * 60 * 24;
      const taskSpanDays = Math.ceil((latestTask - earliestTask) / msPerDay) + 14; // Add 2 weeks buffer
      
      // Available width for timeline (minus task name sidebar)
      const availableWidth = container.clientWidth - 50;
      
      // Calculate what zoom level would fit all tasks
      const neededPixelsPerDay = availableWidth / taskSpanDays;
      
      // Calculate zoom factor (considering current granularity)
      let optimalZoom;
      switch (granularity) {
        case 'days':
          optimalZoom = neededPixelsPerDay / baseCellWidth;
          break;
        case 'weeks':
          optimalZoom = (neededPixelsPerDay * 7) / (baseCellWidth * 2);
          break;
        case 'months':
          optimalZoom = (neededPixelsPerDay * 30) / (baseCellWidth * 4);
          break;
        case 'quarters':
          optimalZoom = (neededPixelsPerDay * 90) / (baseCellWidth * 6);
          break;
        case 'years':
          optimalZoom = (neededPixelsPerDay * 365) / (baseCellWidth * 8);
          break;
        default:
          optimalZoom = 1;
      }
      
      // Clamp between 0.3 and current zoom (don't zoom in more than user set)
      return Math.max(0.3, Math.min(optimalZoom, zoom));
    }
    return zoom;
  }, [tasks, startDate, granularity, zoom, baseCellWidth]);

  // Expose methods for external use (e.g., export)
  useImperativeHandle(ref, () => ({
    autoFit: handleAutoFit,
    expandAllTasks,
    scrollToToday,
    scrollToFitTasks,
    getOptimalZoomForExport,
    setZoom: (z) => setZoom(z),
    setGranularity: (g) => setGranularity(g),
    getGranularity: () => granularity,
    getChartElement: () => document.getElementById('gantt-chart-container'),
    isExpandedView,
    toggleExpandedView
  }));

  // Get task position - memoized to prevent recreation on each render
  // Uses startTimestamp (primitive) instead of startDate (object) for stable dependency
  const getTaskPosition = useCallback((task) => {
    const start = new Date(task.start);
    const end = new Date(task.end);
    
    // Normalize to start of day to avoid timezone issues
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    // Calculate days from timeline start
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysFromStart = Math.round((start.getTime() - startTimestamp) / msPerDay);
    const durationDays = Math.max(1, Math.round((end - start) / msPerDay) + 1);

    const left = daysFromStart * pixelsPerDay;
    const width = Math.max(pixelsPerDay * 2, durationDays * pixelsPerDay);

    return { left, width };
  }, [startTimestamp, pixelsPerDay]);

  // Check if any child (recursive) is currently working
  const hasWorkingChild = useCallback((task) => {
    if (!task.children || task.children.length === 0) return false;
    return task.children.some(child => 
      child.isWorking || hasWorkingChild(child)
    );
  }, []);

  // Modern color palette - refined gradients for professional look
  const getBarStyle = useCallback((task) => {
    // Completed: Emerald with subtle teal undertone
    if (task.progress === 100 || task.isDone) {
      return { 
        background: theme === 'dark' 
          ? 'linear-gradient(135deg, #34d399 0%, #10b981 50%, #059669 100%)' 
          : 'linear-gradient(135deg, #6ee7b7 0%, #34d399 50%, #10b981 100%)',
        boxShadow: '0 4px 14px -2px rgba(16, 185, 129, 0.35)'
      };
    }
    
    // Check if this task or any of its children is currently being worked on
    const isActivelyWorking = task.isWorking || hasWorkingChild(task);
    
    // Working: Vibrant amber with warm glow
    if (isActivelyWorking) {
      return { 
        background: theme === 'dark'
          ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)'
          : 'linear-gradient(135deg, #fcd34d 0%, #fbbf24 50%, #f59e0b 100%)',
        boxShadow: '0 4px 14px -2px rgba(245, 158, 11, 0.4)'
      };
    }
    
    // In Progress: Soft amber blend
    if (task.progress > 0) {
      return { 
        background: theme === 'dark'
          ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)'
          : 'linear-gradient(135deg, #fcd34d 0%, #fbbf24 50%, #f59e0b 100%)',
        boxShadow: '0 4px 14px -2px rgba(245, 158, 11, 0.3)'
      };
    }
    
    // Not Started: Cool slate with depth
    return { 
      background: theme === 'dark'
        ? 'linear-gradient(135deg, #64748b 0%, #475569 50%, #334155 100%)'
        : 'linear-gradient(135deg, #94a3b8 0%, #64748b 50%, #475569 100%)',
      boxShadow: '0 4px 14px -2px rgba(71, 85, 105, 0.25)'
    };
  }, [hasWorkingChild, theme]);

  const toggleExpand = (taskId) => {
    setExpandedTasks((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleResetZoom = () => setZoom(1);
  
  // Auto-fit: Calculate zoom to fit all tasks in view
  const handleAutoFit = () => {
    const container = document.getElementById('gantt-timeline-container');
    if (container) {
      const availableWidth = container.clientWidth - 50;
      const neededWidth = days * pixelsPerDay;
      const optimalZoom = Math.max(0.5, Math.min(3, availableWidth / neededWidth));
      setZoom(optimalZoom);
    }
  };

  // Memoize flattened task list to prevent recalculation on every render
  const flatTasksList = useMemo(() => flattenTasks(tasks), [tasks]);

  // Render task names (sidebar) - Modern minimalist design
  const TaskNameComponent = ({ task, level = 0 }) => {
    const hasChildren = task.children && task.children.length > 0;
    const isExpanded = expandedTasks[task.id] !== false;
    const taskStartDate = new Date(task.start);
    const taskEndDate = new Date(task.end);
    const isCompleted = task.progress === 100 || task.isDone;
    
    // Format date range - shorter on mobile
    const formatDate = (date) => {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    
    const dateRange = taskStartDate.getTime() === taskEndDate.getTime() 
      ? formatDate(taskStartDate)
      : `${formatDate(taskStartDate)} - ${formatDate(taskEndDate)}`;

    // Check if this task or any child is currently being worked on
    const isActivelyWorking = task.isWorking || hasWorkingChild(task);

    // Adjust indentation for mobile
    const indentPx = isMobile ? 8 + level * 12 : 14 + level * 18;

    return (
      <div key={task.id}>
        <div
          className={`flex items-center border-b transition-all duration-200 group relative ${
            theme === 'dark' 
              ? 'border-white/[0.04] hover:bg-white/[0.03]' 
              : 'border-slate-200/40 hover:bg-slate-100/40'
          }`}
          style={{ height: rowHeight, paddingLeft: `${indentPx}px` }}
        >
          {/* Subtle left accent for parent tasks */}
          {hasChildren && level === 0 && (
            <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3/5 rounded-full ${
              isCompleted 
                ? 'bg-emerald-500/50' 
                : isActivelyWorking 
                  ? 'bg-amber-500/50' 
                  : theme === 'dark' ? 'bg-indigo-500/30' : 'bg-indigo-400/40'
            }`} />
          )}
          
          {/* Expand/Collapse Button */}
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(task.id)}
              className={`p-1 md:p-1.5 rounded-lg transition-all duration-200 mr-1.5 md:mr-2 active:scale-90 ${
                theme === 'dark' 
                  ? 'hover:bg-white/10 text-slate-400 hover:text-slate-200' 
                  : 'hover:bg-slate-200/80 text-slate-400 hover:text-slate-600'
              }`}
            >
              <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}>
                <ChevronDown className="w-3 h-3 md:w-4 md:h-4" />
              </div>
            </button>
          ) : (
            <div className="w-5 md:w-7 mr-1.5 md:mr-2 flex-shrink-0" />
          )}

          {/* Task Info */}
          <div className="flex-1 min-w-0 pr-2">
            <div
              className={`text-xs md:text-sm font-medium cursor-pointer truncate transition-all duration-200 flex items-center gap-1.5 md:gap-2 ${
                isCompleted
                  ? theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
                  : theme === 'dark' 
                    ? 'text-slate-200 group-hover:text-white' 
                    : 'text-slate-700 group-hover:text-slate-900'
              }`}
              onClick={() => onTaskClick?.(task.id)}
              onDoubleClick={() => onTaskEdit?.(task)}
            >
              {/* Working indicator - Modern pulsing ring */}
              {isActivelyWorking && (
                <span className="relative flex items-center justify-center w-4 h-4 flex-shrink-0" title="Currently working">
                  <span className="absolute inset-0 bg-amber-400/30 rounded-full animate-ping" />
                  <span className="relative w-2.5 h-2.5 bg-gradient-to-br from-amber-400 to-amber-500 rounded-full shadow-sm shadow-amber-500/50" />
                </span>
              )}
              {/* Completed checkmark */}
              {isCompleted && !isActivelyWorking && (
                <span className={`flex items-center justify-center w-4 h-4 rounded-full flex-shrink-0 ${
                  theme === 'dark' ? 'bg-emerald-500/20' : 'bg-emerald-100'
                }`}>
                  <svg className="w-2.5 h-2.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              )}
              <span className={`truncate ${isCompleted ? 'line-through decoration-emerald-500/30' : ''}`}>{task.name}</span>
            </div>
            {/* Date range - refined typography */}
            {!isMobile && (
              <div className={`text-[10px] md:text-xs mt-0.5 font-medium tracking-wide ${
                theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
              }`}>
                {dateRange}
              </div>
            )}
          </div>
        </div>

        {/* Subtasks with smooth animation */}
        {hasChildren && isExpanded && task.children.map((child) => (
          <TaskNameComponent key={child.id} task={child} level={level + 1} />
        ))}
      </div>
    );
  };

  // Render task bars - Modern design with smooth animations
  const TaskBarComponent = ({ task, rowIndex }) => {
    const { left, width } = getTaskPosition(task);
    const barStyle = getBarStyle(task);
    const isDeadline = task.isDeadline || task.start === task.end;
    const isActivelyWorking = task.isWorking || hasWorkingChild(task);

    // Deadline task - render based on user preference (diamond or rounded)
    if (isDeadline) {
      const isCompleted = task.progress === 100 || task.isDone;
      
      // Determine gradient based on status: completed > working > not started
      let diamondGradient;
      let shadowColor;
      if (isCompleted) {
        diamondGradient = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        shadowColor = 'shadow-emerald-500/30';
      } else if (isActivelyWorking) {
        diamondGradient = 'linear-gradient(135deg, #fdab3d 0%, #ff9f1a 100%)';
        shadowColor = 'shadow-amber-500/30';
      } else {
        diamondGradient = 'linear-gradient(135deg, #64748b 0%, #475569 100%)';
        shadowColor = 'shadow-slate-500/30';
      }
      
      // If user prefers rounded subtasks, render as regular bar instead of diamond
      if (useRoundedSubtasks) {
        return (
          <div 
            className={`absolute flex ${subtaskLabelPosition === 'top' ? 'items-end pb-1' : 'items-center'}`}
            style={{ 
              top: rowIndex * rowHeight, 
              height: rowHeight,
              left: 0,
              right: 0
            }}
          >
            {/* Rounded Deadline Bar (same style as regular tasks) */}
            <div
              className="absolute rounded-full cursor-pointer shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-200 group"
              style={{
                left: `${left}px`,
                width: `${Math.max(width, 30)}px`,
                height: `${barHeightPx}px`,
                background: diamondGradient,
                zIndex: 10,
              }}
              onClick={() => onTaskEdit?.(task)}
            >
              {/* Completed indicator */}
              {isCompleted && (
                <div className="absolute inset-y-0 left-0 rounded-l-full bg-white/25 w-full rounded-full pointer-events-none" />
              )}

              {/* Hover Effect */}
              <div className="absolute inset-0 rounded-full bg-white/0 group-hover:bg-white/10 transition-colors pointer-events-none" />
            </div>
            
            {/* Label - Outside */}
            {subtaskLabelPosition === 'outside' && (
              <div 
                className={`absolute text-xs font-medium truncate pointer-events-none ${
                  theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
                }`}
                style={{ 
                  left: `${left + Math.max(width, 30) + 8}px`,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  maxWidth: '150px',
                  zIndex: 20
                }}
              >
                {task.name} {isCompleted && '✓'}
              </div>
            )}

            {/* Label - Top (above bar, aligned to start) */}
            {subtaskLabelPosition === 'top' && (
              <div 
                className={`absolute text-xs font-medium truncate pointer-events-none ${
                  theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
                }`}
                style={{ 
                  left: `${left}px`,
                  top: '2px',
                  maxWidth: '200px',
                  zIndex: 20
                }}
              >
                {task.name} {isCompleted && '✓'}
              </div>
            )}
          </div>
        );
      }
      
      // Default: Diamond marker for deadlines
      const diamondSize = Math.max(16, barHeightPx - 4);
      return (
        <div 
          className={`absolute flex ${subtaskLabelPosition === 'top' ? 'items-end pb-1' : 'items-center'}`}
          style={{ 
            top: rowIndex * rowHeight, 
            height: rowHeight,
            left: 0,
            right: 0
          }}
        >
          {/* Deadline Diamond Marker */}
          <div
            className="absolute cursor-pointer hover:scale-110 transition-transform duration-200 group"
            style={{ left: `${left}px`, transformOrigin: 'center center', zIndex: 10 }}
            onClick={() => onTaskEdit?.(task)}
          >
            {/* Diamond shape */}
            <div 
              className={`rotate-45 rounded-sm shadow-lg pointer-events-none ${shadowColor}`}
              style={{ 
                background: diamondGradient,
                width: `${diamondSize}px`,
                height: `${diamondSize}px`
              }}
            />
            {/* Center dot or checkmark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {isCompleted ? (
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <div className="w-2 h-2 bg-white rounded-full" />
              )}
            </div>
            {/* Tooltip on hover - shown when label is hidden */}
            {subtaskLabelPosition === 'hidden' && (
              <div className="absolute left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                <div className={`text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap border ${
                  theme === 'dark' 
                    ? 'bg-slate-800 text-white border-slate-600' 
                    : 'bg-white text-slate-800 border-slate-200'
                }`}>
                  {task.name} {isCompleted && '✓'}
                </div>
              </div>
            )}
          </div>
          
          {/* Label - Outside (for diamond markers) */}
          {subtaskLabelPosition === 'outside' && (
            <div 
              className={`absolute text-xs font-medium truncate pointer-events-none ${
                theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
              }`}
              style={{ 
                left: `${left + diamondSize + 8}px`,
                top: '50%',
                transform: 'translateY(-50%)',
                maxWidth: '150px',
                zIndex: 20
              }}
            >
              {task.name} {isCompleted && '✓'}
            </div>
          )}

          {/* Label - Top (above diamond, aligned to start) */}
          {subtaskLabelPosition === 'top' && (
            <div 
              className={`absolute text-xs font-medium truncate pointer-events-none ${
                theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
              }`}
              style={{ 
                left: `${left}px`,
                top: '2px',
                maxWidth: '200px',
                zIndex: 20
              }}
            >
              {task.name} {isCompleted && '✓'}
            </div>
          )}
        </div>
      );
    }

    // Regular task bar
    return (
      <div 
        className={`absolute flex ${taskLabelPosition === 'top' ? 'items-end pb-1' : 'items-center'}`}
        style={{ 
          top: rowIndex * rowHeight, 
          height: rowHeight,
          left: 0,
          right: 0,
          overflow: 'visible',
        }}
      >
        {/* Task Bar */}
        <div
          className="absolute rounded-full cursor-pointer shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-200 group"
          style={{
            left: `${left}px`,
            width: `${Math.max(width, 30)}px`,
            height: `${barHeightPx}px`,
            zIndex: 10,
            ...barStyle,
          }}
          onClick={() => onTaskEdit?.(task)}
        >
          {/* Progress Fill */}
          {task.progress > 0 && task.progress < 100 && (
            <div
              className="absolute inset-y-0 left-0 rounded-l-full bg-white/25 pointer-events-none"
              style={{ width: `${task.progress}%` }}
            />
          )}

          {/* Label - Inside */}
          {taskLabelPosition === 'inside' && (
            <div className="absolute inset-0 flex items-center justify-center px-3 pointer-events-none">
              <span className="text-xs font-semibold text-white drop-shadow-sm truncate">
                {width > 80 ? task.name : ''} 
                {width > 120 && task.progress > 0 ? ` ${task.progress}%` : ''}
              </span>
            </div>
          )}

          {/* Hover Effect */}
          <div className="absolute inset-0 rounded-full bg-white/0 group-hover:bg-white/10 transition-colors pointer-events-none" />
        </div>
        
        {/* Label - Outside */}
        {taskLabelPosition === 'outside' && (
          <div 
            className={`absolute text-xs font-medium truncate pointer-events-none ${
              theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
            }`}
            style={{ 
              left: `${left + Math.max(width, 30) + 8}px`,
              top: '50%',
              transform: 'translateY(-50%)',
              maxWidth: '150px',
              zIndex: 20
            }}
          >
            {task.name} {task.progress > 0 ? `${task.progress}%` : ''}
          </div>
        )}

        {/* Label - Top (above bar, aligned to start) */}
        {taskLabelPosition === 'top' && (
          <div 
            className={`absolute text-xs font-medium truncate pointer-events-none ${
              theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
            }`}
            style={{ 
              left: `${left}px`,
              top: '2px',
              maxWidth: '200px',
              zIndex: 20
            }}
          >
            {task.name} {task.progress > 0 ? `${task.progress}%` : ''}
          </div>
        )}

        {/* Connectors to children (L-shaped lines from parent left/start to child start) */}
        {showSubtaskConnectors && Array.isArray(task.children) && task.children.length > 0 && (
          task.children.map((child) => {
            const childIndex = flatTasksList.findIndex(t => t.id === child.id);
            if (childIndex === -1) return null;
            const { left: childLeft } = getTaskPosition(child);
            const parentLeft = left; // Start from the LEFT side of parent bar

            // Calculate Y positions - adjust for 'top' label position where bars are at bottom
            // Parent uses taskLabelPosition, child uses subtaskLabelPosition
            const parentBarCenterOffset = taskLabelPosition === 'top' 
              ? rowHeight - barHeightPx / 2 - 4  // bar is at bottom with pb-1
              : rowHeight / 2;  // bar is centered
            const childBarCenterOffset = subtaskLabelPosition === 'top'
              ? rowHeight - barHeightPx / 2 - 4
              : rowHeight / 2;
            const rowDiff = childIndex - rowIndex;
            const verticalDistance = rowDiff * rowHeight + (childBarCenterOffset - parentBarCenterOffset);

            // Connector color
            const connectorColor = theme === 'dark' ? '#94a3b8' : '#64748b';

            // Elbow position - slightly to the left of parent start
            const elbowX = parentLeft - 10;
            
            return (
              <div key={`conn-${task.id}-${child.id}`} className="pointer-events-none" style={{ position: 'absolute', left: 0, top: 0, zIndex: 1 }}>
                {/* Horizontal from parent left going left to elbow */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${elbowX}px`,
                    top: `${parentBarCenterOffset - 1}px`,
                    width: `${parentLeft - elbowX}px`,
                    height: '2px',
                    background: connectorColor,
                  }}
                />

                {/* Vertical line down to child row */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${elbowX}px`,
                    top: `${parentBarCenterOffset}px`,
                    width: '2px',
                    height: `${verticalDistance}px`,
                    background: connectorColor,
                  }}
                />

                {/* Horizontal from elbow to child bar */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${elbowX}px`,
                    top: `${parentBarCenterOffset + verticalDistance - 1}px`,
                    width: `${Math.max(4, childLeft - elbowX)}px`,
                    height: '2px',
                    background: connectorColor,
                  }}
                />
              </div>
            );
          })
        )}
      </div>
    );
  };

  // Memoize task bars to prevent re-renders on hover
  const taskBarsRendered = useMemo(() => {
    return flatTasksList.map((task, index) => (
      <TaskBarComponent key={task.id} task={task} rowIndex={index} />
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatTasksList, TaskBarComponent]);

  // Generate date headers - Modern refined design
  const DateHeaders = () => {
    const headers = [];
    
    if (granularity === 'days') {
      for (let i = 0; i < displayDays; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        const isToday = isDateToday(date);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' }).substring(0, 2);
        
        headers.push(
          <div
            key={i}
            className={`flex-shrink-0 flex flex-col items-center justify-center text-xs border-r transition-all duration-150 ${
              isToday 
                ? 'bg-gradient-to-b from-violet-500/20 to-indigo-500/10 border-violet-400/30' 
                : isWeekend 
                  ? theme === 'dark'
                    ? 'bg-white/[0.02] border-white/[0.04] text-slate-500'
                    : 'bg-slate-100/50 border-slate-200/30 text-slate-400'
                  : theme === 'dark'
                    ? 'bg-transparent border-white/[0.04] text-slate-400'
                    : 'bg-transparent border-slate-200/30 text-slate-500'
            }`}
            style={{ width: cellWidth, height: rowHeight }}
          >
            <span className={`font-medium tracking-wide ${isToday ? 'text-violet-400' : ''}`}>{dayName}</span>
            <span className={`text-[10px] font-semibold ${
              isToday 
                ? 'text-violet-300 bg-violet-500/30 px-1.5 rounded-full' 
                : theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
            }`}>{date.getDate()}</span>
          </div>
        );
      }
    } else if (granularity === 'weeks') {
      // Generate week headers based on days
      const numWeeks = Math.ceil(displayDays / 7);
      for (let i = 0; i < numWeeks; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i * 7);
        const weekNum = getWeekNumber(date);
        const isCurrentWeek = (() => {
          const today = new Date();
          return getWeekNumber(today) === weekNum && date.getFullYear() === today.getFullYear();
        })();
        
        headers.push(
          <div
            key={`week-${i}`}
            className={`flex-shrink-0 border-r flex flex-col items-center justify-center text-xs ${
              isCurrentWeek
                ? 'bg-gradient-to-b from-violet-500/20 to-indigo-500/10 border-violet-400/30'
                : theme === 'dark'
                  ? 'border-white/[0.04] bg-transparent text-slate-400'
                  : 'border-slate-200/30 bg-transparent text-slate-500'
            }`}
            style={{ width: cellWidth, height: rowHeight }}
          >
            <span className={`font-semibold tracking-wide ${isCurrentWeek ? 'text-violet-400' : ''}`}>W{weekNum}</span>
            <span className={`text-[10px] ${isCurrentWeek ? 'text-violet-300' : theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
              {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        );
      }
    } else if (granularity === 'months') {
      // For months, render actual calendar months with proportional widths
      // Start from the first of the month containing startDate
      let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      let totalDaysRendered = 0;
      
      while (totalDaysRendered < displayDays) {
        // Get days in this month
        const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
        // Width proportional to days in month
        const monthWidth = daysInMonth * pixelsPerDay;
        
        const isCurrentMonth = current.getMonth() === new Date().getMonth() && 
                               current.getFullYear() === new Date().getFullYear();
        
        headers.push(
          <div
            key={`month-${current.getFullYear()}-${current.getMonth()}`}
            className={`flex-shrink-0 border-r flex flex-col items-center justify-center text-xs ${
              isCurrentMonth 
                ? 'bg-gradient-to-b from-violet-500/30 to-indigo-500/20 border-violet-400/30' 
                : theme === 'dark'
                  ? 'bg-transparent border-white/[0.04]'
                  : 'bg-transparent border-slate-200/30'
            }`}
            style={{ width: monthWidth, height: rowHeight }}
          >
            <span className={`font-semibold tracking-wide ${
              isCurrentMonth 
                ? 'text-violet-300' 
                : theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
            }`}>
              {current.toLocaleDateString('en-US', { month: 'short' })}
            </span>
            <span className={`text-[10px] ${
              isCurrentMonth 
                ? 'text-violet-400' 
                : theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
            }`}>
              {current.getFullYear()}
            </span>
          </div>
        );
        
        totalDaysRendered += daysInMonth;
        current.setMonth(current.getMonth() + 1);
      }
    } else if (granularity === 'quarters') {
      // Quarters with actual days
      let current = new Date(startDate.getFullYear(), Math.floor(startDate.getMonth() / 3) * 3, 1);
      let totalDaysRendered = 0;
      
      while (totalDaysRendered < displayDays) {
        // Calculate days in quarter (3 months)
        let daysInQuarter = 0;
        for (let m = 0; m < 3; m++) {
          const monthDate = new Date(current.getFullYear(), current.getMonth() + m + 1, 0);
          daysInQuarter += monthDate.getDate();
        }
        const quarterWidth = daysInQuarter * pixelsPerDay;
        const quarter = Math.floor(current.getMonth() / 3) + 1;
        
        headers.push(
          <div
            key={`quarter-${current.getFullYear()}-Q${quarter}`}
            className={`flex-shrink-0 border-r flex flex-col items-center justify-center text-xs ${
              theme === 'dark'
                ? 'border-white/[0.04] bg-transparent text-slate-400'
                : 'border-slate-200/30 bg-transparent text-slate-500'
            }`}
            style={{ width: quarterWidth, height: rowHeight }}
          >
            <span className="font-semibold tracking-wide">Q{quarter}</span>
            <span className={`text-[10px] ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
              {current.getFullYear()}
            </span>
          </div>
        );
        
        totalDaysRendered += daysInQuarter;
        current.setMonth(current.getMonth() + 3);
      }
    } else {
      // Years with actual days (accounting for leap years)
      let current = new Date(startDate.getFullYear(), 0, 1);
      let totalDaysRendered = 0;
      
      while (totalDaysRendered < displayDays) {
        const isLeapYear = (current.getFullYear() % 4 === 0 && current.getFullYear() % 100 !== 0) || 
                           (current.getFullYear() % 400 === 0);
        const daysInYear = isLeapYear ? 366 : 365;
        const yearWidth = daysInYear * pixelsPerDay;
        const isCurrentYear = current.getFullYear() === new Date().getFullYear();
        
        headers.push(
          <div
            key={`year-${current.getFullYear()}`}
            className={`flex-shrink-0 border-r flex items-center justify-center text-xs font-semibold tracking-wide ${
              isCurrentYear
                ? 'bg-gradient-to-b from-violet-500/20 to-indigo-500/10 border-violet-400/30 text-violet-400'
                : theme === 'dark'
                  ? 'border-white/[0.04] bg-transparent text-slate-400'
                  : 'border-slate-200/30 bg-transparent text-slate-500'
            }`}
            style={{ width: yearWidth, height: rowHeight }}
          >
            {current.getFullYear()}
          </div>
        );
        
        totalDaysRendered += daysInYear;
        current.setFullYear(current.getFullYear() + 1);
      }
    }

    return headers;
  };

  // Render dependency lines with smooth curves - monday.com style
  const DependencyLines = () => {
    const lines = [];
    
    flatTasksList.forEach((task) => {
      if (!task.dependencies || task.dependencies.length === 0) return;

      task.dependencies.forEach((depId) => {
        const depTask = flatTasksList.find(t => t.id === depId);
        if (!depTask) return;

        const fromPos = getTaskPosition(depTask);
        const toPos = getTaskPosition(task);
        
        const fromRowIndex = flatTasksList.findIndex(t => t.id === depTask.id);
        const toRowIndex = flatTasksList.findIndex(t => t.id === task.id);

        // Determine if source and target tasks are subtasks or parent tasks
        // Deadlines and subtasks use subtaskLabelPosition, parent tasks use taskLabelPosition
        const isFromSubtask = depTask.isDeadline || depTask.start === depTask.end || (depTask.parentId != null);
        const isToSubtask = task.isDeadline || task.start === task.end || (task.parentId != null);
        
        const fromLabelPosition = isFromSubtask ? subtaskLabelPosition : taskLabelPosition;
        const toLabelPosition = isToSubtask ? subtaskLabelPosition : taskLabelPosition;
        
        // Calculate Y position based on label position (bar is at bottom when 'top' label)
        const getBarCenterY = (rowIdx, labelPos) => {
          if (labelPos === 'top') {
            // Bar is at bottom of row with pb-1 (4px padding)
            return rowIdx * rowHeight + rowHeight - barHeightPx / 2 - 4;
          }
          // Bar is centered in row
          return rowIdx * rowHeight + rowHeight / 2;
        };

        // Start from end of source bar, end at start of target bar
        const fromX = fromPos.left + fromPos.width;
        const fromY = getBarCenterY(fromRowIndex, fromLabelPosition);
        const toX = toPos.left;
        const toY = getBarCenterY(toRowIndex, toLabelPosition);

        const goingDown = toY > fromY;
        const verticalDistance = Math.abs(toY - fromY);
        
        // Simple L-shaped path with rounded corner
        let path;
        if (toX > fromX + 30) {
          // Enough horizontal space - go right, then down/up, then right
          const midX = fromX + 20;
          const radius = Math.min(10, verticalDistance / 2);
          
          if (goingDown) {
            path = `M ${fromX} ${fromY} 
                    H ${midX} 
                    Q ${midX + radius} ${fromY} ${midX + radius} ${fromY + radius}
                    V ${toY - radius}
                    Q ${midX + radius} ${toY} ${midX + radius * 2} ${toY}
                    H ${toX}`;
          } else {
            path = `M ${fromX} ${fromY} 
                    H ${midX} 
                    Q ${midX + radius} ${fromY} ${midX + radius} ${fromY - radius}
                    V ${toY + radius}
                    Q ${midX + radius} ${toY} ${midX + radius * 2} ${toY}
                    H ${toX}`;
          }
        } else {
          // Not enough space - go down first, then horizontal
          const midY = goingDown ? fromY + verticalDistance / 2 : fromY - verticalDistance / 2;
          path = `M ${fromX} ${fromY} 
                  L ${fromX + 10} ${fromY}
                  L ${fromX + 10} ${midY}
                  L ${toX - 10} ${midY}
                  L ${toX - 10} ${toY}
                  L ${toX} ${toY}`;
        }

        lines.push(
          <g key={`dep-${depId}-${task.id}`}>
            {/* Line glow effect for depth */}
            <path
              d={path}
              fill="none"
              stroke="url(#depLineGlow)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.3"
            />
            {/* Main connector line with gradient */}
            <path
              d={path}
              fill="none"
              stroke="url(#depLineGradient)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Arrow head at target */}
            <polygon
              points={`${toX},${toY} ${toX - 8},${toY - 5} ${toX - 8},${toY + 5}`}
              fill="#8b5cf6"
            />
            {/* Dot at source with ring */}
            <circle 
              cx={fromX} 
              cy={fromY} 
              r="5" 
              fill="transparent"
              stroke="#6366f1"
              strokeWidth="2"
            />
            <circle 
              cx={fromX} 
              cy={fromY} 
              r="2.5" 
              fill="#6366f1"
            />
          </g>
        );
      });
    });
    
    return <>{lines}</>;
  };

  const totalHeight = flatTasksList.length * rowHeight;
  const totalWidth = displayDays * pixelsPerDay;

  // Today line position
  const getTodayPosition = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day
    const daysFromStart = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
    return daysFromStart * pixelsPerDay;
  };

  // Grid lines component - renders lines matching the header boundaries with modern subtle styling
  const GridLines = () => {
    const lines = [];
    const gridLineClass = theme === 'dark' ? 'border-white/[0.03]' : 'border-slate-200/40';
    
    if (granularity === 'days') {
      for (let i = 0; i < displayDays; i++) {
        lines.push(
          <div
            key={i}
            className={`flex-shrink-0 border-r ${gridLineClass}`}
            style={{ width: cellWidth }}
          />
        );
      }
    } else if (granularity === 'weeks') {
      const numWeeks = Math.ceil(displayDays / 7);
      for (let i = 0; i < numWeeks; i++) {
        lines.push(
          <div
            key={i}
            className={`flex-shrink-0 border-r ${gridLineClass}`}
            style={{ width: cellWidth }}
          />
        );
      }
    } else if (granularity === 'months') {
      // Match month header widths exactly
      let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      let totalDaysRendered = 0;
      let i = 0;
      
      while (totalDaysRendered < displayDays) {
        const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
        const monthWidth = daysInMonth * pixelsPerDay;
        
        lines.push(
          <div
            key={i}
            className={`flex-shrink-0 border-r ${gridLineClass}`}
            style={{ width: monthWidth }}
          />
        );
        
        totalDaysRendered += daysInMonth;
        current.setMonth(current.getMonth() + 1);
        i++;
      }
    } else if (granularity === 'quarters') {
      let current = new Date(startDate.getFullYear(), Math.floor(startDate.getMonth() / 3) * 3, 1);
      let totalDaysRendered = 0;
      let i = 0;
      
      while (totalDaysRendered < displayDays) {
        let daysInQuarter = 0;
        for (let m = 0; m < 3; m++) {
          const monthDate = new Date(current.getFullYear(), current.getMonth() + m + 1, 0);
          daysInQuarter += monthDate.getDate();
        }
        const quarterWidth = daysInQuarter * pixelsPerDay;
        
        lines.push(
          <div
            key={i}
            className={`flex-shrink-0 border-r ${gridLineClass}`}
            style={{ width: quarterWidth }}
          />
        );
        
        totalDaysRendered += daysInQuarter;
        current.setMonth(current.getMonth() + 3);
        i++;
      }
    } else {
      // Years
      let current = new Date(startDate.getFullYear(), 0, 1);
      let totalDaysRendered = 0;
      let i = 0;
      
      while (totalDaysRendered < displayDays) {
        const isLeapYear = (current.getFullYear() % 4 === 0 && current.getFullYear() % 100 !== 0) || 
                           (current.getFullYear() % 400 === 0);
        const daysInYear = isLeapYear ? 366 : 365;
        const yearWidth = daysInYear * pixelsPerDay;
        
        lines.push(
          <div
            key={i}
            className={`flex-shrink-0 border-r ${gridLineClass}`}
            style={{ width: yearWidth }}
          />
        );
        
        totalDaysRendered += daysInYear;
        current.setFullYear(current.getFullYear() + 1);
        i++;
      }
    }
    
    return <div className="absolute inset-0 flex pointer-events-none">{lines}</div>;
  };

  return (
    <div 
      id="gantt-chart-container" 
      className={`flex flex-col rounded-2xl ${isExpandedView ? '' : 'h-full overflow-hidden'} ${
        theme === 'dark' 
          ? 'bg-gradient-to-br from-[#0c1222] via-[#111827] to-[#0f172a] border border-white/[0.06]' 
          : 'bg-gradient-to-br from-slate-50 via-white to-slate-100/80 border border-slate-200/60'
      } shadow-2xl`}
      style={isExpandedView ? { height: 'auto', minHeight: '100%' } : {}}
    >
      {/* Header Controls - Modern glassmorphic design */}
      <div 
        className={`px-3 md:px-5 py-2.5 md:py-3.5 border-b backdrop-blur-xl flex-shrink-0 overflow-x-auto z-10 ${isExpandedView ? 'sticky top-0 left-0 right-0' : ''} ${
          theme === 'dark' 
            ? 'border-white/[0.06] bg-slate-900/80' 
            : 'border-slate-200/80 bg-white/90'
        }`}
        style={isExpandedView ? { position: 'sticky', top: 0, width: '100%', maxWidth: '100vw' } : {}}
      >
        <div className="flex items-center justify-between gap-2 md:gap-3 min-w-max">
          <div className="flex items-center gap-2 md:gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
              theme === 'dark' 
                ? 'bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20' 
                : 'bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200/50'
            }`}>
              <div className={`w-2 h-2 rounded-full animate-pulse ${
                theme === 'dark' ? 'bg-indigo-400' : 'bg-indigo-500'
              }`} />
              <span className={`text-xs md:text-sm font-semibold whitespace-nowrap ${
                theme === 'dark' ? 'text-indigo-300' : 'text-indigo-700'
              }`}>
                {flatTasksList.length} tasks
              </span>
            </div>
          </div>

          {/* Granularity Selector - Modern pill design */}
          <div className={`flex items-center gap-1 rounded-xl p-1 ${
            theme === 'dark' 
              ? 'bg-slate-800/60 border border-white/[0.06]' 
              : 'bg-slate-100/80 border border-slate-200/60'
          }`}>
            {(isMobile ? ['D', 'W', 'M', 'Q', 'Y'] : ['Days', 'Weeks', 'Months', 'Quarters', 'Years']).map((label, i) => {
              const fullLabels = ['days', 'weeks', 'months', 'quarters', 'years'];
              const isActive = granularity === fullLabels[i];
              return (
                <button
                  key={label}
                  onClick={() => setGranularity(fullLabels[i])}
                  className={`relative px-2.5 md:px-4 py-1.5 md:py-2 text-xs font-semibold rounded-lg transition-all duration-300 ${
                    isActive
                      ? theme === 'dark'
                        ? 'text-white'
                        : 'text-white'
                      : theme === 'dark'
                        ? 'text-slate-400 hover:text-slate-200'
                        : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {isActive && (
                    <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-500 shadow-lg shadow-indigo-500/30" />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              );
            })}
          </div>

          {/* Zoom Controls - Refined minimal design */}
          <div className={`flex items-center gap-1 rounded-xl p-1 ${
            theme === 'dark' 
              ? 'bg-slate-800/60 border border-white/[0.06]' 
              : 'bg-slate-100/80 border border-slate-200/60'
          }`}>
            <button
              onClick={handleZoomOut}
              className={`p-1.5 md:p-2 rounded-lg transition-all duration-200 active:scale-95 ${
                theme === 'dark' 
                  ? 'hover:bg-white/10 text-slate-400 hover:text-white' 
                  : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'
              }`}
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
            <div className={`px-2 py-1 rounded-md min-w-[40px] md:min-w-[50px] text-center ${
              theme === 'dark' 
                ? 'bg-white/5 text-cyan-400 font-mono' 
                : 'bg-slate-200/60 text-cyan-600 font-mono'
            }`}>
              <span className="text-xs font-semibold">{Math.round(zoom * 100)}%</span>
            </div>
            <button
              onClick={handleZoomIn}
              className={`p-1.5 md:p-2 rounded-lg transition-all duration-200 active:scale-95 ${
                theme === 'dark' 
                  ? 'hover:bg-white/10 text-slate-400 hover:text-white' 
                  : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'
              }`}
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
            {/* Hide less essential controls on mobile */}
            <div className={`hidden md:block w-px h-4 mx-0.5 md:mx-1 ${theme === 'dark' ? 'bg-slate-700' : 'bg-slate-300'}`} />
            <button
              onClick={handleAutoFit}
              className={`hidden md:block p-1 md:p-1.5 rounded-md transition ${
                theme === 'dark' 
                  ? 'hover:bg-slate-700/50 text-slate-400 hover:text-slate-200' 
                  : 'hover:bg-slate-200 text-slate-500 hover:text-slate-700'
              }`}
              title="Auto Fit"
            >
              <Maximize2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
            <button
              onClick={handleResetZoom}
              className={`hidden md:block px-1.5 md:px-2 py-1 text-xs rounded-md transition ${
                theme === 'dark' 
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
              }`}
            >
              Reset
            </button>
            <div className={`w-px h-5 mx-1.5 ${theme === 'dark' ? 'bg-white/10' : 'bg-slate-300/60'}`} />
            <button
              onClick={scrollToToday}
              className={`p-1.5 md:p-2 rounded-lg transition-all duration-200 active:scale-95 ${
                theme === 'dark'
                  ? 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300 border border-cyan-500/20'
                  : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-600 hover:text-cyan-700 border border-cyan-200/60'
              }`}
              title="Go to Today"
            >
              <CalendarDays className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
            <div className={`hidden md:block w-px h-4 mx-0.5 md:mx-1 ${theme === 'dark' ? 'bg-slate-700' : 'bg-slate-300'}`} />
            <button
              onClick={toggleExpandedView}
              className={`hidden md:block p-1 md:p-1.5 rounded-md transition ${
                isExpandedView 
                  ? 'text-green-400 hover:text-green-300 bg-green-500/20' 
                  : theme === 'dark'
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
              }`}
              title={isExpandedView ? "Exit Full Height (for screenshot)" : "Full Height (for screenshot)"}
            >
              {isExpandedView ? <Minimize2 className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <Maximize2 className="w-3.5 h-3.5 md:w-4 md:h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded View Banner - Modern notification style */}
      {isExpandedView && (
        <div className={`flex items-center justify-between gap-4 px-4 py-2.5 ${
          theme === 'dark'
            ? 'bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 border-y border-emerald-500/20'
            : 'bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border-y border-emerald-200/60'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              theme === 'dark' ? 'bg-emerald-500/20' : 'bg-emerald-100'
            }`}>
              <span className="text-base">📸</span>
            </div>
            <div>
              <p className={`text-xs font-semibold ${theme === 'dark' ? 'text-emerald-300' : 'text-emerald-700'}`}>Full Height Mode Active</p>
              <p className={`text-[10px] ${theme === 'dark' ? 'text-emerald-400/70' : 'text-emerald-600/70'}`}>F12 → Ctrl+Shift+P → "Capture full size screenshot"</p>
            </div>
          </div>
          <button 
            onClick={toggleExpandedView} 
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 active:scale-95 ${
              theme === 'dark'
                ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30'
                : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700 border border-emerald-300'
            }`}
          >Exit</button>
        </div>
      )}

      {/* Main Chart Area - horizontal scroll always internal */}
      <div className={`flex ${isExpandedView ? 'overflow-x-auto' : 'flex-1 overflow-hidden'}`} style={isExpandedView ? { height: 'auto' } : {}}>
        {/* Task Names Toggle Button (Mobile) */}
        {isMobile && !showTaskNames && (
          <button
            onClick={() => setShowTaskNames(true)}
            className={`flex-shrink-0 flex items-center justify-center w-8 border-r ${
              theme === 'dark' 
                ? 'border-slate-700/50 bg-slate-800/50 hover:bg-slate-700/50 text-slate-400' 
                : 'border-slate-200 bg-slate-100/50 hover:bg-slate-200/50 text-slate-500'
            }`}
            title="Show task names"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}
        
        {/* Task Names Sidebar - Modern design */}
        {showTaskNames && (
        <div 
          className={`flex-shrink-0 border-r flex flex-col ${isExpandedView ? 'sticky left-0 z-10' : ''} ${
            theme === 'dark' 
              ? 'border-white/[0.06] bg-slate-900/30' 
              : 'border-slate-200/60 bg-slate-50/30'
          }`}
          style={{ width: taskNameWidth, height: isExpandedView ? 'auto' : undefined }}
        >
          {/* Header - Refined styling */}
          <div
            className={`flex items-center justify-between px-3 md:px-4 font-semibold text-xs md:text-sm border-b flex-shrink-0 tracking-wide ${
              theme === 'dark' 
                ? 'text-slate-400 border-white/[0.06] bg-white/[0.02]' 
                : 'text-slate-500 border-slate-200/60 bg-slate-100/20'
            }`}
            style={{ height: rowHeight }}
          >
            <span className="truncate uppercase">{isMobile ? 'Tasks' : 'Task Name'}</span>
            {isMobile && (
              <button
                onClick={() => setShowTaskNames(false)}
                className={`p-1 rounded transition flex-shrink-0 ${
                  theme === 'dark' 
                    ? 'hover:bg-slate-700/50 text-slate-400' 
                    : 'hover:bg-slate-200 text-slate-500'
                }`}
                title="Hide task names for more chart space"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Task list */}
          <div className={isExpandedView ? '' : 'flex-1 overflow-y-auto'}>
            {tasks.map((task) => (
              <TaskNameComponent key={task.id} task={task} />
            ))}
          </div>
        </div>
        )}

        {/* Timeline */}
        <div id="gantt-timeline-container" className={`flex-1 ${isExpandedView ? '' : 'overflow-x-auto overflow-y-auto'}`}>
          <div style={{ width: totalWidth, minHeight: totalHeight + rowHeight }}>
            {/* Date Headers - Modern frosted glass */}
            <div className={`flex border-b sticky top-0 z-20 backdrop-blur-xl ${
              theme === 'dark' 
                ? 'border-white/[0.06] bg-slate-900/90' 
                : 'border-slate-200/60 bg-white/90'
            }`}>
              <DateHeaders />
            </div>

            {/* Chart Content */}
            <div className="relative" style={{ height: totalHeight, paddingTop: taskLabelPosition === 'top' ? 16 : 0 }}>
              {/* Grid Lines - rendered dynamically based on granularity */}
              <GridLines />

              {/* Row backgrounds - Subtle alternating with hover effect */}
              {flatTasksList.map((_, i) => (
                <div
                  key={i}
                  className={`absolute left-0 right-0 border-b transition-colors duration-150 ${
                    theme === 'dark'
                      ? `border-white/[0.03] ${i % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.015]'} hover:bg-white/[0.04]`
                      : `border-slate-200/40 ${i % 2 === 0 ? 'bg-transparent' : 'bg-slate-100/30'} hover:bg-slate-100/50`
                  }`}
                  style={{ top: i * rowHeight, height: rowHeight }}
                />
              ))}

              {/* Today Line - Enhanced visibility with glow effect */}
              <div
                className="absolute top-0 bottom-0 z-30"
                style={{ left: `${getTodayPosition()}px` }}
              >
                {/* Glow effect */}
                <div className={`absolute inset-y-0 -left-2 w-4 ${
                  theme === 'dark' 
                    ? 'bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent' 
                    : 'bg-gradient-to-r from-transparent via-cyan-400/15 to-transparent'
                }`} />
                {/* Main line */}
                <div className={`absolute inset-y-0 w-0.5 ${
                  theme === 'dark'
                    ? 'bg-gradient-to-b from-cyan-400 via-cyan-500 to-cyan-400'
                    : 'bg-gradient-to-b from-cyan-500 via-cyan-600 to-cyan-500'
                }`} style={{ boxShadow: theme === 'dark' ? '0 0 12px rgba(34, 211, 238, 0.5)' : '0 0 8px rgba(6, 182, 212, 0.4)' }} />
                {/* Top indicator */}
                <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full ${
                  theme === 'dark' ? 'bg-cyan-400' : 'bg-cyan-500'
                }`} style={{ boxShadow: theme === 'dark' ? '0 0 8px rgba(34, 211, 238, 0.6)' : '0 0 6px rgba(6, 182, 212, 0.5)' }} />
                {/* "Today" label */}
                <div className={`absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${
                  theme === 'dark' 
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' 
                    : 'bg-cyan-100 text-cyan-700 border border-cyan-300'
                }`}>Today</div>
              </div>

              {/* Dependency Lines */}
              {showDependencyLines && (
                <svg 
                  className="absolute top-0 left-0 pointer-events-none overflow-visible" 
                  style={{ zIndex: 5, width: totalWidth, height: totalHeight }}
                >
                  {/* Gradient definitions for dependency lines */}
                  <defs>
                    <linearGradient id="depLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                    <linearGradient id="depLineGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.4" />
                    </linearGradient>
                  </defs>
                  <DependencyLines />
                </svg>
              )}

              {/* Task Bars - memoized for performance */}
              {taskBarsRendered}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

GanttChart.displayName = 'GanttChart';
export default memo(GanttChart);

// Helper functions
function flattenTasks(tasks, level = 0) {
  return tasks.reduce((acc, task) => {
    acc.push({ ...task, level });
    if (task.children && task.children.length > 0) {
      acc.push(...flattenTasks(task.children, level + 1));
    }
    return acc;
  }, []);
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function isDateToday(date) {
  const today = new Date();
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
}
