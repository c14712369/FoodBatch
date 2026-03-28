import 'dotenv/config';
import { google } from 'googleapis';
import { config } from '../config.js';
import { searchPlaces } from '../services/places.js';
import { getAllPlaces, appendPlaces } from '../services/sheets.js';
import { filterNewPlaces } from '../utils/dedup.js';
import { isSimilar } from '../utils/similarity.js';

const QUEUE_TAB_NAME = 'scraped_queue';

async function getSheets() {
  const credentials = JSON.parse(config.google.serviceAccountJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function processQueue() {
  console.log('[Queue] 讀取待處理店名...');
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetsId,
    range: `${QUEUE_TAB_NAME}!A2:C`,
  });
  const rows = res.data.values ?? [];
  if (rows.length === 0) {
    console.log('[Queue] 隊列為空，無需處理。');
    return;
  }

  const existing = await getAllPlaces();
  const foundPlaces: any[] = [];
  const processedCount = Math.min(rows.length, 50); // 每次處理 50 筆避免配額爆掉

  console.log(`[Queue] 開始處理前 ${processedCount} 筆資料...`);

  for (let i = 0; i < processedCount; i++) {
    const [name, city, source] = rows[i];
    console.log(`[Queue] (${i+1}/${processedCount}) 搜尋: ${name} (${city})`);
    try {
      // 使用店名 + 城市精準搜尋
      const results = await searchPlaces({ type: '餐廳', location: `${name} ${city}` });
      const match = results.find(p => isSimilar(p.name, name));
      if (match) {
        foundPlaces.push(match);
        console.log(`   ✅ 找到地點: ${match.name}`);
      } else {
        console.log(`   ❌ 沒找到符合的地點`);
      }
    } catch (e) {
      console.warn(`   ⚠️ 搜尋失敗:`, (e as Error).message);
    }
    // 稍微延遲避免頻率限制
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 過濾並存入主表
  const newPlaces = filterNewPlaces(foundPlaces, existing);
  if (newPlaces.length > 0) {
    await appendPlaces(newPlaces);
    console.log(`[Queue] 成功新增 ${newPlaces.length} 筆地點至主表！`);
  }

  // 從隊列中移除已處理的資料 (簡單起見，直接刪除前 processedCount 列)
  console.log(`[Queue] 清除隊列中已處理的 ${processedCount} 筆資料...`);
  const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: config.google.sheetsId });
  const queueSheet = sheetMeta.data.sheets?.find(s => s.properties?.title === QUEUE_TAB_NAME);
  if (queueSheet) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.google.sheetsId,
      requestBody: {
        requests: [{
          deleteRange: {
            range: {
              sheetId: queueSheet.properties?.sheetId,
              startRowIndex: 1, // A2
              endRowIndex: processedCount + 1,
            },
            shiftDimension: 'ROWS',
          }
        }]
      }
    });
  }
}

processQueue().catch(console.error);
