import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
