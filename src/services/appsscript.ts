import axios from 'axios';
import { config } from '../config.js';

export interface SyncResult {
  synced: number;
  error?: string;
}

export async function triggerSync(): Promise<SyncResult> {
  try {
    const res = await axios.post(config.appsScript.webhookUrl, {
      token: config.appsScript.secret,
    });
    return { synced: (res.data as { synced: number }).synced ?? 0 };
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[AppsScript] 同步失敗:', msg);
    return { synced: 0, error: msg };
  }
}
