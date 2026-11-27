import type { VercelRequest } from '@vercel/node';
import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { sanitizeSafeAppUrl } from '../../src/domain/reminders.js';
import {
  recalculateBotTreeProgress,
  type TelegramWorkspaceBundle,
} from '../../src/domain/telegramBot.js';
import type { Task } from '../../src/types/task.js';

export interface VerifiedUser {
  uid: string;
  email: string;
  name: string;
}

export interface StoredTelegramSubscription {
  uid: string;
  chatId: string;
  username: string | null;
  firstName: string | null;
  enabled: boolean;
  timezone: string;
  reminderHour: number;
  reminderOffsets: number[];
  includeOverdue: boolean;
  linkedAt: string;
  updatedAt: string;
  lastTestSentAtMs?: number;
  sentReminders?: Record<string, string>;
}

export interface ServiceAccountCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function parseServiceAccount(): ServiceAccountCredentials {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON environment variable.');
  }

  // Strip accidental surrounding single quotes if pasted with shell quotes
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length > 2) {
    raw = raw.slice(1, -1).trim();
  }

  let jsonText = raw;
  if (!raw.startsWith('{') && !raw.startsWith('"')) {
    jsonText = Buffer.from(raw, 'base64').toString('utf8');
  }

  let parsedUnknown: unknown = JSON.parse(jsonText);
  if (typeof parsedUnknown === 'string') {
    parsedUnknown = JSON.parse(parsedUnknown);
  }

  const parsed = (parsedUnknown ?? {}) as ServiceAccount & {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };

  const privateKey = (parsed.privateKey || parsed.private_key || '').replace(/\\n/g, '\n');
  const projectId = parsed.projectId || parsed.project_id;
  const clientEmail = parsed.clientEmail || parsed.client_email;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing project_id, client_email, or private_key.');
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

export function getServiceAccountCredentials(): ServiceAccountCredentials {
  return parseServiceAccount();
}

function ensureAdminApp() {
  const apps = getApps();
  if (apps.length > 0) {
    return apps[0]!;
  }
  return initializeApp({
    credential: cert(parseServiceAccount()),
  });
}

export function getAdminDb(): Firestore {
  return getFirestore(ensureAdminApp());
}

export function getAdminAuth(): Auth {
  return getAuth(ensureAdminApp());
}

export async function verifyFirebaseBearerToken(req: VercelRequest): Promise<VerifiedUser | null> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;

  const adminAuth = getAdminAuth();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email ?? '',
      name: (typeof decoded.name === 'string' && decoded.name) || decoded.email || 'User',
    };
  } catch {
    return null;
  }
}

export function extractUserWorkspaces(
  userData: Record<string, unknown> | undefined,
): TelegramWorkspaceBundle[] {
  if (!userData) return [];
  const rawWorkspaces = userData.workspaces as
    | Record<
        string,
        { id?: string; title?: string; isShared?: boolean; shareId?: string | null }
      >
    | undefined;
  if (!rawWorkspaces || typeof rawWorkspaces !== 'object') return [];

  const bundles: TelegramWorkspaceBundle[] = [];
  for (const [key, ws] of Object.entries(rawWorkspaces)) {
    if (!ws || typeof ws !== 'object') continue;
    const workspaceId = ws.id || key;
    const workspaceTitle = ws.title || 'Untitled Workspace';
    const rawTasks = userData[`tasks_${workspaceId}`];
    const tasks = Array.isArray(rawTasks) ? (rawTasks as Task[]) : [];
    bundles.push({
      workspaceId,
      workspaceTitle,
      tasks,
      isShared: Boolean(ws.isShared),
      shareId: typeof ws.shareId === 'string' ? ws.shareId : null,
    });
  }
  return bundles;
}

/**
 * Persists sanitized task mutations initiated from Telegram back to `users/{uid}`
 * and mirrors them immediately to `sharedCharts/{shareId}` if the workspace is publicly shared.
 */
export async function saveWorkspaceTasksFromBot(
  db: Firestore,
  uid: string,
  workspace: TelegramWorkspaceBundle,
  nextTasks: readonly Task[],
): Promise<Task[]> {
  const cleanTasks = recalculateBotTreeProgress(nextTasks);
  const nowISO = new Date().toISOString();

  const writes: Promise<unknown>[] = [
    db
      .collection('users')
      .doc(uid)
      .set(
        {
          [`tasks_${workspace.workspaceId}`]: cleanTasks,
          workspaces: {
            [workspace.workspaceId]: {
              updatedAt: nowISO,
            },
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
  ];

  if (workspace.isShared && workspace.shareId) {
    writes.push(
      db
        .collection('sharedCharts')
        .doc(workspace.shareId)
        .set(
          {
            tasks: cleanTasks,
            updatedAt: nowISO,
          },
          { merge: true },
        )
        .catch((err) => {
          console.error(`Failed syncing shared chart ${workspace.shareId} from Telegram:`, err);
        }),
    );
  }

  await Promise.all(writes);
  return cleanTasks;
}

export function getAppBaseUrl(req?: VercelRequest): string {
  const candidates = [
    process.env.APP_BASE_URL?.trim(),
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim(),
    process.env.VERCEL_URL?.trim(),
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const safe = sanitizeSafeAppUrl(withScheme);
    if (safe) return safe;
  }

  // Local dev fallback only — never trust spoofable forwarded host headers in production
  const hostHeader = req?.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (typeof host === 'string' && /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/i.test(host.trim())) {
    return sanitizeSafeAppUrl(`http://${host.trim()}`);
  }

  return '';
}
