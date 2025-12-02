import { jsPDF } from 'jspdf';

/**
 * HIGH-ACCURACY PDF EXPORT
 * Renders the Gantt chart directly to canvas with pixel-perfect precision.
 * Supports multiple timeframes: Days, Weeks, Months, Quarters, Years
 * Supports light and dark themes for export
 */
export const exportToPDF = async (ganttRef, tasks, filename = 'gantt-chart.pdf', options = {}) => {
  try {
    if (!tasks || tasks.length === 0) {
      alert('No tasks to export.');
      return false;
    }

    // Get theme and shape preferences from options
    const exportTheme = options.theme || 'light'; // Default to light for printing
    const useRoundedSubtasks = options.useRoundedSubtasks || false;
    const showDependencyLines = options.showDependencyLinesOnExport !== false; // Default true for backward compat
    const barHeightPreference = options.barHeight || 'normal';
    const taskLabelPosition = options.taskLabelPosition || 'inside';
    const workspaceTitle = options.workspaceTitle || null;

    // Calculate bar height based on preference
    const barHeightPx = {
      compact: 18,
      normal: 24,
      large: 32
    }[barHeightPreference] || 24;
    
    // Row height scales with bar height
    const rowHeightPx = barHeightPx + 12;

    // Flatten tasks for rendering
    const flatTasks = flattenTasksForExport(tasks);
    
    // Calculate date range from tasks
    const taskDates = flatTasks.flatMap(t => [new Date(t.start), new Date(t.end)]);
    let minDate = new Date(Math.min(...taskDates));
    let maxDate = new Date(Math.max(...taskDates));
    
    // Normalize dates
    minDate.setHours(0, 0, 0, 0);
    maxDate.setHours(0, 0, 0, 0);
    
    const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24));
    
    // Use user's current timeframe if provided, otherwise auto-detect
    const timeframe = options.timeframe || detectTimeframe(totalDays);
    
    // Calculate timeline units based on timeframe
    const { units, unitWidth, getUnitLabel, getUnitSubLabel, alignedMinDate, alignedMaxDate } = 
      calculateTimelineUnits(minDate, maxDate, timeframe);

    // Color schemes based on theme
    const colorSchemes = {
      light: {
        background: '#ffffff',
        headerBg: '#f8fafc',
        rowEven: '#ffffff',
        rowOdd: '#f8fafc',
        gridLine: '#e2e8f0',
        gridLineFaint: '#f1f5f9',
        text: '#1e293b',
        textMuted: '#64748b',
        todayLine: '#0891b2',
        barNotStarted: { start: '#94a3b8', end: '#64748b' },
        barInProgress: { start: '#f59e0b', end: '#d97706' },
        barComplete: { start: '#22c55e', end: '#16a34a' },
        deadline: { start: '#f97316', end: '#ea580c' },
        deadlineComplete: { start: '#22c55e', end: '#16a34a' }
      },
      dark: {
        background: '#0f172a',
        headerBg: '#1e293b',
        rowEven: '#0f172a',
        rowOdd: '#151f32',
        gridLine: '#334155',
        gridLineFaint: '#1e293b',
        text: '#e2e8f0',
        textMuted: '#94a3b8',
        todayLine: '#22d3ee',
        barNotStarted: { start: '#64748b', end: '#475569' },
        barInProgress: { start: '#fdab3d', end: '#ff9f1a' },
        barComplete: { start: '#10b981', end: '#059669' },
        deadline: { start: '#f97316', end: '#ea580c' },
        deadlineComplete: { start: '#10b981', end: '#059669' }
      }
    };

    const colors = colorSchemes[exportTheme] || colorSchemes.light;

    // Layout configuration
    const config = {
      scale: 2, // High DPI for crisp rendering
      taskNameWidth: 220,
      rowHeight: rowHeightPx,
      headerHeight: 44,
      unitWidth: unitWidth,
      barHeight: barHeightPx,
      padding: 20,
      fontSize: {
        header: 11,
        taskName: 10,
        date: 9,
        barLabel: barHeightPreference === 'compact' ? 8 : 9
      },
      colors,
      taskLabelPosition,
      showDependencyLines
    };

    // Calculate canvas dimensions
    const timelineWidth = units.length * config.unitWidth;
    const canvasWidth = config.taskNameWidth + timelineWidth + config.padding * 2;
    const canvasHeight = config.headerHeight + flatTasks.length * config.rowHeight + config.padding * 2;

    // Create high-resolution canvas
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth * config.scale;
    canvas.height = canvasHeight * config.scale;
    const ctx = canvas.getContext('2d');
    
    // Scale for high DPI
    ctx.scale(config.scale, config.scale);

    // Enable text anti-aliasing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Draw background
    ctx.fillStyle = config.colors.background;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw header background
    ctx.fillStyle = config.colors.headerBg;
    ctx.fillRect(config.padding, config.padding, canvasWidth - config.padding * 2, config.headerHeight);

    // --- DRAW TIMELINE HEADERS ---
    const startX = config.padding + config.taskNameWidth;
    
    units.forEach((unit, i) => {
      const x = startX + i * config.unitWidth;
      const isCurrentPeriod = isUnitCurrent(unit.date, timeframe);
      
      // Unit cell background
      if (isCurrentPeriod) {
        ctx.fillStyle = 'rgba(34, 211, 238, 0.2)';
        ctx.fillRect(x, config.padding, config.unitWidth, config.headerHeight);
      }
      
      // Header text
      ctx.fillStyle = isCurrentPeriod ? config.colors.todayLine : config.colors.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Main label
      ctx.font = `600 ${config.fontSize.date}px Inter, system-ui, sans-serif`;
      ctx.fillText(getUnitLabel(unit), x + config.unitWidth / 2, config.padding + config.headerHeight / 2 - 7);
      
      // Sub label (year for months, date for weeks, etc.)
      ctx.font = `${config.fontSize.date - 1}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = isCurrentPeriod ? config.colors.todayLine : config.colors.textMuted;
      ctx.fillText(getUnitSubLabel(unit), x + config.unitWidth / 2, config.padding + config.headerHeight / 2 + 8);
      
      // Vertical grid line (from BELOW header to bottom)
      ctx.strokeStyle = config.colors.gridLineFaint;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, config.padding + config.headerHeight);
      ctx.lineTo(x, canvasHeight - config.padding);
      ctx.stroke();
    });

    // --- DRAW TASK NAME HEADER ---
    ctx.fillStyle = config.colors.text;
    ctx.font = `600 ${config.fontSize.header}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Task Name', config.padding + 12, config.padding + config.headerHeight / 2);

    // Separator line between header and content
    ctx.strokeStyle = config.colors.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(config.padding, config.padding + config.headerHeight);
    ctx.lineTo(canvasWidth - config.padding, config.padding + config.headerHeight);
    ctx.stroke();

    // --- DRAW ROWS AND TASK BARS ---
    const rowStartY = config.padding + config.headerHeight;
    
    flatTasks.forEach((task, index) => {
      const rowY = rowStartY + index * config.rowHeight;
      
      // Row background (alternating)
      ctx.fillStyle = index % 2 === 0 ? config.colors.rowEven : config.colors.rowOdd;
      ctx.fillRect(config.padding, rowY, canvasWidth - config.padding * 2, config.rowHeight);
      
      // Row border
      ctx.strokeStyle = config.colors.gridLineFaint;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(config.padding, rowY + config.rowHeight);
      ctx.lineTo(canvasWidth - config.padding, rowY + config.rowHeight);
      ctx.stroke();

      // --- TASK NAME AND DATE RANGE ---
      const indent = task.level * 16;
      ctx.fillStyle = config.colors.text;
      ctx.font = `500 ${config.fontSize.taskName}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      
      // Truncate long names
      const maxNameWidth = config.taskNameWidth - indent - 24;
      let displayName = task.name;
      let nameWidth = ctx.measureText(displayName).width;
      while (nameWidth > maxNameWidth && displayName.length > 3) {
        displayName = displayName.slice(0, -4) + '...';
        nameWidth = ctx.measureText(displayName).width;
      }
      
      // Format date range
      const formatDateShort = (date) => {
        return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      };
      const taskStartDate = new Date(task.start);
      const taskEndDate = new Date(task.end);
      const isSameDay = taskStartDate.getTime() === taskEndDate.getTime();
      const dateRange = isSameDay 
        ? formatDateShort(task.start)
        : `${formatDateShort(task.start)} - ${formatDateShort(task.end)}`;
      
      // Draw task name (slightly higher to make room for date)
      ctx.fillText(displayName, config.padding + 12 + indent, rowY + config.rowHeight / 2 - 6);
      
      // Draw date range below the name
      ctx.fillStyle = config.colors.textMuted;
      ctx.font = `400 ${config.fontSize.date - 1}px Inter, system-ui, sans-serif`;
      ctx.fillText(dateRange, config.padding + 12 + indent, rowY + config.rowHeight / 2 + 8);

      // --- TASK BAR ---
      const taskStart = new Date(task.start);
      const taskEnd = new Date(task.end);
      taskStart.setHours(0, 0, 0, 0);
      taskEnd.setHours(0, 0, 0, 0);
      
      // Calculate bar position based on timeframe
      const barPosition = calculateBarPosition(
        taskStart, taskEnd, alignedMinDate, units, config.unitWidth, timeframe
      );
      
      const barX = startX + barPosition.left;
      const barWidth = Math.max(20, barPosition.width);
      const barY = rowY + (config.rowHeight - config.barHeight) / 2;
      
      const isDeadline = task.isDeadline || taskStart.getTime() === taskEnd.getTime();
      const isComplete = task.progress === 100 || task.isDone;
      const isInProgress = task.progress > 0 && task.progress < 100;
      const isWorking = task.isWorking || hasWorkingChild(task);

      if (isDeadline) {
        // Check user preference: rounded bars or diamond markers
        if (useRoundedSubtasks) {
          // --- ROUNDED BAR FOR DEADLINE (same as regular tasks) ---
          let gradient;
          if (isComplete) {
            gradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY + config.barHeight);
            gradient.addColorStop(0, config.colors.deadlineComplete.start);
            gradient.addColorStop(1, config.colors.deadlineComplete.end);
          } else if (isWorking) {
            gradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY + config.barHeight);
            gradient.addColorStop(0, config.colors.barInProgress.start);
            gradient.addColorStop(1, config.colors.barInProgress.end);
          } else {
            gradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY + config.barHeight);
            gradient.addColorStop(0, config.colors.barNotStarted.start);
            gradient.addColorStop(1, config.colors.barNotStarted.end);
          }
          
          // Draw rounded bar
          const barRadius = config.barHeight / 2;
          ctx.beginPath();
          ctx.roundRect(barX, barY, Math.max(barWidth, 30), config.barHeight, barRadius);
          ctx.fillStyle = gradient;
          
          ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
          ctx.shadowBlur = 3;
          ctx.shadowOffsetY = 1;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          
          // Bar label - only if inside and bar is wide enough
          if (config.taskLabelPosition === 'inside' && barWidth > 40) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `600 ${config.fontSize.barLabel}px Inter, system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            let label = task.name;
            if (isComplete) label += ' ✓';
            
            const maxLabelWidth = barWidth - 12;
            let labelWidth = ctx.measureText(label).width;
            while (labelWidth > maxLabelWidth && label.length > 3) {
              label = label.slice(0, -4) + '...';
              labelWidth = ctx.measureText(label).width;
            }
            
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 1;
            ctx.fillText(label, barX + Math.max(barWidth, 30) / 2, barY + config.barHeight / 2);
            ctx.shadowBlur = 0;
          } else if (config.taskLabelPosition === 'outside') {
            // Label outside the bar
            ctx.fillStyle = config.colors.text;
            ctx.font = `500 ${config.fontSize.barLabel}px Inter, system-ui, sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            
            let label = task.name;
            if (isComplete) label += ' ✓';
            
            ctx.fillText(label, barX + Math.max(barWidth, 30) + 8, barY + config.barHeight / 2);
          }
          // If taskLabelPosition === 'hidden', we don't draw any label
        } else {
        // --- DEADLINE DIAMOND (original behavior) ---
        const diamondSize = 16;
        const cx = barX + barWidth / 2;
        const cy = rowY + config.rowHeight / 2;
        
        // Create gradient for diamond - status: complete > working > not started
        const gradient = ctx.createLinearGradient(cx - diamondSize, cy - diamondSize, cx + diamondSize, cy + diamondSize);
        if (isComplete) {
          gradient.addColorStop(0, config.colors.deadlineComplete.start);
          gradient.addColorStop(1, config.colors.deadlineComplete.end);
        } else if (isWorking) {
          gradient.addColorStop(0, config.colors.barInProgress.start);
          gradient.addColorStop(1, config.colors.barInProgress.end);
        } else {
          gradient.addColorStop(0, config.colors.barNotStarted.start);
          gradient.addColorStop(1, config.colors.barNotStarted.end);
        }
        
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4);
        
        // Draw rounded rectangle (rotated = diamond)
        const radius = 3;
        ctx.beginPath();
        ctx.moveTo(-diamondSize / 2 + radius, -diamondSize / 2);
        ctx.lineTo(diamondSize / 2 - radius, -diamondSize / 2);
        ctx.quadraticCurveTo(diamondSize / 2, -diamondSize / 2, diamondSize / 2, -diamondSize / 2 + radius);
        ctx.lineTo(diamondSize / 2, diamondSize / 2 - radius);
        ctx.quadraticCurveTo(diamondSize / 2, diamondSize / 2, diamondSize / 2 - radius, diamondSize / 2);
        ctx.lineTo(-diamondSize / 2 + radius, diamondSize / 2);
        ctx.quadraticCurveTo(-diamondSize / 2, diamondSize / 2, -diamondSize / 2, diamondSize / 2 - radius);
        ctx.lineTo(-diamondSize / 2, -diamondSize / 2 + radius);
        ctx.quadraticCurveTo(-diamondSize / 2, -diamondSize / 2, -diamondSize / 2 + radius, -diamondSize / 2);
        ctx.closePath();
        
        ctx.fillStyle = gradient;
        ctx.fill();
        
        ctx.shadowColor = isComplete ? 'rgba(16, 185, 129, 0.4)' : 'rgba(249, 115, 22, 0.4)';
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.restore();
        
        // Center checkmark or dot
        ctx.fillStyle = '#ffffff';
        if (isComplete) {
          ctx.beginPath();
          ctx.moveTo(cx - 3, cy);
          ctx.lineTo(cx - 1, cy + 2);
          ctx.lineTo(cx + 3, cy - 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        
        // Label - Outside (for diamond markers)
        if (config.taskLabelPosition === 'outside') {
          ctx.fillStyle = config.colors.text;
          ctx.font = `500 ${config.fontSize.barLabel}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          
          let label = task.name;
          if (isComplete) label += ' ✓';
          
          ctx.fillText(label, cx + diamondSize / 2 + 8, cy);
        }
        } // End of diamond else block
      } else {
        // --- REGULAR TASK BAR ---
        let gradient;
        if (isComplete) {
          gradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY + config.barHeight);
          gradient.addColorStop(0, config.colors.barComplete.start);
          gradient.addColorStop(1, config.colors.barComplete.end);
        } else if (isWorking || isInProgress) {
          // Working status or has progress = amber/orange
          gradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY + config.barHeight);
          gradient.addColorStop(0, config.colors.barInProgress.start);
          gradient.addColorStop(1, config.colors.barInProgress.end);
        } else {
          gradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY + config.barHeight);
          gradient.addColorStop(0, config.colors.barNotStarted.start);
          gradient.addColorStop(1, config.colors.barNotStarted.end);
        }
        
        // Draw rounded bar
        const barRadius = config.barHeight / 2;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, config.barHeight, barRadius);
        ctx.fillStyle = gradient;
        
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        
        // Progress fill
        if (isInProgress) {
          const progressWidth = (barWidth * task.progress) / 100;
          ctx.beginPath();
          ctx.roundRect(barX, barY, progressWidth, config.barHeight, [barRadius, 0, 0, barRadius]);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.fill();
        }
        
        // Bar label - respect taskLabelPosition preference
        if (config.taskLabelPosition === 'inside' && barWidth > 50) {
          ctx.fillStyle = '#ffffff';
          ctx.font = `600 ${config.fontSize.barLabel}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          let label = task.name;
          if (barWidth > 90 && task.progress > 0) {
            label += ` ${task.progress}%`;
          }
          
          const maxLabelWidth = barWidth - 16;
          let labelWidth = ctx.measureText(label).width;
          while (labelWidth > maxLabelWidth && label.length > 3) {
            label = label.slice(0, -4) + '...';
            labelWidth = ctx.measureText(label).width;
          }
          
          ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
          ctx.shadowBlur = 2;
          ctx.fillText(label, barX + barWidth / 2, barY + config.barHeight / 2);
          ctx.shadowBlur = 0;
        } else if (config.taskLabelPosition === 'outside') {
          // Label outside the bar
          ctx.fillStyle = config.colors.text;
          ctx.font = `500 ${config.fontSize.barLabel}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          
          let label = task.name;
          if (task.progress > 0) {
            label += ` ${task.progress}%`;
          }
          
          ctx.fillText(label, barX + barWidth + 8, barY + config.barHeight / 2);
        }
        // If taskLabelPosition === 'hidden', we don't draw any label
      }
    });

    // --- DRAW TODAY LINE ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (today >= alignedMinDate && today <= alignedMaxDate) {
      const todayPos = calculateBarPosition(today, today, alignedMinDate, units, config.unitWidth, timeframe);
      const todayX = startX + todayPos.left + todayPos.width / 2;
      
      ctx.strokeStyle = config.colors.todayLine;
      ctx.lineWidth = 2;
      ctx.shadowColor = config.colors.todayLine;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(todayX, config.padding + config.headerHeight);
      ctx.lineTo(todayX, canvasHeight - config.padding);
      ctx.stroke();
      ctx.shadowBlur = 0;
      
      ctx.fillStyle = config.colors.todayLine;
      ctx.beginPath();
      ctx.arc(todayX, config.padding + config.headerHeight, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- DRAW DEPENDENCY LINES (only if enabled) ---
    if (config.showDependencyLines) {
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    
    flatTasks.forEach((task, toIndex) => {
      if (!task.dependencies || task.dependencies.length === 0) return;
      
      task.dependencies.forEach(depId => {
        const fromIndex = flatTasks.findIndex(t => t.id === depId);
        if (fromIndex === -1) return;
        
        const fromTask = flatTasks[fromIndex];
        
        const fromEnd = new Date(fromTask.end);
        const toStart = new Date(task.start);
        fromEnd.setHours(0, 0, 0, 0);
        toStart.setHours(0, 0, 0, 0);
        
        const fromPos = calculateBarPosition(fromEnd, fromEnd, alignedMinDate, units, config.unitWidth, timeframe);
        const toPos = calculateBarPosition(toStart, toStart, alignedMinDate, units, config.unitWidth, timeframe);
        
        const fromX = startX + fromPos.left + fromPos.width;
        const fromY = rowStartY + fromIndex * config.rowHeight + config.rowHeight / 2;
        const toX = startX + toPos.left;
        const toY = rowStartY + toIndex * config.rowHeight + config.rowHeight / 2;
        
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        
        if (toX > fromX + 20) {
          const midX = fromX + 15;
          ctx.lineTo(midX, fromY);
          ctx.quadraticCurveTo(midX + 10, fromY, midX + 10, fromY + (toY > fromY ? 10 : -10));
          ctx.lineTo(midX + 10, toY + (toY > fromY ? -10 : 10));
          ctx.quadraticCurveTo(midX + 10, toY, midX + 20, toY);
          ctx.lineTo(toX - 8, toY);
        } else {
          ctx.lineTo(toX - 8, toY);
        }
        
        ctx.stroke();
        
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - 8, toY - 4);
        ctx.lineTo(toX - 8, toY + 4);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(fromX, fromY, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    }

    // --- GENERATE PDF ---
    const pageWidth = 279.4;
    const pageHeight = 215.9;
    const margin = 10;
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;

    const imgWidth = canvasWidth;
    const imgHeight = canvasHeight;
    const scaleX = contentWidth / imgWidth;
    const scaleY = contentHeight / imgHeight;
    const scale = Math.min(scaleX, scaleY);
    
    const finalWidth = imgWidth * scale;
    const finalHeight = imgHeight * scale;
    const xOffset = margin + (contentWidth - finalWidth) / 2;
    const yOffset = margin + (contentHeight - finalHeight) / 2;

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'letter'
    });

    // Set background based on theme
    if (exportTheme === 'dark') {
      doc.setFillColor(15, 23, 42); // Dark background
    } else {
      doc.setFillColor(255, 255, 255); // White background for light theme
    }
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    const imgData = canvas.toDataURL('image/png', 1.0);
    doc.addImage(imgData, 'PNG', xOffset, yOffset, finalWidth, finalHeight);

    doc.setFontSize(7);
    if (exportTheme === 'dark') {
      doc.setTextColor(148, 163, 184);
    } else {
      doc.setTextColor(100, 116, 139);
    }
    const timeframeLabel = timeframe.charAt(0).toUpperCase() + timeframe.slice(1);
    const titleText = workspaceTitle ? `${workspaceTitle} | ` : '';
    doc.text(`${titleText}Exported: ${new Date().toLocaleDateString()} | ${flatTasks.length} tasks | View: ${timeframeLabel} | Theme: ${exportTheme}`, margin, pageHeight - 3);

    doc.save(filename);
    return true;
  } catch (err) {
    console.error('PDF export failed:', err);
    alert('Failed to export PDF. Check console for details.');
    return false;
  }
};

// ==================== TIMEFRAME HELPERS ====================

// Auto-detect best timeframe based on task span
function detectTimeframe(totalDays) {
  if (totalDays <= 14) return 'days';
  if (totalDays <= 60) return 'weeks';
  if (totalDays <= 365) return 'months';
  if (totalDays <= 730) return 'quarters';
  return 'years';
}

// Calculate timeline units based on timeframe
function calculateTimelineUnits(minDate, maxDate, timeframe) {
  const units = [];
  let alignedMinDate, alignedMaxDate;
  let unitWidth;
  
  switch (timeframe) {
    case 'days': {
      // Buffer: 3 days before and after
      alignedMinDate = new Date(minDate.getTime() - 3 * 24 * 60 * 60 * 1000);
      alignedMaxDate = new Date(maxDate.getTime() + 3 * 24 * 60 * 60 * 1000);
      unitWidth = 32;
      
      let current = new Date(alignedMinDate);
      while (current <= alignedMaxDate) {
        units.push({ date: new Date(current), type: 'day' });
        current.setDate(current.getDate() + 1);
      }
      break;
    }
    
    case 'weeks': {
      // Align to Monday
      alignedMinDate = new Date(minDate);
      alignedMinDate.setDate(alignedMinDate.getDate() - alignedMinDate.getDay() - 7);
      alignedMaxDate = new Date(maxDate);
      alignedMaxDate.setDate(alignedMaxDate.getDate() + (7 - alignedMaxDate.getDay()) + 7);
      unitWidth = 60;
      
      let current = new Date(alignedMinDate);
      while (current <= alignedMaxDate) {
        units.push({ date: new Date(current), type: 'week' });
        current.setDate(current.getDate() + 7);
      }
      break;
    }
    
    case 'months': {
      // Align to first of month
      alignedMinDate = new Date(minDate.getFullYear(), minDate.getMonth() - 1, 1);
      alignedMaxDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 0);
      unitWidth = 80;
      
      let current = new Date(alignedMinDate);
      while (current <= alignedMaxDate) {
        units.push({ date: new Date(current), type: 'month' });
        current.setMonth(current.getMonth() + 1);
      }
      break;
    }
    
    case 'quarters': {
      // Align to quarter start
      const startQuarter = Math.floor(minDate.getMonth() / 3);
      alignedMinDate = new Date(minDate.getFullYear(), startQuarter * 3 - 3, 1);
      const endQuarter = Math.floor(maxDate.getMonth() / 3);
      alignedMaxDate = new Date(maxDate.getFullYear(), (endQuarter + 2) * 3, 0);
      unitWidth = 100;
      
      let current = new Date(alignedMinDate);
      while (current <= alignedMaxDate) {
        units.push({ date: new Date(current), type: 'quarter' });
        current.setMonth(current.getMonth() + 3);
      }
      break;
    }
    
    case 'years': {
      alignedMinDate = new Date(minDate.getFullYear() - 1, 0, 1);
      alignedMaxDate = new Date(maxDate.getFullYear() + 1, 11, 31);
      unitWidth = 120;
      
      let current = new Date(alignedMinDate);
      while (current <= alignedMaxDate) {
        units.push({ date: new Date(current), type: 'year' });
        current.setFullYear(current.getFullYear() + 1);
      }
      break;
    }
  }
  
  return {
    units,
    unitWidth,
    alignedMinDate,
    alignedMaxDate,
    getUnitLabel: (unit) => {
      switch (timeframe) {
        case 'days':
          return unit.date.toLocaleDateString('en-US', { weekday: 'short' }).substring(0, 2);
        case 'weeks':
          return `W${getWeekNumber(unit.date)}`;
        case 'months':
          return unit.date.toLocaleDateString('en-US', { month: 'short' });
        case 'quarters':
          return `Q${Math.floor(unit.date.getMonth() / 3) + 1}`;
        case 'years':
          return unit.date.getFullYear().toString();
      }
    },
    getUnitSubLabel: (unit) => {
      switch (timeframe) {
        case 'days':
          return unit.date.getDate().toString();
        case 'weeks':
          return unit.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        case 'months':
          return unit.date.getFullYear().toString();
        case 'quarters':
          return unit.date.getFullYear().toString();
        case 'years':
          return '';
      }
    }
  };
}

// Calculate bar position within the timeline
function calculateBarPosition(startDate, endDate, alignedMinDate, units, unitWidth, timeframe) {
  const msPerDay = 1000 * 60 * 60 * 24;
  
  switch (timeframe) {
    case 'days': {
      const daysFromStart = Math.round((startDate - alignedMinDate) / msPerDay);
      const duration = Math.max(1, Math.round((endDate - startDate) / msPerDay) + 1);
      return {
        left: daysFromStart * unitWidth,
        width: duration * unitWidth
      };
    }
    
    case 'weeks': {
      const daysFromStart = (startDate - alignedMinDate) / msPerDay;
      const weeksFromStart = daysFromStart / 7;
      const durationDays = Math.max(1, (endDate - startDate) / msPerDay + 1);
      const durationWeeks = durationDays / 7;
      return {
        left: weeksFromStart * unitWidth,
        width: Math.max(unitWidth * 0.3, durationWeeks * unitWidth)
      };
    }
    
    case 'months': {
      // Calculate position within months
      const startYear = startDate.getFullYear();
      const startMonth = startDate.getMonth();
      const startDay = startDate.getDate();
      const daysInStartMonth = new Date(startYear, startMonth + 1, 0).getDate();
      
      const alignedYear = alignedMinDate.getFullYear();
      const alignedMonth = alignedMinDate.getMonth();
      
      const monthsFromStart = (startYear - alignedYear) * 12 + (startMonth - alignedMonth);
      const fractionOfMonth = (startDay - 1) / daysInStartMonth;
      
      const endYear = endDate.getFullYear();
      const endMonth = endDate.getMonth();
      const endDay = endDate.getDate();
      const daysInEndMonth = new Date(endYear, endMonth + 1, 0).getDate();
      
      const endMonthsFromStart = (endYear - alignedYear) * 12 + (endMonth - alignedMonth);
      const endFraction = endDay / daysInEndMonth;
      
      const startPos = (monthsFromStart + fractionOfMonth) * unitWidth;
      const endPos = (endMonthsFromStart + endFraction) * unitWidth;
      
      return {
        left: startPos,
        width: Math.max(unitWidth * 0.2, endPos - startPos)
      };
    }
    
    case 'quarters': {
      const startYear = startDate.getFullYear();
      const startQuarter = Math.floor(startDate.getMonth() / 3);
      const startMonthInQuarter = startDate.getMonth() % 3;
      const startDay = startDate.getDate();
      
      const alignedYear = alignedMinDate.getFullYear();
      const alignedQuarter = Math.floor(alignedMinDate.getMonth() / 3);
      
      const quartersFromStart = (startYear - alignedYear) * 4 + (startQuarter - alignedQuarter);
      const fractionInQuarter = (startMonthInQuarter * 30 + startDay) / 90;
      
      const endYear = endDate.getFullYear();
      const endQuarter = Math.floor(endDate.getMonth() / 3);
      const endMonthInQuarter = endDate.getMonth() % 3;
      const endDay = endDate.getDate();
      
      const endQuartersFromStart = (endYear - alignedYear) * 4 + (endQuarter - alignedQuarter);
      const endFraction = (endMonthInQuarter * 30 + endDay) / 90;
      
      const startPos = (quartersFromStart + fractionInQuarter) * unitWidth;
      const endPos = (endQuartersFromStart + endFraction) * unitWidth;
      
      return {
        left: startPos,
        width: Math.max(unitWidth * 0.15, endPos - startPos)
      };
    }
    
    case 'years': {
      const startYear = startDate.getFullYear();
      const startDayOfYear = getDayOfYear(startDate);
      const daysInStartYear = isLeapYear(startYear) ? 366 : 365;
      
      const alignedYear = alignedMinDate.getFullYear();
      
      const yearsFromStart = startYear - alignedYear;
      const fractionOfYear = startDayOfYear / daysInStartYear;
      
      const endYear = endDate.getFullYear();
      const endDayOfYear = getDayOfYear(endDate);
      const daysInEndYear = isLeapYear(endYear) ? 366 : 365;
      
      const endYearsFromStart = endYear - alignedYear;
      const endFraction = endDayOfYear / daysInEndYear;
      
      const startPos = (yearsFromStart + fractionOfYear) * unitWidth;
      const endPos = (endYearsFromStart + endFraction) * unitWidth;
      
      return {
        left: startPos,
        width: Math.max(unitWidth * 0.1, endPos - startPos)
      };
    }
  }
}

// Check if a unit is the current period
function isUnitCurrent(date, timeframe) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  switch (timeframe) {
    case 'days':
      return date.toDateString() === today.toDateString();
    case 'weeks': {
      const weekStart = new Date(date);
      const weekEnd = new Date(date);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return today >= weekStart && today <= weekEnd;
    }
    case 'months':
      return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
    case 'quarters':
      return Math.floor(date.getMonth() / 3) === Math.floor(today.getMonth() / 3) && 
             date.getFullYear() === today.getFullYear();
    case 'years':
      return date.getFullYear() === today.getFullYear();
  }
}

// ==================== UTILITY FUNCTIONS ====================

// Check if any child (recursive) is currently working
function hasWorkingChild(task) {
  if (!task.children || task.children.length === 0) return false;
  return task.children.some(child => 
    child.isWorking || hasWorkingChild(child)
  );
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function flattenTasksForExport(tasks, level = 0) {
  return tasks.reduce((acc, task) => {
    acc.push({ ...task, level });
    if (task.children && task.children.length > 0) {
      acc.push(...flattenTasksForExport(task.children, level + 1));
    }
    return acc;
  }, []);
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// ==================== CSV EXPORT ====================
export const exportToCSV = (tasks, filename = 'gantt-chart.csv', options = {}) => {
  try {
    const workspaceTitle = options.workspaceTitle || null;
    const headers = ['ID', 'Task Name', 'Start Date', 'End Date', 'Progress', 'Milestone', 'Dependencies', 'Level'];
    const flatTasks = flattenTasksForExport(tasks);
    
    const rows = flatTasks.map((task) => [
      task.id,
      `"${task.name.replace(/"/g, '""')}"`,
      task.start,
      task.end,
      task.progress || 0,
      task.isMilestone || task.isDeadline ? 'Yes' : 'No',
      task.dependencies?.length > 0 ? task.dependencies.join(';') : 'None',
      task.level || 0
    ]);

    // Add workspace title as first row if present
    const csvLines = [];
    if (workspaceTitle) {
      csvLines.push(`"Project: ${workspaceTitle.replace(/"/g, '""')}"`);
      csvLines.push(`"Exported: ${new Date().toLocaleDateString()}"`);
      csvLines.push(''); // Empty line
    }
    csvLines.push(headers.join(','));
    csvLines.push(...rows.map((row) => row.join(',')));

    const csvContent = csvLines.join('\n');

    downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
    return true;
  } catch (err) {
    console.error('CSV export failed:', err);
    alert('Failed to export CSV. Check console for details.');
    return false;
  }
};

// ==================== JSON EXPORT ====================
export const exportToJSON = (tasks, filename = 'gantt-chart.json', options = {}) => {
  try {
    const workspaceTitle = options.workspaceTitle || null;
    const data = {
      version: '2.0',
      projectTitle: workspaceTitle,
      exportDate: new Date().toISOString(),
      taskCount: flattenTasksForExport(tasks).length,
      tasks: tasks
    };

    downloadFile(JSON.stringify(data, null, 2), filename, 'application/json');
    return true;
  } catch (err) {
    console.error('JSON export failed:', err);
    alert('Failed to export JSON. Check console for details.');
    return false;
  }
};
