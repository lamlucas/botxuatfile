import { markAlertsSent } from './compare.js';
import { campaignKey } from './snapshot.js';
import {
  sendTelegramMessage,
  buildMissingAccountMessage,
  buildNewCampaignMessage,
  isTelegramConfigured,
} from './telegram.js';

/** Queue consumer — gửi cảnh báo qua Telegram */
export async function processQueueMessage(env, msg) {
  if (!isTelegramConfigured(env)) {
    throw new Error('TELEGRAM_BOT_TOKEN chưa cấu hình');
  }

  let text;
  if (msg.type === 'missing_account') {
    text = buildMissingAccountMessage(msg);
  } else if (msg.type === 'new_campaign') {
    text = buildNewCampaignMessage(msg);
  } else {
    throw new Error(`Unknown alert type: ${msg.type}`);
  }

  await sendTelegramMessage(env, text);

  if (msg.type === 'missing_account') {
    await markAlertsSent(env.KV, [{ customerId: msg.customerId }], []);
  } else if (msg.type === 'new_campaign') {
    const key = campaignKey(msg.customerId, msg.campaignName);
    await markAlertsSent(env.KV, [], [{ key }]);
  }
}
