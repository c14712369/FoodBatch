import 'dotenv/config';

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  discord: {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    summaryChannelId: required('DISCORD_SUMMARY_CHANNEL_ID'),
  },
  google: {
    apiKey: required('GOOGLE_API_KEY'),
    sheetsId: required('GOOGLE_SHEETS_ID'),
    sheetTabName: process.env['GOOGLE_SHEET_TAB_NAME'] ?? 'places',
    serviceAccountJson: required('GOOGLE_SERVICE_ACCOUNT_JSON'),
  },
  appsScript: {
    webhookUrl: required('APPS_SCRIPT_WEBHOOK_URL'),
    secret: required('APPS_SCRIPT_SECRET'),
    myMapsFileId: required('MY_MAPS_FILE_ID'),
  },
};
