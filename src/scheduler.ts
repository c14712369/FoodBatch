import cron from 'node-cron';
import { Client } from 'discord.js';
import { searchPlaces } from './services/places.js';
import { scrapeRssNames } from './scrapers/rss.js';
import { scrapeIFoodNames } from './scrapers/ifood.js';
import { scrapeWalkerLandNames } from './scrapers/walkerland.js';
import { generateKml } from './services/kml.js';
import { uploadKmlToDrive } from './services/drive.js';
import { getAllPlaces, appendPlaces, appendScrapedNames, getExistingScrapedNames } from './services/sheets.js';
import { triggerSync } from './services/appsscript.js';
import { filterNewPlaces } from './utils/dedup.js';
import { isSimilar } from './utils/similarity.js';
import { config } from './config.js';
import type { Place, PlaceType, RunSummary } from './types.js';

// ... (CITIES, TYPES, CUISINE_EXTENSIONS, CORE_CITIES stay the same)

export async function runDailyJob(client: Client): Promise<RunSummary> {
  // ... (Summary and collection logic stay the same)

  // 4. 處理主要搜尋結果 (去重並寫入主分頁)
  const newPlaces = filterNewPlaces(collected, existing);
  if (newPlaces.length > 0) {
    await appendPlaces(newPlaces);
    await triggerSync();
  }

  for (const p of newPlaces) {
    summary.byType[p.type]++;
    summary.total++;
  }

  // 5. 自動產生 KML 並更新 Google Drive
  let driveFileId = '';
  try {
    const updatedPlaces = await getAllPlaces();
    const kmlContent = generateKml(updatedPlaces);
    driveFileId = await uploadKmlToDrive(kmlContent, 'FoodBatch_Places.kml');
    console.log(`[Drive] KML 已自動更新: ${driveFileId}`);
  } catch (err) {
    console.error('[Drive] KML 自動更新失敗:', (err as Error).message);
    summary.errors.push('KML 雲端更新失敗');
  }

  // Post summary to Discord
  try {
    const channel = await client.channels.fetch(config.discord.summaryChannelId);
    if (channel?.isTextBased()) {
      const errorLine = summary.errors.length > 0 ? `\n⚠️ 偵測到 ${summary.errors.length} 個錯誤` : '';
      const driveLink = driveFileId ? `\n📂 **最新地圖檔案 (Drive):** [點我下載](https://drive.google.com/file/d/${driveFileId}/view)` : '';
      
      const summaryEmbed = 
        `**🚀 FoodBatch 每日採集報告**\n\n` +
        `**📍 正式地圖更新 (Google API):**\n` +
        `餐廳 ${summary.byType['餐廳']} | 咖啡廳 ${summary.byType['咖啡廳']} | 甜點 ${summary.byType['甜點']} | 藝術 ${summary.byType['藝術']}\n` +
        `購物 ${summary.byType['購物']} | 景點 ${summary.byType['景點']} | 夜市 ${summary.byType['夜市']}\n` +
        `*共計新增 ${summary.total} 筆高品質地點*\n\n` +
        `**🔍 網路熱議採集 (爬蟲暫存):**\n` +
        `今日共挖掘到 **${reallyNewScraped.length}** 筆全新潛在名單，已存入 \`scraped_queue\`。\n` +
        driveLink +
        errorLine;

      await (channel as any).send(summaryEmbed);
    }
  } catch (err) {
    console.error('[Scheduler] Discord 通知失敗:', (err as Error).message);
  }

  return summary;
}


  return summary;
}

export function startScheduler(client: Client): void {
  cron.schedule('0 9 * * *', () => {
    runDailyJob(client).catch(err => console.error('[Scheduler] 任務失敗:', err));
  }, { timezone: 'Asia/Taipei' });
  console.log('[Scheduler] 排程已啟動（每日 09:00 台北時間）');
}
