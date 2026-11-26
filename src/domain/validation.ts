import type { ImportTaskInput, Task, TaskDraft, Workspace } from '@/types';
import { formatFullDate, parseISODate } from './timeline';

export interface FieldValidationResult {
  valid: boolean;
  error?: string;
  description?: string;
}

export interface ImportValidationError {
  type: 'syntax' | 'structure' | 'validation';
  message: string;
  path?: string;
  field?: string;
  line?: number | null;
}

export function validateWorkspaceName(
  rawName: string,
  existingWorkspaces: readonly Workspace[],
  excludeId?: string | null,
): string | null {
  const trimmed = rawName.trim();
  if (!trimmed) return 'Please enter a workspace name';
  if (trimmed.length < 2) return 'Name must be at least 2 characters';
  if (trimmed.length > 50) return 'Name must be less than 50 characters';

  const duplicate = existingWorkspaces.some(
    (ws) => ws.id !== excludeId && ws.title.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (duplicate) return 'A workspace with this name already exists';

  return null;
}

export function isValidISODate(dateStr: unknown): dateStr is string {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function validateTaskDraft(
  draft: Pick<TaskDraft, 'name' | 'description' | 'start' | 'end'>,
  options: { isDeadlineOnly: boolean; parentTask?: Task | null },
): FieldValidationResult {
  const trimmedName = draft.name.trim();
  if (!trimmedName) {
    return {
      valid: false,
      error: 'Task name is required',
      description: 'Please enter a clear name for this task.',
    };
  }
  if (trimmedName.length < 2) {
    return {
      valid: false,
      error: 'Task name is too short',
      description: 'Task name must be at least 2 characters.',
    };
  }
  if (trimmedName.length > 100) {
    return {
      valid: false,
      error: 'Task name is too long',
      description: 'Task name must be 100 characters or fewer.',
    };
  }
  if (draft.description && draft.description.trim().length > 2000) {
    return {
      valid: false,
      error: 'Description is too long',
      description: 'Task description must be 2,000 characters or fewer.',
    };
  }

  const effectiveStart = options.isDeadlineOnly ? draft.end : draft.start;
  const effectiveEnd = draft.end;

  if (options.isDeadlineOnly) {
    if (!effectiveEnd) {
      return {
        valid: false,
        error: 'Deadline date required',
        description: 'Select a target deadline date for this milestone.',
      };
    }
  } else {
    if (!effectiveStart) {
      return {
        valid: false,
        error: 'Start date required',
        description: 'Select when this task begins.',
      };
    }
    if (!effectiveEnd) {
      return {
        valid: false,
        error: 'End date required',
        description: 'Select when this task finishes.',
      };
    }
    if (parseISODate(effectiveEnd) < parseISODate(effectiveStart)) {
      return {
        valid: false,
        error: 'Invalid date range',
        description: 'The end date cannot be before the start date.',
      };
    }
  }

  if (options.parentTask) {
    const taskStart = parseISODate(effectiveStart);
    const taskEnd = parseISODate(effectiveEnd);
    const parentStart = parseISODate(options.parentTask.start);
    const parentEnd = parseISODate(options.parentTask.end);

    if (taskStart < parentStart) {
      return {
        valid: false,
        error: 'Start date outside parent range',
        description: `Subtask cannot start before parent (${formatFullDate(options.parentTask.start)}).`,
      };
    }
    if (taskEnd > parentEnd) {
      return {
        valid: false,
        error: 'End date exceeds parent range',
        description: `Subtask must end on or before ${formatFullDate(options.parentTask.end)}.`,
      };
    }
  }

  return { valid: true };
}

function extractSyntaxErrorLine(input: string, message: string): number | null {
  const match = /position (\d+)/.exec(message);
  if (!match?.[1]) return null;
  const position = Number(match[1]);
  return input.slice(0, position).split('\n').length;
}

function validateImportTaskNode(node: unknown, path: string): ImportValidationError[] {
  const errors: ImportValidationError[] = [];
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    errors.push({ type: 'validation', path, message: 'Task entry must be an object' });
    return errors;
  }

  const record = node as Record<string, unknown>;

  if (typeof record.name !== 'string' || !record.name.trim()) {
    errors.push({
      type: 'validation',
      path,
      field: 'name',
      message: 'Task name is required and must be a string',
    });
  } else if (record.name.trim().length < 2 || record.name.trim().length > 100) {
    errors.push({
      type: 'validation',
      path,
      field: 'name',
      message: 'Task name must be 2–100 characters',
    });
  }

  if (record.description !== undefined) {
    if (typeof record.description !== 'string') {
      errors.push({
        type: 'validation',
        path,
        field: 'description',
        message: 'Description must be a string',
      });
    } else if (record.description.trim().length > 2000) {
      errors.push({
        type: 'validation',
        path,
        field: 'description',
        message: 'Description must be 2,000 characters or fewer',
      });
    }
  }

  if (!record.start) {
    errors.push({ type: 'validation', path, field: 'start', message: 'Start date is required' });
  } else if (!isValidISODate(record.start)) {
    errors.push({
      type: 'validation',
      path,
      field: 'start',
      message: 'Invalid start date format. Use YYYY-MM-DD',
    });
  }

  if (!record.end) {
    errors.push({ type: 'validation', path, field: 'end', message: 'End date is required' });
  } else if (!isValidISODate(record.end)) {
    errors.push({
      type: 'validation',
      path,
      field: 'end',
      message: 'Invalid end date format. Use YYYY-MM-DD',
    });
  }

  if (isValidISODate(record.start) && isValidISODate(record.end)) {
    if (parseISODate(record.end) < parseISODate(record.start) && !record.isDeadline) {
      errors.push({
        type: 'validation',
        path,
        field: 'end',
        message: 'End date cannot be before start date',
      });
    }
  }

  if (record.progress !== undefined) {
    if (typeof record.progress !== 'number' || record.progress < 0 || record.progress > 100) {
      errors.push({
        type: 'validation',
        path,
        field: 'progress',
        message: 'Progress must be a number between 0 and 100',
      });
    }
  }

  if (record.dependencies !== undefined && !Array.isArray(record.dependencies)) {
    errors.push({
      type: 'validation',
      path,
      field: 'dependencies',
      message: 'Dependencies must be an array',
    });
  }

  if (record.children !== undefined) {
    if (!Array.isArray(record.children)) {
      errors.push({
        type: 'validation',
        path,
        field: 'children',
        message: 'Children must be an array',
      });
    } else {
      record.children.forEach((child, index) => {
        errors.push(...validateImportTaskNode(child, `${path}.children[${index}]`));
      });
    }
  }

  return errors;
}

export function validateImportJson(rawInput: string): {
  errors: ImportValidationError[];
  tasks: ImportTaskInput[] | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawInput);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON';
    return {
      errors: [
        {
          type: 'syntax',
          message: `JSON syntax error: ${message}`,
          line: extractSyntaxErrorLine(rawInput, message),
        },
      ],
      tasks: null,
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      errors: [{ type: 'structure', message: 'Root value must be a JSON object with a "tasks" array' }],
      tasks: null,
    };
  }

  const root = parsed as Record<string, unknown>;
  if (!root.tasks) {
    return {
      errors: [{ type: 'structure', message: 'Missing required "tasks" array at root level' }],
      tasks: null,
    };
  }

  if (!Array.isArray(root.tasks)) {
    return {
      errors: [{ type: 'structure', message: '"tasks" must be an array' }],
      tasks: null,
    };
  }

  if (root.tasks.length === 0) {
    return {
      errors: [{ type: 'structure', message: '"tasks" array cannot be empty' }],
      tasks: null,
    };
  }

  const errors: ImportValidationError[] = [];
  root.tasks.forEach((task, index) => {
    errors.push(...validateImportTaskNode(task, `tasks[${index}]`));
  });

  if (errors.length > 0) {
    return { errors, tasks: null };
  }

  return {
    errors: [],
    tasks: root.tasks as ImportTaskInput[],
  };
}
