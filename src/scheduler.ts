import cron from 'node-cron';
import { Client } from 'discord.js';
import { searchPlaces } from './services/places.js';
import { scrapeRssNames } from './scrapers/rss.js';
import { scrapeIFoodNames } from './scrapers/ifood.js';
import { getAllPlaces, appendPlaces } from './services/sheets.js';
import { triggerSync } from './services/appsscript.js';
import { filterNewPlaces } from './utils/dedup.js';
import { isSimilar } from './utils/similarity.js';
import { config } from './config.js';
import type { Place, PlaceType, RunSummary } from './types.js';

const CITIES = [
  '台北', '新北', '花蓮', '香港',
  '東京', '大阪', '京都', '福岡', '沖繩', '札幌', '名古屋', '奈良', '神戶'
];
const TYPES: PlaceType[] = ['餐廳', '咖啡廳', '甜點', '藝術', '購物', '景點', '夜市'];
// 針對核心城市增加熱門料理類型搜尋，以提升資料量並吃滿額度
const CUISINE_EXTENSIONS = ['火鍋', '日式', '燒烤', '漢堡', '義大利麵'];
const CORE_CITIES = ['台北', '新北', '香港', '東京', '大阪'];

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

  // 1. Google Places API (主要來源 - 消耗約 110-115 次請求)
  outer: for (const city of CITIES) {
    for (const type of TYPES) {
      try {
        const places = await searchPlaces({ type, location: city });
        collected.push(...places);
      } catch (err) {
        if ((err as any).response?.status === 429) {
          summary.errors.push('API 配額已達上限，停止主要搜尋');
          break outer;
        }
      }
    }

    if (CORE_CITIES.includes(city)) {
      for (const cuisine of CUISINE_EXTENSIONS) {
        try {
          const places = await searchPlaces({ type: '餐廳', location: city, cuisine });
          collected.push(...places);
        } catch (err) {
          if ((err as any).response?.status === 429) break outer;
        }
      }
    }
  }

  // 2. 補充爬蟲來源 (不直接消耗 API)
  // 我們只針對台灣城市執行補充爬蟲
  const TW_CITIES = ['台北', '新北', '花蓮'];
  const scrapedNames: { name: string, city: string }[] = [];

  for (const city of TW_CITIES) {
    const rssNames = await scrapeRssNames(city);
    const iFoodNames = await scrapeIFoodNames(city);
    [...rssNames, ...iFoodNames].forEach(n => scrapedNames.push({ name: n, city }));
  }

  // 3. 處理補充爬蟲抓到的店名 (去重並限量查詢，避免爆額度)
  // 每天只額外處理 10 間爬蟲抓到的新店名
  const uniqueNames = [...new Map(scrapedNames.map(item => [item.name, item])).values()];
  let additionalCount = 0;
  for (const item of uniqueNames) {
    if (additionalCount >= 10) break; // 嚴格限制，保留配額給主搜尋
    
    // 檢查是否已在本次收集或資料庫中
    const isExist = existing.some(p => isSimilar(p.name, item.name)) || 
                    collected.some(p => isSimilar(p.name, item.name));
    
    if (!isExist) {
      try {
        const places = await searchPlaces({ type: '餐廳', location: `${item.name} ${item.city}` });
        if (places.length > 0) {
          const match = places.find(p => isSimilar(p.name, item.name));
          if (match) {
            collected.push({ ...match, source: '爬蟲補充' });
            additionalCount++;
          }
        }
      } catch {
        break; // 可能是配額滿了
      }
    }
  }

  // Dedup and write
  const newPlaces = filterNewPlaces(collected, existing);
  if (newPlaces.length > 0) {
    await appendPlaces(newPlaces);
    await triggerSync();
  }

  for (const p of newPlaces) {
    summary.byType[p.type]++;
    summary.total++;
  }

  // Post summary to Discord
  try {
    const channel = await client.channels.fetch(config.discord.summaryChannelId);
    if (channel?.isTextBased()) {
      const errorLine = summary.errors.length > 0
        ? `\n⚠️ ${summary.errors.length} 個錯誤` : '';
      await (channel as import('discord.js').TextChannel).send(
        `**今日新增 ${summary.total} 筆**\n` +
        `餐廳 ${summary.byType['餐廳']} | 咖啡廳 ${summary.byType['咖啡廳']} | 景點 ${summary.byType['景點']} | 夜市 ${summary.byType['夜市']}` +
        errorLine
      );
    }
  } catch (err) {
    console.error('[Scheduler] Discord 通知失敗:', (err as Error).message);
  }

  return summary;
}

export function startScheduler(client: Client): void {
  // Daily at 09:00 Asia/Taipei
  cron.schedule('0 9 * * *', () => {
    console.log('[Scheduler] 開始每日爬蟲任務...');
    runDailyJob(client).catch(err => console.error('[Scheduler] 任務失敗:', err));
  }, { timezone: 'Asia/Taipei' });

  console.log('[Scheduler] 排程已啟動（每日 09:00 台北時間）');
}
