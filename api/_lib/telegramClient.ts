import type { TelegramInlineKeyboard } from '../../src/domain/telegramBot.js';

export interface TelegramSendResult {
  ok: boolean;
  blocked?: boolean;
  notModified?: boolean;
  status?: number;
  description?: string;
}

const TELEGRAM_FETCH_TIMEOUT_MS = 8_000;

async function callTelegramApi(
  method: string,
  payload: Record<string, unknown>,
): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return {
      ok: false,
      description: 'TELEGRAM_BOT_TOKEN is not configured on the server.',
    };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TELEGRAM_FETCH_TIMEOUT_MS),
    });

    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };

    if (response.ok && data.ok) {
      return { ok: true, status: response.status };
    }

    const description = data.description || `Telegram API returned HTTP ${response.status}`;
    const notModified = description.toLowerCase().includes('message is not modified');

    return {
      ok: notModified,
      blocked: response.status === 403,
      notModified,
      status: response.status,
      description,
    };
  } catch (err) {
    return {
      ok: false,
      description: err instanceof Error ? err.message : 'Network error calling Telegram API',
    };
  }
}

export async function sendTelegramMessage(
  chatId: string | number,
  htmlText: string,
  replyMarkup?: TelegramInlineKeyboard,
): Promise<TelegramSendResult> {
  return callTelegramApi('sendMessage', {
    chat_id: String(chatId),
    text: htmlText,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export async function editTelegramMessageText(
  chatId: string | number,
  messageId: number,
  htmlText: string,
  replyMarkup?: TelegramInlineKeyboard,
): Promise<TelegramSendResult> {
  return callTelegramApi('editMessageText', {
    chat_id: String(chatId),
    message_id: messageId,
    text: htmlText,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export async function answerTelegramCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert = false,
): Promise<TelegramSendResult> {
  return callTelegramApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
    ...(showAlert ? { show_alert: true } : {}),
  });
}

export async function setTelegramBotCommands(
  commands: ReadonlyArray<{ command: string; description: string }>,
): Promise<TelegramSendResult> {
  return callTelegramApi('setMyCommands', {
    commands,
  });
}
