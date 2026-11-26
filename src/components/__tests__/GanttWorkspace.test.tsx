import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GanttWorkspace } from '@/components/gantt/GanttWorkspace';
import type { Task } from '@/types';

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
});
