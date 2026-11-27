import type { SharedChartViewPrefs } from './preferences';
import type { Task } from './task';

export type WorkspaceViewMode = 'timeline' | 'board' | 'list';

export interface TaskBaselineEntry {
  start: string;
  end: string;
}

export interface WorkspaceBaseline {
  savedAt: string;
  entries: Record<number, TaskBaselineEntry>;
}

export interface ChartEditorAttribution {
  uid: string;
  name: string;
  email?: string;
  at: string;
}

export interface Workspace {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  shareId?: string | null;
  isShared?: boolean;
  sharedAt?: string | null;
  editorEmails?: string[];
  baseline?: WorkspaceBaseline | null;
}

export type WorkspaceMap = Record<string, Workspace>;

export interface SharedChart {
  shareId: string;
  ownerId: string;
  ownerName: string;
  workspaceId: string;
  title: string;
  tasks: Task[];
  nextId?: number;
  version?: number;
  editorEmails?: string[];
  lastEditedBy?: ChartEditorAttribution | null;
  preferences: SharedChartViewPrefs;
  baseline?: WorkspaceBaseline | null;
  createdAt: string;
  updatedAt: string;
}
