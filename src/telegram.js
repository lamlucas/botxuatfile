/** Telegram Bot API — gửi cảnh báo vào nhóm */

export const DEFAULT_TELEGRAM_CHAT_ID = '-1003956302215';
export const DEFAULT_TELEGRAM_GROUP_NAME = 'Black Corp - Invoice';

export function getTelegramChatId(env) {
  return env.TELEGRAM_CHAT_ID || DEFAULT_TELEGRAM_CHAT_ID;
}

export function isTelegramConfigured(env) {
  return Boolean(env.TELEGRAM_BOT_TOKEN);
}

export async function sendTelegramMessage(env, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN chưa cấu hình');

  const chatId = getTelegramChatId(env);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.description || `Telegram API error ${res.status}`);
  }
  return data;
}

export function buildMissingAccountMessage({ accountName, customerId, lastValidFileKey, timestamp }) {
  return `[ALERT] TÀI KHOẢN BỊ BACK

TÀI KHOẢN BỊ BACK

Tên tài khoản: ${accountName}
Customer ID: ${customerId}

File gần nhất còn dữ liệu:
${lastValidFileKey}

Thời gian:
${timestamp}`;
}

export function buildNewCampaignMessage({ accountName, customerId, campaignName, fileKey, timestamp }) {
  return `[NEW CAMPAIGN]

CHIẾN DỊCH MỚI

Tên tài khoản: ${accountName}
Customer ID: ${customerId}
Chiến dịch: ${campaignName}

File:
${fileKey}

Thời gian:
${timestamp}`;
}
