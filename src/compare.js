import { campaignKey } from './snapshot.js';

const KV_ALERTED_MISSING = 'alerted_missing';
const KV_ALERTED_CAMPAIGNS = 'alerted_campaigns';

async function getAlertedSet(kv, key) {
  const raw = await kv.get(key);
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

async function saveAlertedSet(kv, key, set) {
  await kv.put(key, JSON.stringify([...set]));
}

/** Account/campaign xuất hiện lại → cho phép alert lần sau nếu biến mất lần nữa */
export async function syncAlertState(kv, refAccounts, currentAccounts, refCampaigns, currentCampaigns) {
  const alertedMissing = await getAlertedSet(kv, KV_ALERTED_MISSING);
  const alertedCampaigns = await getAlertedSet(kv, KV_ALERTED_CAMPAIGNS);

  for (const id of alertedMissing) {
    if (currentAccounts.has(id)) alertedMissing.delete(id);
  }
  for (const key of alertedCampaigns) {
    if (!currentCampaigns.has(key)) alertedCampaigns.delete(key);
  }

  await saveAlertedSet(kv, KV_ALERTED_MISSING, alertedMissing);
  await saveAlertedSet(kv, KV_ALERTED_CAMPAIGNS, alertedCampaigns);
}

export function findMissingAccounts(refAccounts, currentAccounts) {
  const missing = [];
  for (const [customerId, accountName] of refAccounts) {
    if (!currentAccounts.has(customerId)) {
      missing.push({ customerId, accountName });
    }
  }
  return missing;
}

export function findNewCampaigns(refCampaigns, currentCampaigns) {
  const novel = [];
  for (const [key, data] of currentCampaigns) {
    if (!refCampaigns.has(key)) {
      novel.push({
        customerId: data.customerId,
        accountName: data.accountName,
        campaignName: data.campaignName,
        key,
      });
    }
  }
  return novel;
}

export async function filterNewAlerts(kv, missingAccounts, newCampaigns) {
  const alertedMissing = await getAlertedSet(kv, KV_ALERTED_MISSING);
  const alertedCampaigns = await getAlertedSet(kv, KV_ALERTED_CAMPAIGNS);

  const toAlertMissing = missingAccounts.filter((a) => !alertedMissing.has(a.customerId));
  const toAlertCampaigns = newCampaigns.filter((c) => !alertedCampaigns.has(c.key));

  return { toAlertMissing, toAlertCampaigns };
}

export async function markAlertsSent(kv, missingAccounts, newCampaigns) {
  const alertedMissing = await getAlertedSet(kv, KV_ALERTED_MISSING);
  const alertedCampaigns = await getAlertedSet(kv, KV_ALERTED_CAMPAIGNS);

  for (const a of missingAccounts) alertedMissing.add(a.customerId);
  for (const c of newCampaigns) alertedCampaigns.add(c.key);

  await saveAlertedSet(kv, KV_ALERTED_MISSING, alertedMissing);
  await saveAlertedSet(kv, KV_ALERTED_CAMPAIGNS, alertedCampaigns);
}

export { KV_ALERTED_MISSING, KV_ALERTED_CAMPAIGNS };
