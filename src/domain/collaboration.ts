import type { AuthUser, SharedChart, Task, Workspace } from '@/types';

export const MAX_EDITORS_PER_WORKSPACE = 20;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizeEditorEmails(emails: readonly string[] | undefined | null): string[] {
  if (!Array.isArray(emails)) return [];
  const unique = new Set<string>();
  for (const raw of emails) {
    if (typeof raw !== 'string') continue;
    const normalized = normalizeEmail(raw);
    if (normalized && EMAIL_PATTERN.test(normalized)) {
      unique.add(normalized);
      if (unique.size >= MAX_EDITORS_PER_WORKSPACE) break;
    }
  }
  return Array.from(unique);
}

export type EditorEmailValidationResult =
  | { valid: true; email: string }
  | { valid: false; error: string };

/**
 * Pure validator for inviting a collaborator by Google email.
 */
export function validateEditorEmailInput(
  rawEmail: string,
  existingEditors: readonly string[],
  ownerEmail?: string | null,
): EditorEmailValidationResult {
  const email = normalizeEmail(rawEmail);
  if (!email) {
    return { valid: false, error: 'Enter a Google email address.' };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { valid: false, error: 'Enter a valid email address (e.g., alex@gmail.com).' };
  }
  if (ownerEmail && normalizeEmail(ownerEmail) === email) {
    return { valid: false, error: 'You are already the owner of this workspace.' };
  }
  const existingNormalized = new Set(existingEditors.map(normalizeEmail));
  if (existingNormalized.has(email)) {
    return { valid: false, error: 'This person is already invited as an editor.' };
  }
  if (existingNormalized.size >= MAX_EDITORS_PER_WORKSPACE) {
    return {
      valid: false,
      error: `Up to ${MAX_EDITORS_PER_WORKSPACE} editors can be invited per workspace.`,
    };
  }
  return { valid: true, email };
}

/**
 * Determines whether the currently signed-in user has edit permission on a shared chart.
 * Anonymous viewers and non-invited users always stay strictly read-only.
 */
export function canUserEditSharedChart(
  chart: Pick<SharedChart, 'ownerId' | 'editorEmails'> | null | undefined,
  user: Pick<AuthUser, 'id' | 'email'> | null | undefined,
): boolean {
  if (!chart || !user) return false;
  if (user.id && chart.ownerId && user.id === chart.ownerId) return true;
  if (!user.email) return false;
  const userEmail = normalizeEmail(user.email);
  const editors = normalizeEditorEmails(chart.editorEmails);
  return editors.includes(userEmail);
}

export function isCollaborativeWorkspace(
  workspace: Pick<Workspace, 'isShared' | 'shareId' | 'editorEmails'> | null | undefined,
): boolean {
  return Boolean(
    workspace?.isShared && workspace.shareId && normalizeEditorEmails(workspace.editorEmails).length > 0,
  );
}

/**
 * Fast structural fingerprint check to avoid redundant Firestore writes on no-op edits.
 */
export function haveTasksChanged(prev: readonly Task[], next: readonly Task[]): boolean {
  if (prev === next) return false;
  if (prev.length !== next.length) return true;
  return JSON.stringify(prev) !== JSON.stringify(next);
}
