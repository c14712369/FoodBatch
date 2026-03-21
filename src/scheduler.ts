import cron from 'node-cron';
import { Client } from 'discord.js';
import { searchPlaces } from './services/places.js';
import { scrapeRssNames } from './scrapers/rss.js';
import { scrapeIFoodNames } from './scrapers/ifood.js';
import { getAllPlaces, appendPlaces, appendScrapedNames } from './services/sheets.js';
import { triggerSync } from './services/appsscript.js';
import { filterNewPlaces } from './utils/dedup.js';
import { config } from './config.js';
import type { Place, PlaceType, RunSummary } from './types.js';

const CITIES = [
  '台北', '新北', '花蓮', '香港',
  '東京', '大阪', '京都', '福岡', '沖繩', '札幌', '名古屋', '奈良', '神戶'
];
const TYPES: PlaceType[] = ['餐廳', '咖啡廳', '甜點', '藝術', '購物', '景點', '夜市'];
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

  // 1. Google Places API (主要來源 - 穩定利用 110-115 次請求)
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

  // 2. 補充爬蟲來源 (完全不消耗 API)
  const TW_CITIES = ['台北', '新北', '桃園', '台中', '台南', '高雄', '新竹', '嘉義', '彰化', '屏東', '宜蘭', '花蓮', '台東', '基隆', '南投'];
  const rawScrapedItems: Array<{ name: string, city: string, source: string }> = [];

  for (const city of TW_CITIES) {
    try {
      const rssNames = await scrapeRssNames(city);
      rssNames.forEach(name => rawScrapedItems.push({ name, city, source: 'RSS' }));
      
      const iFoodNames = await scrapeIFoodNames(city);
      iFoodNames.forEach(name => rawScrapedItems.push({ name, city, source: 'iFood' }));
    } catch (e) {
      console.warn(`[Scraper] ${city} 爬取失敗:`, (e as Error).message);
    }
  }

  // 3. 直接寫入爬蟲暫存分頁
  const uniqueScraped = [...new Map(rawScrapedItems.map(item => [item.name, item])).values()];
  if (uniqueScraped.length > 0) {
    await appendScrapedNames(uniqueScraped);
    console.log(`[Scraper] 已將 ${uniqueScraped.length} 筆暫存店名寫入 scraped_queue`);
  }

  // 4. 處理主要搜尋結果
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
      const errorLine = summary.errors.length > 0 ? `\n⚠️ ${summary.errors.length} 個錯誤` : '';
      await (channel as any).send(
        `**今日新增 ${summary.total} 筆**\n` +
        `餐廳 ${summary.byType['餐廳']} | 咖啡廳 ${summary.byType['咖啡廳']} | 景點 ${summary.byType['景點']} | 夜市 ${summary.byType['夜市']}` +
        ` | 甜點 ${summary.byType['甜點']} | 藝術 ${summary.byType['藝術']} | 購物 ${summary.byType['購物']}` +
        errorLine
      );
    }
  } catch (err) {
    console.error('[Scheduler] Discord 通知失敗:', (err as Error).message);
  }

  return summary;
}

export function startScheduler(client: Client): void {
  cron.schedule('0 9 * * *', () => {
    runDailyJob(client).catch(err => console.error('[Scheduler] 任務失敗:', err));
  }, { timezone: 'Asia/Taipei' });
  console.log('[Scheduler] 排程已啟動（每日 09:00 台北時間）');
}
