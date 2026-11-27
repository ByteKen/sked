import { describe, expect, it } from 'vitest';
import {
  canUserEditSharedChart,
  haveTasksChanged,
  isCollaborativeWorkspace,
  MAX_EDITORS_PER_WORKSPACE,
  normalizeEditorEmails,
  validateEditorEmailInput,
} from '@/domain/collaboration';
import type { Task } from '@/types';

describe('collaboration pure domain policy', () => {
  it('validates collaborator email invites and enforces owner/duplicate/max-limit rules', () => {
    expect(validateEditorEmailInput('', [], 'owner@gmail.com')).toEqual({
      valid: false,
      error: 'Enter a Google email address.',
    });

    expect(validateEditorEmailInput('not-an-email', [], 'owner@gmail.com')).toEqual({
      valid: false,
      error: 'Enter a valid email address (e.g., alex@gmail.com).',
    });

    expect(validateEditorEmailInput('OWNER@gmail.com', [], 'owner@gmail.com')).toEqual({
      valid: false,
      error: 'You are already the owner of this workspace.',
    });

    expect(validateEditorEmailInput('maya@gmail.com', ['maya@gmail.com'], 'owner@gmail.com')).toEqual({
      valid: false,
      error: 'This person is already invited as an editor.',
    });

    const maxList = Array.from({ length: MAX_EDITORS_PER_WORKSPACE }, (_, i) => `u${i}@gmail.com`);
    expect(validateEditorEmailInput('extra@gmail.com', maxList, 'owner@gmail.com')).toEqual({
      valid: false,
      error: `Up to ${MAX_EDITORS_PER_WORKSPACE} editors can be invited per workspace.`,
    });

    expect(validateEditorEmailInput('  Maya@Example.COM  ', [], 'owner@gmail.com')).toEqual({
      valid: true,
      email: 'maya@example.com',
    });
  });

  it('normalizes, deduplicates, and caps editor email lists cleanly', () => {
    expect(
      normalizeEditorEmails([' Alice@Gmail.com ', 'alice@gmail.com', 'invalid', 'bob@co.io']),
    ).toEqual(['alice@gmail.com', 'bob@co.io']);
  });

  it('authorizes owners and invited emails case-insensitively while keeping anonymous & non-invited read-only', () => {
    const chart = {
      ownerId: 'owner-1',
      editorEmails: ['maya@gmail.com'],
    };

    expect(canUserEditSharedChart(chart, null)).toBe(false);
    expect(canUserEditSharedChart(chart, { id: 'stranger', email: 'other@gmail.com' })).toBe(false);
    expect(canUserEditSharedChart(chart, { id: 'owner-1', email: 'owner@gmail.com' })).toBe(true);
    expect(canUserEditSharedChart(chart, { id: 'editor-2', email: 'MAYA@gmail.com' })).toBe(true);
  });

  it('identifies collaborative workspaces and detects structural task changes to skip no-op writes', () => {
    expect(
      isCollaborativeWorkspace({ isShared: true, shareId: 'abc', editorEmails: ['a@b.com'] }),
    ).toBe(true);
    expect(isCollaborativeWorkspace({ isShared: true, shareId: 'abc', editorEmails: [] })).toBe(
      false,
    );
    expect(
      isCollaborativeWorkspace({ isShared: false, shareId: null, editorEmails: ['a@b.com'] }),
    ).toBe(false);

    const a: Task[] = [{ id: 1, name: 'Build', start: '2026-01-01', end: '2026-01-05', progress: 20 }];
    const same: Task[] = [{ id: 1, name: 'Build', start: '2026-01-01', end: '2026-01-05', progress: 20 }];
    const diff: Task[] = [{ id: 1, name: 'Build', start: '2026-01-01', end: '2026-01-05', progress: 40 }];

    expect(haveTasksChanged(a, a)).toBe(false);
    expect(haveTasksChanged(a, same)).toBe(false);
    expect(haveTasksChanged(a, diff)).toBe(true);
  });
});
