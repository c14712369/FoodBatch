import { google } from 'googleapis';
import { config } from '../config.js';
import type { Place } from '../types.js';

const HEADERS = [
  'country', 'region', 'name', 'type', 'cuisine', 'url',
  'address', 'rating', 'reviews', 'place_id', 'lat', 'lng', 'added_at', 'synced',
];

const QUEUE_HEADERS = ['name', 'city', 'source', 'added_at'];
const QUEUE_TAB_NAME = 'scraped_queue';

function getAuth() {
  const credentials = JSON.parse(config.google.serviceAccountJson);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheets() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

export async function bootstrapSheet(): Promise<void> {
  const sheets = await getSheets();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: config.google.sheetsId,
  });

  // 檢查主分頁
  const tabExists = meta.data.sheets?.some(s => s.properties?.title === config.google.sheetTabName);
  if (!tabExists) {
    await createTab(sheets, config.google.sheetTabName, HEADERS);
  } else {
    // 分頁存在，但確認 A1 是否為正確的標題列（防止清空後標題消失）
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.sheetsId,
      range: `${config.google.sheetTabName}!A1:A1`,
    });
    const a1 = headerRes.data.values?.[0]?.[0];
    if (a1 !== 'country') {
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.google.sheetsId,
        range: `${config.google.sheetTabName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      });
    }
  }

  // 檢查爬蟲暫存分頁
  const queueExists = meta.data.sheets?.some(s => s.properties?.title === QUEUE_TAB_NAME);
  if (!queueExists) {
    await createTab(sheets, QUEUE_TAB_NAME, QUEUE_HEADERS);
  } else {
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.sheetsId,
      range: `${QUEUE_TAB_NAME}!A1:A1`,
    });
    const a1 = headerRes.data.values?.[0]?.[0];
    if (a1 !== 'name') {
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.google.sheetsId,
        range: `${QUEUE_TAB_NAME}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [QUEUE_HEADERS] },
      });
    }
  }
}

async function createTab(sheets: any, title: string, headers: string[]) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.google.sheetsId,
    requestBody: {
      requests: [{ addSheet: { properties: { title } } }],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.sheetsId,
    range: `${title}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers] },
  });
}

export async function getExistingScrapedNames(): Promise<string[]> {
  const sheets = await getSheets();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.sheetsId,
      range: `${QUEUE_TAB_NAME}!A2:A`, // 只讀取 A 欄 (店名)
    });
    const rows = res.data.values ?? [];
    return rows.map(r => r[0] ?? '').filter(n => n !== '');
  } catch (e) {
    return []; // 如果分頁還不存在，回傳空陣列
  }
}

export async function appendScrapedNames(items: Array<{ name: string, city: string, source: string }>): Promise<void> {
  if (items.length === 0) return;
  const sheets = await getSheets();
  const rows = items.map(item => [
    item.name, item.city, item.source, new Date().toISOString()
  ]);
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.sheetsId,
    range: `${QUEUE_TAB_NAME}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
}

export async function getAllPlaces(): Promise<Place[]> {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetsId,
    range: `${config.google.sheetTabName}!A2:N`,
  });
  const rows = res.data.values ?? [];
  return rows.map(r => ({
    country: r[0] ?? '',
    region: r[1] ?? '',
    name: r[2] ?? '',
    type: r[3] as Place['type'],
    cuisine: r[4] ?? '',
    url: r[5] ?? '',
    address: r[6] ?? '',
    rating: Number(r[7] ?? 0),
    reviews: Number(r[8] ?? 0),
    place_id: r[9] ?? '',
    lat: Number(r[10] ?? 0),
    lng: Number(r[11] ?? 0),
    added_at: r[12] ?? '',
    synced: r[13] === 'TRUE',
  }));
}

export async function appendPlaces(places: Place[]): Promise<void> {
  if (places.length === 0) return;
  const sheets = await getSheets();
  const rows = places.map(p => [
    p.country, p.region, p.name, p.type, p.cuisine,
    p.url, p.address, p.rating, p.reviews, p.place_id,
    p.lat, p.lng, p.added_at, 'FALSE',
  ]);
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.sheetsId,
    range: `${config.google.sheetTabName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
}

export async function getUnsyncedPlaces(): Promise<Array<Place & { rowIndex: number }>> {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetsId,
    range: `${config.google.sheetTabName}!A2:N`,
  });
  const rows = res.data.values ?? [];
  return rows
    .map((r, i) => ({ ...rowToPlace(r), rowIndex: i + 2 }))
    .filter(p => !p.synced);
}

export async function markSynced(rowIndexes: number[]): Promise<void> {
  if (rowIndexes.length === 0) return;
  const sheets = await getSheets();
  const data = rowIndexes.map(i => ({
    range: `${config.google.sheetTabName}!N${i}`,
    values: [['TRUE']],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: config.google.sheetsId,
    requestBody: { valueInputOption: 'RAW', data },
  });
}

function rowToPlace(r: string[]): Place {
  return {
    country: r[0] ?? '',
    region: r[1] ?? '',
    name: r[2] ?? '',
    type: r[3] as Place['type'],
    cuisine: r[4] ?? '',
    url: r[5] ?? '',
    address: r[6] ?? '',
    rating: Number(r[7] ?? 0),
    reviews: Number(r[8] ?? 0),
    place_id: r[9] ?? '',
    lat: Number(r[10] ?? 0),
    lng: Number(r[11] ?? 0),
    added_at: r[12] ?? '',
    synced: r[13] === 'TRUE',
  };
}
