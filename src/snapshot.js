/** Snapshot hash & serialization for KV storage */

export async function computeSnapshotHash(accounts, campaigns) {
  const accountKeys = [...accounts.keys()].sort();
  const campaignKeys = [...campaigns.keys()].sort();
  const payload = [...accountKeys, ...campaignKeys].join('\n');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function serializeAccounts(accounts) {
  const obj = {};
  for (const [k, v] of accounts) obj[k] = v;
  return JSON.stringify(obj);
}

export function deserializeAccounts(json) {
  const obj = JSON.parse(json || '{}');
  return new Map(Object.entries(obj));
}

export function serializeCampaigns(campaigns) {
  const obj = {};
  for (const [k, v] of campaigns) obj[k] = v;
  return JSON.stringify(obj);
}

export function deserializeCampaigns(json) {
  const obj = JSON.parse(json || '{}');
  return new Map(Object.entries(obj));
}

export function campaignKey(customerId, campaignName) {
  return `${customerId}|${campaignName}`;
}
