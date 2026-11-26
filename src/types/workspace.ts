import type { SharedChartViewPrefs } from './preferences';
import type { Task } from './task';

export interface Workspace {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  shareId?: string | null;
  isShared?: boolean;
  sharedAt?: string | null;
}

export type WorkspaceMap = Record<string, Workspace>;

export interface SharedChart {
  shareId: string;
  ownerId: string;
  ownerName: string;
  workspaceId: string;
  title: string;
  tasks: Task[];
  preferences: SharedChartViewPrefs;
  createdAt: string;
  updatedAt: string;
}
