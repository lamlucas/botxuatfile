import { getConfig, CONFIG_KEYS } from './db.js';

const DEFAULTS = {
  customerId: 'Customer ID',
  accountName: 'Account Name',
  campaignName: 'Campaign Name',
};

export async function loadColumnConfig(env) {
  const [customerId, accountName, campaignName] = await Promise.all([
    getConfig(env.DB, CONFIG_KEYS.COL_CUSTOMER_ID),
    getConfig(env.DB, CONFIG_KEYS.COL_ACCOUNT_NAME),
    getConfig(env.DB, CONFIG_KEYS.COL_CAMPAIGN_NAME),
  ]);
  return {
    customerId: customerId || DEFAULTS.customerId,
    accountName: accountName || DEFAULTS.accountName,
    campaignName: campaignName || DEFAULTS.campaignName,
  };
}

export { DEFAULTS };
