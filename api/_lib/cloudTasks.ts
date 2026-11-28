import {
  isDeferredBeyondCloudTaskWindow,
  isWithinCloudTaskWindow,
} from '../../src/domain/agenda.js';
import { getGoogleAccessToken } from './googleAuth.js';

const CLOUD_TASKS_SCOPE = 'https://www.googleapis.com/auth/cloud-tasks';
const CLOUD_TASKS_API_BASE = 'https://cloudtasks.googleapis.com/v2';
const CLOUD_TASKS_TIMEOUT_MS = 8_000;

const SAFE_LOCATION_PATTERN = /^[a-z0-9-]+$/;
const SAFE_QUEUE_PATTERN = /^[a-zA-Z0-9-]+$/;
const SAFE_TASK_NAME_PATTERN =
  /^projects\/[a-z0-9-]+\/locations\/[a-z0-9-]+\/queues\/[a-zA-Z0-9-]+\/tasks\/[a-zA-Z0-9_-]+$/;

export interface CloudTasksConfig {
  location: string;
  queue: string;
  cronSecret: string;
}

export function getCloudTasksConfig(): CloudTasksConfig | null {
  const location = process.env.CLOUD_TASKS_LOCATION?.trim() || '';
  const queue = process.env.CLOUD_TASKS_QUEUE?.trim() || 'sked-reminders';
  const cronSecret = process.env.CRON_SECRET?.trim() || '';

  if (
    !location ||
    !cronSecret ||
    !SAFE_LOCATION_PATTERN.test(location) ||
    !SAFE_QUEUE_PATTERN.test(queue)
  ) {
    return null;
  }

  return { location, queue, cronSecret };
}

export type ScheduleCloudTaskResult =
  | { ok: true; status: 'scheduled'; taskName: string }
  | { ok: true; status: 'deferred'; taskName: null }
  | { ok: true; status: 'past'; taskName: null }
  | { ok: false; status: 'unconfigured' | 'error'; taskName: null; reason: string };

/**
 * Creates a single one-shot Google Cloud Task targeting `POST {baseUrl}/api/agenda/deliver`
 * at the exact UTC instant `reminderTargetISO`. Uses zero polling and reuses the existing
 * Firebase Admin service account credentials (zero extra npm dependencies).
 */
export async function scheduleAgendaCloudTask(params: {
  uid: string;
  itemId: string;
  reminderTargetISO: string;
  baseUrl: string;
}): Promise<ScheduleCloudTaskResult> {
  const config = getCloudTasksConfig();
  if (!config || !params.baseUrl || !params.baseUrl.startsWith('https://')) {
    return {
      ok: false,
      status: 'unconfigured',
      taskName: null,
      reason: 'Google Cloud Tasks is not configured (set CLOUD_TASKS_LOCATION, CRON_SECRET, and APP_BASE_URL).',
    };
  }

  const nowMs = Date.now();
  const targetMs = Date.parse(params.reminderTargetISO);
  if (Number.isNaN(targetMs) || targetMs <= nowMs - 60_000) {
    return { ok: true, status: 'past', taskName: null };
  }

  if (isDeferredBeyondCloudTaskWindow(params.reminderTargetISO, nowMs)) {
    return { ok: true, status: 'deferred', taskName: null };
  }

  if (!isWithinCloudTaskWindow(params.reminderTargetISO, nowMs)) {
    return { ok: true, status: 'past', taskName: null };
  }

  try {
    const { accessToken, projectId } = await getGoogleAccessToken(CLOUD_TASKS_SCOPE);
    const parent = `projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(config.location)}/queues/${encodeURIComponent(config.queue)}`;
    const scheduleTime = new Date(Math.max(targetMs, nowMs + 5_000)).toISOString();

    const bodyJson = JSON.stringify({
      uid: params.uid,
      itemId: params.itemId,
      reminderTargetISO: params.reminderTargetISO,
    });

    const resp = await fetch(`${CLOUD_TASKS_API_BASE}/${parent}/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task: {
          scheduleTime,
          httpRequest: {
            httpMethod: 'POST',
            url: `${params.baseUrl}/api/agenda/deliver`,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.cronSecret}`,
            },
            body: Buffer.from(bodyJson, 'utf8').toString('base64'),
          },
        },
      }),
      signal: AbortSignal.timeout(CLOUD_TASKS_TIMEOUT_MS),
    });

    const data = (await resp.json().catch(() => ({}))) as {
      name?: string;
      error?: { message?: string; status?: string };
    };

    if (!resp.ok || !data.name) {
      console.error('Cloud Tasks create failed:', resp.status, data.error?.message || data);
      return {
        ok: false,
        status: 'error',
        taskName: null,
        reason:
          resp.status === 403
            ? 'Cloud Tasks permission denied (grant the service account the "Cloud Tasks Enqueuer" role).'
            : resp.status === 404
              ? `Cloud Tasks queue "${config.queue}" was not found in "${config.location}".`
              : 'Could not schedule Google Cloud Task.',
      };
    }

    return { ok: true, status: 'scheduled', taskName: data.name };
  } catch (err) {
    console.error('Cloud Tasks schedule exception:', err);
    return {
      ok: false,
      status: 'error',
      taskName: null,
      reason: 'Unable to reach Google Cloud Tasks API.',
    };
  }
}

/**
 * Cancels a pending Google Cloud Task cleanly (treats 404 Already Fired/Deleted as success).
 */
export async function cancelAgendaCloudTask(taskName: string | null | undefined): Promise<boolean> {
  if (!taskName || !SAFE_TASK_NAME_PATTERN.test(taskName)) return true;

  try {
    const { accessToken, projectId } = await getGoogleAccessToken(CLOUD_TASKS_SCOPE);
    if (!taskName.startsWith(`projects/${projectId}/`)) {
      return false;
    }

    const resp = await fetch(`${CLOUD_TASKS_API_BASE}/${taskName}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(CLOUD_TASKS_TIMEOUT_MS),
    });

    return resp.ok || resp.status === 404;
  } catch (err) {
    console.warn('Cloud Tasks cancel skipped:', err);
    return false;
  }
}
