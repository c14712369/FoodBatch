import 'dotenv/config';
import { searchPlaces, sleep } from '../src/services/places.js';
import { scrapeRssNames } from '../src/scrapers/rss.js';
import { scrapeIFoodNames } from '../src/scrapers/ifood.js';
import { scrapeWalkerLandNames } from '../src/scrapers/walkerland.js';
import { getAllPlaces, appendPlaces, appendScrapedNames, getExistingScrapedNames, bootstrapSheet } from '../src/services/sheets.js';
import { filterNewPlaces } from '../src/utils/dedup.js';
import { isSimilar } from '../src/utils/similarity.js';
import type { Place, PlaceType, RunSummary } from '../src/types.js';

const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red:   (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow:(s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan:  (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold:  (s: string) => `\x1b[1m${s}\x1b[0m`,
};

interface CityConfig { types: PlaceType[]; country: string; region: string; }

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

const TW_CITIES = ['台北','新北','桃園','台中','台南','高雄','基隆','新竹','宜蘭','花蓮','屏東','彰化','南投','雲林','嘉義'];

async function main() {
  const start = Date.now();
  console.log(c.bold(`\n🍜 FoodBatch 手動執行排程`));
  console.log(`時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n`);

  await bootstrapSheet();

  const summary: RunSummary = {
    total: 0,
    byType: { '餐廳':0,'咖啡廳':0,'甜點':0,'藝術':0,'購物':0,'景點':0,'夜市':0 },
    errors: [],
  };

  const existing = await getAllPlaces();
  console.log(c.cyan(`[Sheet] 現有 ${existing.length} 筆`));
  const collected: Place[] = [];

  // ── 1. Google Places API ──────────────────────────────────
  console.log(c.bold('\n[1/3] Google Places API 搜尋'));
  const entries = Object.entries(CITY_CONFIG);
  let callCount = 0;
  const totalCalls = entries.reduce((s, [, cfg]) => s + cfg.types.length, 0);

  outer: for (const [city, cfg] of entries) {
    for (const type of cfg.types) {
      callCount++;
      process.stdout.write(`\r  進度: ${callCount}/${totalCalls} — ${city} ${type}          `);
      try {
        const places = await searchPlaces({ type, location: city, country: cfg.country, region: cfg.region });
        collected.push(...places);
      } catch (err: any) {
        if (err.response?.status === 429) {
          summary.errors.push('API 配額已達上限，中斷搜尋');
          console.log('\n' + c.red('  ❌ 429 配額上限，中斷'));
          break outer;
        }
      }
    }
  }
  console.log(`\n  → 原始 ${collected.length} 筆，去重後...`);
  const newPlaces = filterNewPlaces(collected, existing);
  console.log(c.green(`  ✅ 新增 ${newPlaces.length} 筆`));

  if (newPlaces.length > 0) {
    await appendPlaces(newPlaces);
    for (const p of newPlaces) {
      summary.byType[p.type as PlaceType]++;
      summary.total++;
    }
  }

  // ── 2. 爬蟲 (RSS / iFood / WalkerLand) ───────────────────
  console.log(c.bold('\n[2/3] 網路食記爬蟲'));
  const rawScrapedItems: Array<{ name: string; city: string; source: string }> = [];

  for (const city of TW_CITIES) {
    process.stdout.write(`\r  爬取城市: ${city}          `);
    try {
      const [rss, ifood, walker] = await Promise.all([
        scrapeRssNames(city),
        scrapeIFoodNames(city),
        scrapeWalkerLandNames(city),
      ]);
      rss.forEach(name => rawScrapedItems.push({ name, city, source: 'RSS' }));
      ifood.forEach(name => rawScrapedItems.push({ name, city, source: 'iFood' }));
      walker.forEach(name => rawScrapedItems.push({ name, city, source: 'WalkerLand' }));
    } catch (e) {
      // 單城市失敗不中斷
    }
  }

  const existingScraped = await getExistingScrapedNames();
  const allExisting = await getAllPlaces();
  const unique = [...new Map(rawScrapedItems.map(i => [i.name, i])).values()];
  const reallyNew = unique.filter(item =>
    !existingScraped.some(n => isSimilar(n, item.name)) &&
    !allExisting.some(p => isSimilar(p.name, item.name))
  );

  if (reallyNew.length > 0) await appendScrapedNames(reallyNew);
  console.log(c.green(`\n  ✅ 食記佇列新增 ${reallyNew.length} 筆`));

  // ── 3. 結果摘要 ───────────────────────────────────────────
  const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
  console.log(c.bold(c.cyan('\n══════════════════════════════')));
  console.log(c.bold('📊 執行結果'));
  console.log(c.bold(c.cyan('══════════════════════════════')));
  console.log(`正式地圖新增: ${c.green(c.bold(String(summary.total)))} 筆`);
  Object.entries(summary.byType).forEach(([t, n]) => n > 0 && console.log(`  ${t}: ${n}`));
  console.log(`食記佇列新增: ${c.green(String(reallyNew.length))} 筆`);
  if (summary.errors.length) summary.errors.forEach(e => console.log(c.red(`  ⚠️  ${e}`)));
  console.log(`耗時: ${elapsed} 分鐘\n`);
}

main().catch(err => {
  console.error('執行失敗:', err);
  process.exit(1);
});
