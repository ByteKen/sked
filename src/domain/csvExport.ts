import {
  computeCriticalPath,
  computeTaskBaselineSlipDays,
  getInclusiveDurationDays,
} from '@/domain/scheduling';
import { flattenTasks, getTaskStatus, isTaskDeadline } from '@/domain/taskTree';
import { TASK_STATUS_LABELS } from '@/domain/taskViews';
import type { Task, WorkspaceBaseline } from '@/types';

export interface BuildCsvOptions {
  baseline?: WorkspaceBaseline | null;
}

const FORMULA_TRIGGER_RE = /^[=+\-@\t\r]/;

function escapeCsvTextCell(raw: string): string {
  // Guard text cells against Excel/Sheets formula execution or #NAME? errors (e.g., "- bullet item")
  const safe = FORMULA_TRIGGER_RE.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function escapeCsvNumberCell(value: number | ''): string {
  return value === '' ? '' : String(value);
}

/**
 * Generates clean, Excel-safe WBS outline labels (#1, #1.1, #1.2, #2, #2.1.1)
 * using a `#` prefix so Excel never coerces `1.10` into `1.1` or `1-2` into a date.
 */
function buildWbsMap(tasks: readonly Task[], prefix = ''): Map<number, string> {
  const map = new Map<number, string>();
  tasks.forEach((task, index) => {
    const code = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
    map.set(task.id, `#${code}`);
    if (task.children && task.children.length > 0) {
      const childMap = buildWbsMap(task.children, code);
      childMap.forEach((val, key) => map.set(key, val));
    }
  });
  return map;
}

/**
 * Builds a clean RFC 4180 CSV table (Row 1 = headers, CRLF line endings) optimized for
 * Microsoft Excel, Google Sheets, Apple Numbers, and LibreOffice Calc.
 */
export function buildTasksCsvContent(
  tasks: readonly Task[],
  options: BuildCsvOptions = {},
): string {
  const baseline = options.baseline ?? null;
  const hasBaseline = Boolean(baseline && Object.keys(baseline.entries).length > 0);

  const flat = flattenTasks(tasks);
  const byId = new Map(flat.map((t) => [t.id, t]));
  const wbsMap = buildWbsMap(tasks);
  const criticalPath = computeCriticalPath(tasks);

  const resolveRootPhaseName = (taskId: number): string => {
    let curr = byId.get(taskId);
    const seen = new Set<number>();
    while (curr && curr.parentId !== null && curr.parentId !== undefined) {
      if (seen.has(curr.id)) break;
      seen.add(curr.id);
      const parent = byId.get(curr.parentId);
      if (!parent) break;
      curr = parent;
    }
    return curr?.name ?? '';
  };

  const headers = [
    'WBS',
    'Type',
    'Phase',
    'Parent Task',
    'Task Name',
    'Status',
    'Start Date',
    'End Date',
    'Duration (Days)',
    'Progress (%)',
    'Critical Path',
    'Depends On',
    ...(hasBaseline ? ['Baseline Start', 'Baseline End', 'Schedule Slip (Days)'] : []),
    'Description',
  ];

  const lines: string[] = [headers.map(escapeCsvTextCell).join(',')];

  for (const task of flat) {
    const status = getTaskStatus(task);
    const deadline = isTaskDeadline(task);
    const typeLabel = task.hasChildren
      ? 'Phase'
      : deadline
        ? 'Milestone'
        : task.isSubtask
          ? 'Subtask'
          : 'Task';

    const parentName =
      task.parentId !== null && task.parentId !== undefined
        ? (byId.get(task.parentId)?.name ?? '')
        : '';
    const phaseName = resolveRootPhaseName(task.id);
    const durationDays = getInclusiveDurationDays(task.start, task.end);
    const isCritical = criticalPath.criticalTaskIds.has(task.id);

    const resolvedDeps = (task.dependencies ?? [])
      .map((depId) => {
        const dep = byId.get(depId);
        if (!dep) return null;
        const wbs = wbsMap.get(dep.id);
        return wbs ? `${wbs} ${dep.name}` : dep.name;
      })
      .filter((label): label is string => Boolean(label))
      .join('; ');

    const baselineEntry = hasBaseline ? baseline?.entries[task.id] : undefined;
    const slipDays = hasBaseline ? computeTaskBaselineSlipDays(task, baseline) : null;

    const row: string[] = [
      escapeCsvTextCell(wbsMap.get(task.id) ?? `#${task.id}`),
      escapeCsvTextCell(typeLabel),
      escapeCsvTextCell(phaseName),
      escapeCsvTextCell(parentName),
      escapeCsvTextCell(task.name),
      escapeCsvTextCell(TASK_STATUS_LABELS[status]),
      escapeCsvTextCell(task.start),
      escapeCsvTextCell(task.end),
      escapeCsvNumberCell(durationDays),
      escapeCsvNumberCell(task.progress ?? 0),
      escapeCsvTextCell(isCritical ? 'Yes' : 'No'),
      escapeCsvTextCell(resolvedDeps),
      ...(hasBaseline
        ? [
            escapeCsvTextCell(baselineEntry?.start ?? ''),
            escapeCsvTextCell(baselineEntry?.end ?? ''),
            escapeCsvNumberCell(slipDays ?? ''),
          ]
        : []),
      escapeCsvTextCell(task.description ?? ''),
    ];

    lines.push(row.join(','));
  }

  return lines.join('\r\n');
}
