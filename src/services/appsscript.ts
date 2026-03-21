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
      action: 'sync',
    });
    return { synced: (res.data as { synced: number }).synced ?? 0 };
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[AppsScript] 同步失敗:', msg);
    return { synced: 0, error: msg };
  }
}

export async function updateKMLOnDrive(kmlContent: string, fileName: string): Promise<string> {
  try {
    const res = await axios.post(config.appsScript.webhookUrl, {
      token: config.appsScript.secret,
      action: 'updateKML',
      fileName: fileName,
      content: kmlContent,
    });
    
    const fileId = String(res.data);
    if (fileId.startsWith('Error')) throw new Error(fileId);
    return fileId;
  } catch (err) {
    console.error('[AppsScript] KML 雲端更新失敗:', (err as Error).message);
    throw err;
  }
}
