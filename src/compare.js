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

async function addToAlertedSet(kv, key, id) {
  const set = await getAlertedSet(kv, key);
  set.add(id);
  await kv.put(key, JSON.stringify([...set]));
}

/**
 * Accounts in baseline but missing from current report.
 */
export function findMissingAccounts(baselineAccounts, currentAccounts) {
  const missing = [];
  for (const [customerId, accountName] of baselineAccounts) {
    if (!currentAccounts.has(customerId)) {
      missing.push({ customerId, accountName });
    }
  }
  return missing;
}

/**
 * Campaigns in current report not present in baseline.
 */
export function findNewCampaigns(baselineCampaigns, currentCampaigns) {
  const novel = [];
  for (const [key, data] of currentCampaigns) {
    if (!baselineCampaigns.has(key)) {
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
  for (const a of missingAccounts) {
    await addToAlertedSet(kv, KV_ALERTED_MISSING, a.customerId);
  }
  for (const c of newCampaigns) {
    await addToAlertedSet(kv, KV_ALERTED_CAMPAIGNS, c.key);
  }
}

export { KV_ALERTED_MISSING, KV_ALERTED_CAMPAIGNS };
