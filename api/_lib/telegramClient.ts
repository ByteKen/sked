export interface TelegramSendResult {
  ok: boolean;
  blocked?: boolean;
  status?: number;
  description?: string;
}

export async function sendTelegramMessage(
  chatId: string | number,
  htmlText: string,
): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return {
      ok: false,
      description: 'TELEGRAM_BOT_TOKEN is not configured on the server.',
    };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(chatId),
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };

    if (response.ok && data.ok) {
      return { ok: true, status: response.status };
    }

    return {
      ok: false,
      blocked: response.status === 403,
      status: response.status,
      description: data.description || `Telegram API returned HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      description: err instanceof Error ? err.message : 'Network error calling Telegram API',
    };
  }
}
