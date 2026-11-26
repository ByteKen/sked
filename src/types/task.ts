export type TaskStatus = 'completed' | 'working' | 'in-progress' | 'not-started';

export interface Task {
  id: number;
  name: string;
  description?: string;
  start: string;
  end: string;
  progress: number;
  isMilestone?: boolean;
  isDeadline?: boolean;
  isDone?: boolean;
  isWorking?: boolean;
  parentId?: number | null;
  dependencies?: number[];
  children?: Task[];
  collapsed?: boolean;
}

export interface FlatTask extends Task {
  level: number;
  hasChildren: boolean;
  isSubtask: boolean;
}

export interface TaskDraft {
  name: string;
  description?: string;
  start: string;
  end: string;
  progress: number;
  isMilestone?: boolean;
  isDeadline?: boolean;
  isDone?: boolean;
  isWorking?: boolean;
  dependencies?: number[];
}

export interface ImportTaskInput {
  id?: string | number;
  name: string;
  description?: string;
  start: string;
  end: string;
  progress?: number;
  isMilestone?: boolean;
  isDeadline?: boolean;
  dependencies?: Array<string | number>;
  children?: ImportTaskInput[];
}

export interface TaskStats {
  total: number;
  completed: number;
  working: number;
  inProgress: number;
  notStarted: number;
  completionPercent: number;
}
