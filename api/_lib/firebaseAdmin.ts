import type { VercelRequest } from '@vercel/node';
import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { WorkspaceTasksBundle } from '../../src/domain/reminders.js';
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
  sentReminders?: Record<string, string>;
}

function parseServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON environment variable.');
  }

  let jsonText = raw;
  if (!raw.startsWith('{')) {
    jsonText = Buffer.from(raw, 'base64').toString('utf8');
  }

  const parsed = JSON.parse(jsonText) as ServiceAccount & {
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

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
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
): WorkspaceTasksBundle[] {
  if (!userData) return [];
  const rawWorkspaces = userData.workspaces as
    | Record<string, { id?: string; title?: string }>
    | undefined;
  if (!rawWorkspaces || typeof rawWorkspaces !== 'object') return [];

  const bundles: WorkspaceTasksBundle[] = [];
  for (const [key, ws] of Object.entries(rawWorkspaces)) {
    if (!ws || typeof ws !== 'object') continue;
    const workspaceId = ws.id || key;
    const workspaceTitle = ws.title || 'Untitled Workspace';
    const rawTasks = userData[`tasks_${workspaceId}`];
    const tasks = Array.isArray(rawTasks) ? (rawTasks as Task[]) : [];
    bundles.push({ workspaceId, workspaceTitle, tasks });
  }
  return bundles;
}

export function getAppBaseUrl(req?: VercelRequest): string {
  const envUrl = process.env.APP_BASE_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');

  const host = req?.headers['x-forwarded-host'] || req?.headers.host;
  const proto = req?.headers['x-forwarded-proto'] || 'https';
  if (typeof host === 'string' && host) {
    return `${Array.isArray(proto) ? proto[0] : proto}://${host}`;
  }
  return '';
}
