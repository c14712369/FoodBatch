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
    const axiosErr = err as { response?: { data?: unknown; status?: number } };
    if (axiosErr.response) {
      console.error('[AppsScript] 回應狀態:', axiosErr.response.status);
      console.error('[AppsScript] 回應內容:', JSON.stringify(axiosErr.response.data));
    }
    console.error('[AppsScript] 同步失敗:', msg);
    return { synced: 0, error: msg };
  }
}
