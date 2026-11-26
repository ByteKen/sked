import { auth } from '@/config/firebase';
import type { TelegramNotificationConfig } from '@/types';

interface ApiErrorBody {
  error?: string;
}

async function postTelegramManage<TResponse>(payload: Record<string, unknown>): Promise<TResponse> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to manage Telegram notifications.');
  }

  const idToken = await user.getIdToken();
  const response = await fetch('/api/telegram/manage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as TResponse & ApiErrorBody;
  if (!response.ok) {
    throw new Error(
      data.error ||
        (response.status === 404
          ? 'Telegram API endpoint not available locally. Deploy to Vercel (or run `vercel dev`) to use Telegram alerts.'
          : `Request failed (HTTP ${response.status})`),
    );
  }

  return data;
}

export interface CreateTelegramLinkParams {
  timezone: string;
  reminderHour: number;
  reminderOffsets: number[];
  includeOverdue: boolean;
}

export interface CreateTelegramLinkResult {
  ok: true;
  botUsername: string;
  deepLink: string;
  expiresAt: string;
}

export function createTelegramLink(
  params: CreateTelegramLinkParams,
): Promise<CreateTelegramLinkResult> {
  return postTelegramManage<CreateTelegramLinkResult>({
    action: 'create-link',
    ...params,
  });
}

export interface UpdateTelegramSettingsParams {
  enabled?: boolean;
  timezone?: string;
  reminderHour?: number;
  reminderOffsets?: number[];
  includeOverdue?: boolean;
}

export function updateTelegramSettings(
  params: UpdateTelegramSettingsParams,
): Promise<{ ok: true; telegram: TelegramNotificationConfig }> {
  return postTelegramManage<{ ok: true; telegram: TelegramNotificationConfig }>({
    action: 'update-settings',
    ...params,
  });
}

export function sendTelegramTestNotification(): Promise<{ ok: true }> {
  return postTelegramManage<{ ok: true }>({ action: 'test' });
}

export function disconnectTelegram(): Promise<{ ok: true }> {
  return postTelegramManage<{ ok: true }>({ action: 'disconnect' });
}
