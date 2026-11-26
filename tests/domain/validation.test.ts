import { describe, expect, it } from 'vitest';
import {
  isValidISODate,
  validateImportJson,
  validateTaskDraft,
  validateWorkspaceName,
} from '@/domain/validation';
import type { Task, Workspace } from '@/types';

describe('validation domain logic', () => {
  it('validates workspace names including duplicate exclusion', () => {
    const existing: Workspace[] = [
      { id: 'w1', title: 'Product Roadmap', createdAt: '', updatedAt: '' },
    ];

    expect(validateWorkspaceName('', existing)).toBeTruthy();
    expect(validateWorkspaceName('A', existing)).toBeTruthy();
    expect(validateWorkspaceName('product roadmap', existing)).toContain('already exists');
    expect(validateWorkspaceName('product roadmap', existing, 'w1')).toBeNull();
    expect(validateWorkspaceName('Q4 Launch', existing)).toBeNull();
  });

  it('rejects impossible calendar dates like Feb 30', () => {
    expect(isValidISODate('2026-02-28')).toBe(true);
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('01-01-2026')).toBe(false);
  });

  it('validates task ranges and enforces subtask boundaries inside parent dates', () => {
    const parent: Task = {
      id: 1,
      name: 'Parent',
      start: '2026-02-01',
      end: '2026-02-20',
      progress: 0,
    };

    const badRange = validateTaskDraft(
      { name: 'Task A', start: '2026-02-15', end: '2026-02-10' },
      { isDeadlineOnly: false },
    );
    expect(badRange.valid).toBe(false);

    const outOfParent = validateTaskDraft(
      { name: 'Subtask', start: '2026-01-28', end: '2026-02-10' },
      { isDeadlineOnly: false, parentTask: parent },
    );
    expect(outOfParent.valid).toBe(false);

    const validSubtask = validateTaskDraft(
      { name: 'Subtask', start: '2026-02-05', end: '2026-02-15' },
      { isDeadlineOnly: false, parentTask: parent },
    );
    expect(validSubtask.valid).toBe(true);
  });

  it('validates JSON import syntax, structure, and nested fields', () => {
    expect(validateImportJson('{bad json').errors[0]?.type).toBe('syntax');
    expect(validateImportJson('{}').errors[0]?.type).toBe('structure');
    expect(validateImportJson('{"tasks":[]}').errors[0]?.type).toBe('structure');

    const nestedInvalid = validateImportJson(
      JSON.stringify({
        tasks: [
          {
            name: 'Phase 1',
            start: '2026-01-01',
            end: '2026-01-10',
            children: [{ name: 'X', start: '2026-01-01', end: '2026-01-02' }],
          },
        ],
      }),
    );
    expect(nestedInvalid.errors.length).toBeGreaterThan(0);
    expect(nestedInvalid.errors[0]?.path).toBe('tasks[0].children[0]');

    const ok = validateImportJson(
      JSON.stringify({
        tasks: [{ name: 'Phase 1', start: '2026-01-01', end: '2026-01-10', progress: 40 }],
      }),
    );
    expect(ok.errors).toEqual([]);
    expect(ok.tasks).toHaveLength(1);
  });
});
