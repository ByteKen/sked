import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GanttWorkspace } from '@/components/gantt/GanttWorkspace';
import { usePreferencesStore } from '@/store/preferencesStore';
import { DEFAULT_PREFERENCES, type Task } from '@/types';

const tasksFixture: Task[] = [
  {
    id: 1,
    name: 'Phase 1: Foundation',
    start: '2026-01-05',
    end: '2026-01-20',
    progress: 50,
    collapsed: false,
    children: [
      {
        id: 2,
        name: 'Setup Repository',
        description: 'Initialize TypeScript workspace and CI checks',
        start: '2026-01-05',
        end: '2026-01-10',
        progress: 100,
        isDone: true,
        parentId: 1,
      },
      {
        id: 3,
        name: 'CI Pipeline',
        start: '2026-01-11',
        end: '2026-01-20',
        progress: 0,
        parentId: 1,
      },
    ],
  },
];

describe('GanttWorkspace unified split-pane alignment', () => {
  beforeEach(() => {
    usePreferencesStore.setState({ ...DEFAULT_PREFERENCES });
  });

  it('hides child rows from both task hierarchy and timeline bars when collapsing a parent in read-only mode', async () => {
    const user = userEvent.setup();
    render(
      <GanttWorkspace
        tasks={tasksFixture}
        selectedTaskId={null}
        onSelectTask={vi.fn()}
        onTaskActivate={vi.fn()}
        readOnly
      />,
    );

    // Initially all 3 rows are visible in both hierarchy and timeline
    expect(screen.getByText('3 rows')).toBeInTheDocument();
    expect(screen.getAllByText('Setup Repository').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /Setup Repository:/i })).toBeInTheDocument();

    // Collapse Phase 1
    await user.click(screen.getByRole('button', { name: /Collapse Phase 1: Foundation/i }));

    // Both tree row and timeline bar for children are removed cleanly (1:1 alignment)
    expect(screen.getByText('1 rows')).toBeInTheDocument();
    expect(screen.queryByText('Setup Repository')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Setup Repository:/i })).not.toBeInTheDocument();
  });

  it('filters tasks cleanly using the toolbar status filter pills', async () => {
    const user = userEvent.setup();
    render(
      <GanttWorkspace
        tasks={tasksFixture}
        selectedTaskId={null}
        onSelectTask={vi.fn()}
        onTaskActivate={vi.fn()}
        readOnly
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getAllByText('Setup Repository').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('CI Pipeline')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Active' }));
    expect(screen.getAllByText('CI Pipeline').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Setup Repository')).not.toBeInTheDocument();
  });

  it('toggles inline task descriptions on the timeline via the toolbar button', async () => {
    const user = userEvent.setup();
    render(
      <GanttWorkspace
        tasks={tasksFixture}
        selectedTaskId={null}
        onSelectTask={vi.fn()}
        onTaskActivate={vi.fn()}
        readOnly
      />,
    );

    // Hidden by default
    expect(
      screen.queryByText('Initialize TypeScript workspace and CI checks'),
    ).not.toBeInTheDocument();

    const toggleBtn = screen.getByRole('button', {
      name: /Show task descriptions on timeline/i,
    });
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');

    // Toggle ON -> appears inline on the timeline and task list
    await user.click(toggleBtn);
    expect(
      screen.getAllByText('Initialize TypeScript workspace and CI checks').length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole('button', { name: /Hide task descriptions on timeline/i }),
    ).toHaveAttribute('aria-pressed', 'true');

    // Toggle OFF -> hidden again cleanly
    await user.click(
      screen.getByRole('button', { name: /Hide task descriptions on timeline/i }),
    );
    expect(
      screen.queryByText('Initialize TypeScript workspace and CI checks'),
    ).not.toBeInTheDocument();
  });

  it('zooms the timeline with Ctrl+Wheel and two-finger touch pinch without affecting plain scrolling', () => {
    render(
      <GanttWorkspace
        tasks={tasksFixture}
        selectedTaskId={null}
        onSelectTask={vi.fn()}
        onTaskActivate={vi.fn()}
        readOnly
      />,
    );

    const viewport = screen.getByTestId('timeline-viewport');
    const zoomIndicator = screen.getByTitle('Reset zoom to 100%');
    expect(zoomIndicator).toHaveTextContent('100%');

    // Plain scroll (no Ctrl/Cmd) must NOT change zoom
    fireEvent.wheel(viewport, { deltaY: -100, ctrlKey: false });
    expect(zoomIndicator).toHaveTextContent('100%');

    // Shift + Wheel scrolls horizontally without changing zoom
    viewport.scrollLeft = 50;
    const shiftWheelEvent = new WheelEvent('wheel', {
      deltaY: 120,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    viewport.dispatchEvent(shiftWheelEvent);
    expect(shiftWheelEvent.defaultPrevented).toBe(true);
    expect(viewport.scrollLeft).toBe(170);
    expect(zoomIndicator).toHaveTextContent('100%');

    // Ctrl + Wheel up zooms in and prevents browser page zoom
    const wheelInEvent = new WheelEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      clientX: 200,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      viewport.dispatchEvent(wheelInEvent);
    });
    expect(wheelInEvent.defaultPrevented).toBe(true);
    expect(zoomIndicator).toHaveTextContent('125%');

    // Two-finger mobile pinch spread (100px -> 200px) doubles current zoom (1.25 -> 2.5 = 250%)
    fireEvent.touchStart(viewport, {
      touches: [
        { clientX: 100, clientY: 100 },
        { clientX: 200, clientY: 100 },
      ],
    });
    fireEvent.touchMove(viewport, {
      touches: [
        { clientX: 50, clientY: 100 },
        { clientX: 250, clientY: 100 },
      ],
    });
    fireEvent.touchEnd(viewport, { touches: [] });

    expect(zoomIndicator).toHaveTextContent('250%');
  });

  it('shows a Collapse all / Expand all button in the mobile Tasks tab header and toggles all groups', async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 767px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    try {
      const user = userEvent.setup();
      render(
        <GanttWorkspace
          tasks={tasksFixture}
          selectedTaskId={null}
          onSelectTask={vi.fn()}
          onTaskActivate={vi.fn()}
          mobileView="list"
          readOnly
        />,
      );

      expect(screen.getByText('3 rows')).toBeInTheDocument();
      const collapseButtons = screen.getAllByRole('button', { name: /collapse all groups/i });
      // The mobile Tasks tab header renders a dedicated visible Collapse all pill
      const mobileHeaderBtn = collapseButtons.find((btn) => btn.textContent?.includes('Collapse all'));
      expect(mobileHeaderBtn).toBeDefined();

      await user.click(mobileHeaderBtn!);
      expect(screen.getByText('1 rows')).toBeInTheDocument();
      expect(screen.queryByText('Setup Repository')).not.toBeInTheDocument();

      const expandButtons = screen.getAllByRole('button', { name: /expand all groups/i });
      const mobileExpandBtn = expandButtons.find((btn) => btn.textContent?.includes('Expand all'));
      expect(mobileExpandBtn).toBeDefined();

      await user.click(mobileExpandBtn!);
      expect(screen.getByText('3 rows')).toBeInTheDocument();
      expect(screen.getByText('Setup Repository')).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: originalMatchMedia,
      });
    }
  });

  it('toggles Critical Path highlighting, renders Planned Baseline ghost bars & slip badges, and supports bar drag-to-reschedule', async () => {
    const user = userEvent.setup();
    const onRescheduleTask = vi.fn();

    render(
      <GanttWorkspace
        tasks={tasksFixture}
        selectedTaskId={null}
        onSelectTask={vi.fn()}
        onTaskActivate={vi.fn()}
        onRescheduleTask={onRescheduleTask}
        baseline={{
          savedAt: '2026-01-01T00:00:00Z',
          entries: {
            1: { start: '2026-01-05', end: '2026-01-18' },
            2: { start: '2026-01-05', end: '2026-01-10' },
            3: { start: '2026-01-11', end: '2026-01-18' },
          },
        }}
        onSaveBaseline={vi.fn()}
        onClearBaseline={vi.fn()}
      />,
    );

    // 1. Toggle Critical Path ON -> marks finish-driving task bars with data-critical="true"
    const cpmBtn = screen.getByRole('button', { name: /highlight critical path/i });
    await user.click(cpmBtn);
    expect(screen.getByRole('button', { name: /hide critical path/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const ciBar = screen.getByRole('button', { name: /CI Pipeline:/i });
    expect(ciBar).toHaveAttribute('data-critical', 'true');

    // 2. Open Baseline menu & show ghost bars -> renders ghost bar + "+2d" slip badge
    await user.click(screen.getByRole('button', { name: /baseline options/i }));
    await user.click(screen.getByRole('menuitem', { name: /show ghost bars/i }));
    expect(screen.getByTestId('baseline-ghost-3')).toBeInTheDocument();
    expect(screen.getAllByText('+2d').length).toBeGreaterThanOrEqual(1);

    // 3. Drag CI Pipeline bar -80px left within Phase 1 bounds (Days view at 100% zoom = 40px/day -> -2 days)
    fireEvent.pointerDown(ciBar, { clientX: 180, button: 0 });
    fireEvent.pointerMove(window, { clientX: 100 });
    fireEvent.pointerUp(window, { clientX: 100 });

    expect(onRescheduleTask).toHaveBeenCalledWith(3, '2026-01-09', '2026-01-18', true);
  });

  it('clamps subtask drag and resize handles strictly inside the parent start and end dates', () => {
    const onRescheduleTask = vi.fn();

    render(
      <GanttWorkspace
        tasks={tasksFixture}
        selectedTaskId={null}
        onSelectTask={vi.fn()}
        onTaskActivate={vi.fn()}
        onRescheduleTask={onRescheduleTask}
      />,
    );

    // 1. Extending Setup Repository (Jan 5 – Jan 10) right by +600px (+15d) clamps strictly at Phase 1 end (Jan 20)
    const setupEndHandle = screen.getByLabelText(/resize end date of setup repository/i);
    fireEvent.pointerDown(setupEndHandle, { clientX: 100, button: 0 });
    fireEvent.pointerMove(window, { clientX: 700 });
    expect(screen.getByText(/parent limit/i)).toBeInTheDocument();
    fireEvent.pointerUp(window, { clientX: 700 });

    expect(onRescheduleTask).toHaveBeenCalledWith(2, '2026-01-05', '2026-01-20', true);
    onRescheduleTask.mockClear();

    // 2. Trying to extend CI Pipeline (Jan 11 – Jan 20) past Phase 1 end (Jan 20) stays clamped (no reschedule)
    const ciEndHandle = screen.getByLabelText(/resize end date of ci pipeline/i);
    fireEvent.pointerDown(ciEndHandle, { clientX: 100, button: 0 });
    fireEvent.pointerMove(window, { clientX: 300 });
    expect(screen.getByText(/parent limit/i)).toBeInTheDocument();
    fireEvent.pointerUp(window, { clientX: 300 });

    expect(onRescheduleTask).not.toHaveBeenCalled();

    // 3. Trying to pull Setup Repository's start handle before Phase 1 start (Jan 5) stays clamped (no reschedule)
    const setupStartHandle = screen.getByLabelText(/resize start date of setup repository/i);
    fireEvent.pointerDown(setupStartHandle, { clientX: 200, button: 0 });
    fireEvent.pointerMove(window, { clientX: 40 });
    expect(screen.getByText(/parent limit/i)).toBeInTheDocument();
    fireEvent.pointerUp(window, { clientX: 40 });

    expect(onRescheduleTask).not.toHaveBeenCalled();
  });

  it('cancels an active bar drag when Escape is pressed without saving changes', () => {
    const onRescheduleTask = vi.fn();

    render(
      <GanttWorkspace
        tasks={tasksFixture}
        selectedTaskId={null}
        onSelectTask={vi.fn()}
        onTaskActivate={vi.fn()}
        onRescheduleTask={onRescheduleTask}
      />,
    );

    const ciBar = screen.getByRole('button', { name: /CI Pipeline:/i });
    fireEvent.pointerDown(ciBar, { clientX: 100, button: 0 });
    fireEvent.pointerMove(window, { clientX: 180 });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(window, { clientX: 180 });

    expect(onRescheduleTask).not.toHaveBeenCalled();
  });

  it('yields immediate touch swipes to native scrolling and arms touch drag only after a brief hold', () => {
    vi.useFakeTimers();
    try {
      const onRescheduleTask = vi.fn();

      render(
        <GanttWorkspace
          tasks={tasksFixture}
          selectedTaskId={null}
          onSelectTask={vi.fn()}
          onTaskActivate={vi.fn()}
          onRescheduleTask={onRescheduleTask}
        />,
      );

      const ciBar = screen.getByRole('button', { name: /CI Pipeline:/i });

      // 1. Immediate touch swipe (> 8px before 260ms) cancels drag so scrolling stays native
      fireEvent.pointerDown(ciBar, {
        clientX: 100,
        clientY: 50,
        button: 0,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
      });
      fireEvent.pointerMove(window, {
        clientX: 160,
        clientY: 52,
        pointerId: 1,
        pointerType: 'touch',
      });
      fireEvent.pointerUp(window, { clientX: 160, pointerId: 1, pointerType: 'touch' });
      expect(onRescheduleTask).not.toHaveBeenCalled();

      // 2. Stationary touch hold (>= 260ms) arms drag and reschedules cleanly within parent bounds
      fireEvent.pointerDown(ciBar, {
        clientX: 180,
        clientY: 50,
        button: 0,
        pointerId: 2,
        pointerType: 'touch',
        isPrimary: true,
      });
      act(() => {
        vi.advanceTimersByTime(280);
      });
      fireEvent.pointerMove(window, {
        clientX: 100,
        clientY: 50,
        pointerId: 2,
        pointerType: 'touch',
      });
      fireEvent.pointerUp(window, { clientX: 100, pointerId: 2, pointerType: 'touch' });

      expect(onRescheduleTask).toHaveBeenCalledWith(3, '2026-01-09', '2026-01-18', true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('provides a compact mobile Tools popover for Critical Path, Baseline, and Auto-Cascade on narrow screens', async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 767px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    try {
      const user = userEvent.setup();
      render(
        <GanttWorkspace
          tasks={tasksFixture}
          selectedTaskId={null}
          onSelectTask={vi.fn()}
          onTaskActivate={vi.fn()}
          onRescheduleTask={vi.fn()}
          baseline={{
            savedAt: '2026-01-01T00:00:00Z',
            entries: {
              3: { start: '2026-01-11', end: '2026-01-18' },
            },
          }}
          onSaveBaseline={vi.fn()}
          onClearBaseline={vi.fn()}
          mobileView="chart"
        />,
      );

      // Open mobile Tools popover
      await user.click(screen.getByRole('button', { name: /timeline view tools/i }));
      expect(screen.getByRole('dialog', { name: /timeline view tools/i })).toBeInTheDocument();

      // Toggle Critical Path and Baseline Ghost Bars from the mobile popover
      await user.click(screen.getByRole('switch', { name: /highlight critical path/i }));
      expect(screen.getByRole('button', { name: /CI Pipeline:/i })).toHaveAttribute(
        'data-critical',
        'true',
      );

      await user.click(screen.getByRole('switch', { name: /show baseline ghost bars/i }));
      expect(screen.getByTestId('baseline-ghost-3')).toBeInTheDocument();

      // Auto-Cascade toggle is accessible on mobile too
      const cascadeSwitch = screen.getByRole('switch', {
        name: /disable auto-cascade dependent tasks/i,
      });
      expect(cascadeSwitch).toHaveAttribute('aria-checked', 'true');
      await user.click(cascadeSwitch);
      expect(
        screen.getByRole('switch', { name: /enable auto-cascade dependent tasks/i }),
      ).toHaveAttribute('aria-checked', 'false');
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: originalMatchMedia,
      });
    }
  });

  it('displays both task duration and due countdown in the timeline hover tooltip for incomplete tasks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 18, 12, 0, 0)); // Jan 18, 2026
    try {
      render(
        <GanttWorkspace
          tasks={tasksFixture}
          selectedTaskId={null}
          onSelectTask={vi.fn()}
          onTaskActivate={vi.fn()}
          readOnly
        />,
      );

      // CI Pipeline is Jan 11 - Jan 20 (10 days), 0% complete -> 2d left on Jan 18
      const ciBar = screen.getByRole('button', { name: /CI Pipeline:/i });
      fireEvent.pointerEnter(ciBar, { pointerType: 'mouse' });

      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent('10 days');
      expect(tooltip).toHaveTextContent('2d left');

      // Completed Setup Repository (100%) should not show a countdown badge
      const setupBar = screen.getByRole('button', { name: /Setup Repository:/i });
      fireEvent.pointerEnter(setupBar, { pointerType: 'mouse' });
      expect(screen.getByRole('tooltip')).not.toHaveTextContent(/left|overdue|Due today/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps timeline bar progress fills mounted and updates scaleX smoothly when progress increases or decreases', () => {
    const { rerender } = render(
      <GanttWorkspace
        tasks={tasksFixture}
        selectedTaskId={null}
        onSelectTask={vi.fn()}
        onTaskActivate={vi.fn()}
        readOnly
      />,
    );

    const phaseFill = screen.getByTestId('task-progress-fill-1');
    const doneFill = screen.getByTestId('task-progress-fill-2');
    const zeroFill = screen.getByTestId('task-progress-fill-3');

    // Initial states: 50% visible, 100% and 0% mounted at scaleX(1)/scaleX(0) with opacity 0
    expect(phaseFill).toHaveStyle({ transform: 'scaleX(0.5)', opacity: '1' });
    expect(doneFill).toHaveStyle({ transform: 'scaleX(1)', opacity: '0' });
    expect(zeroFill).toHaveStyle({ transform: 'scaleX(0)', opacity: '0' });
    expect(phaseFill.className).toContain('motion-reduce:transition-none');

    // Increase CI Pipeline 0% -> 70% and decrease Phase 1 50% -> 35%
    const updatedTasks: Task[] = tasksFixture.map((task) =>
      task.id === 1
        ? {
          ...task,
          progress: 35,
          children: task.children?.map((child) =>
            child.id === 3 ? { ...child, progress: 70 } : child,
          ),
        }
        : task,
    );

    rerender(
      <GanttWorkspace
        tasks={updatedTasks}
        selectedTaskId={null}
        onSelectTask={vi.fn()}
        onTaskActivate={vi.fn()}
        readOnly
      />,
    );

    expect(screen.getByTestId('task-progress-fill-1')).toHaveStyle({
      transform: 'scaleX(0.35)',
      opacity: '1',
    });
    expect(screen.getByTestId('task-progress-fill-3')).toHaveStyle({
      transform: 'scaleX(0.7)',
      opacity: '1',
    });
  });

  it('respects display preferences for hover tooltips, progress percentages, and today marker', () => {
    usePreferencesStore.setState({
      ...DEFAULT_PREFERENCES,
      showBarTooltips: false,
      showProgressPercentages: false,
      showTodayLine: false,
    });

    render(
      <GanttWorkspace
        tasks={tasksFixture}
        selectedTaskId={null}
        onSelectTask={vi.fn()}
        onTaskActivate={vi.fn()}
      />,
    );

    // Progress % badges on task bars & tree rows are hidden (only the toolbar overall meter remains)
    const phaseBar = screen.getByRole('button', { name: /Phase 1: Foundation:/i });
    expect(phaseBar).not.toHaveTextContent('50%');
    expect(screen.getAllByText('50%')).toHaveLength(1);

    // Hovering a bar does not show the floating tooltip when disabled
    const ciBar = screen.getByRole('button', { name: /CI Pipeline:/i });
    fireEvent.pointerEnter(ciBar, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
