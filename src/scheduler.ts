import cron from 'node-cron';
import { Client } from 'discord.js';
import { searchPlaces } from './services/places.js';
import { scrapeRssNames } from './scrapers/rss.js';
import { scrapeIFoodNames } from './scrapers/ifood.js';
import { scrapeWalkerLandNames } from './scrapers/walkerland.js';
import { generateKml } from './services/kml.js';
import { updateKMLOnDrive } from './services/appsscript.js';
import { getAllPlaces, appendPlaces, appendScrapedNames, getExistingScrapedNames } from './services/sheets.js';
import { triggerSync } from './services/appsscript.js';
import { filterNewPlaces } from './utils/dedup.js';
import { isSimilar } from './utils/similarity.js';
import { config } from './config.js';
import type { Place, PlaceType, RunSummary } from './types.js';

interface CityConfig {
  types: PlaceType[];
  country: string;
  region: string;
}

const CITY_CONFIG: Record<string, CityConfig> = {
  '台北': { country: '台灣', region: '台北', types: ['餐廳','咖啡廳','甜點','藝術','購物','景點','夜市'] },
  '新北': { country: '台灣', region: '新北', types: ['餐廳','咖啡廳','甜點','景點','夜市'] },
  '花蓮': { country: '台灣', region: '花蓮', types: ['餐廳','咖啡廳','甜點','景點'] },
  '香港': { country: '香港', region: '香港', types: ['餐廳','咖啡廳','甜點','藝術','購物','景點'] },
  '東京': { country: '日本', region: '東京', types: ['餐廳','咖啡廳','甜點','藝術','購物','景點'] },
  '大阪': { country: '日本', region: '大阪', types: ['餐廳','咖啡廳','甜點','購物','景點'] },
  '京都': { country: '日本', region: '京都', types: ['餐廳','咖啡廳','甜點','藝術','景點'] },
  '福岡': { country: '日本', region: '福岡', types: ['餐廳','咖啡廳','甜點','景點'] },
  '沖繩': { country: '日本', region: '沖繩', types: ['餐廳','咖啡廳','甜點','景點'] },
  '札幌': { country: '日本', region: '札幌', types: ['餐廳','咖啡廳','甜點','景點'] },
  '名古屋': { country: '日本', region: '名古屋', types: ['餐廳','咖啡廳','甜點','景點'] },
  '奈良': { country: '日本', region: '奈良', types: ['餐廳','咖啡廳','景點'] },
  '神戶': { country: '日本', region: '神戶', types: ['餐廳','咖啡廳','甜點','購物','景點'] },
  '鎌倉': { country: '日本', region: '鎌倉', types: ['餐廳','咖啡廳','甜點','景點'] },
};

export async function runDailyJob(client: Client): Promise<RunSummary> {
  const summary: RunSummary = {
    total: 0,
    byType: {
      '餐廳': 0, '咖啡廳': 0, '甜點': 0, '藝術': 0, '購物': 0, '景點': 0, '夜市': 0
    },
    errors: [],
  };

  const existing = await getAllPlaces();
  const collected: Place[] = [];

  // 1. Google Places API (主動搜尋)
  outer: for (const [city, cfg] of Object.entries(CITY_CONFIG)) {
    for (const type of cfg.types) {
      try {
        const places = await searchPlaces({ type, location: city, country: cfg.country, region: cfg.region });
        collected.push(...places);
      } catch (err) {
        if ((err as any).response?.status === 429) {
          summary.errors.push('API 配額已達上限，中斷本次搜尋');
          break outer;
        }
      }
    }

  }

  // 2. 爬取網路食記名稱
  const TW_CITIES = ['台北', '新北', '桃園', '台中', '台南', '高雄', '基隆', '新竹', '宜蘭', '花蓮', '屏東', '彰化', '南投', '雲林', '嘉義'];
  const rawScrapedItems: Array<{ name: string, city: string, source: string }> = [];

  for (const city of TW_CITIES) {
    try {
      const rssNames = await scrapeRssNames(city);
      rssNames.forEach(name => rawScrapedItems.push({ name, city, source: 'RSS' }));
      const iFoodNames = await scrapeIFoodNames(city);
      iFoodNames.forEach(name => rawScrapedItems.push({ name, city, source: 'iFood' }));
      const walkerNames = await scrapeWalkerLandNames(city);
      walkerNames.forEach(name => rawScrapedItems.push({ name, city, source: 'WalkerLand' }));
    } catch (e) {
      console.warn(`[Scraper] ${city} 爬取失敗:`, (e as Error).message);
    }
  }

  // 3. 過濾並存入待處理清單 (防重複後存入)
  const existingScraped = await getExistingScrapedNames();
  const uniqueScraped = [...new Map(rawScrapedItems.map(item => [item.name, item])).values()];
  const reallyNewScraped = uniqueScraped.filter(item => {
    const inQueue = existingScraped.some(name => isSimilar(name, item.name));
    const inMain = existing.some(p => isSimilar(p.name, item.name));
    return !inQueue && !inMain;
  });

  if (reallyNewScraped.length > 0) {
    await appendScrapedNames(reallyNewScraped);
  }

  // 4. 過濾並存入正式地圖
  const newPlaces = filterNewPlaces(collected, existing);
  if (newPlaces.length > 0) {
    await appendPlaces(newPlaces);
    await triggerSync();
  }

  for (const p of newPlaces) {
    summary.byType[p.type as PlaceType]++;
    summary.total++;
  }

  // 5. 更新 KML 存儲於 Google Drive (透過 Apps Script 處理)
  let driveFileId = '';
  try {
    const updatedPlaces = await getAllPlaces();
    const kmlContent = generateKml(updatedPlaces);
    driveFileId = await updateKMLOnDrive(kmlContent, 'FoodBatch_Places.kml');
    console.log(`[Drive] KML 已透過 Apps Script 更新: ${driveFileId}`);
  } catch (err) {
    console.error('[Drive] KML 更新失敗:', (err as Error).message);
    summary.errors.push('KML 檔案更新失敗');
  }

  // Post summary to Discord
  try {
    const channel = await client.channels.fetch(config.discord.summaryChannelId);
    if (channel?.isTextBased()) {
      const errorDetails = summary.errors.length > 0 
        ? `\n\n❌ **執行異常：**\n${summary.errors.map(e => `> - ${e}`).join('\n')}` 
        : '';
      const driveLink = driveFileId ? `\n📂 **最新地圖檔案 (Drive):** [點此查看](https://drive.google.com/file/d/${driveFileId}/view)` : '';
      
      const statusIcon = summary.total > 0 ? '🚀' : (summary.errors.length > 0 ? '⚠️' : 'ℹ️');
      const timestamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
      const msg =
        `**▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬**\n` +
        `**${statusIcon} FoodBatch 每日採集報告** (${timestamp})\n\n` +
        `**📍 正式地圖更新 (Google API):**\n` +
        `餐廳 ${summary.byType['餐廳']} | 咖啡廳 ${summary.byType['咖啡廳']} | 甜點 ${summary.byType['甜點']} | 藝術 ${summary.byType['藝術']}\n` +
        `購物 ${summary.byType['購物']} | 景點 ${summary.byType['景點']} | 夜市 ${summary.byType['夜市']}\n` +
        `*共計新增 ${summary.total} 筆高品質地點*\n\n` +
        `**📝 網路食記發現 (待處理):**\n` +
        `今日共抓取到 **${reallyNewScraped.length}** 筆新店名，已自動存入 \`scraped_queue\` 活頁簿中` +
        driveLink + errorDetails;
      await (channel as any).send(msg);
    }
  } catch (err) {
    console.error('[Scheduler] Discord 通知失敗:', (err as Error).message);
  }

  return summary;
}

export function startScheduler(client: Client): void {
  cron.schedule('0 9 * * *', () => {
    runDailyJob(client).catch(err => console.error('[Scheduler] 執行失敗:', err));
  }, { timezone: 'Asia/Taipei' });
  console.log('[Scheduler] 排程器已啟動，每日 09:00 執行採集任務');
}
