import { google } from 'googleapis';
import { config } from '../config.js';
import type { Place } from '../types.js';

const HEADERS = [
  'place_id', 'name', 'type', 'cuisine', 'rating', 'reviews',
  'address', 'lat', 'lng', 'source', 'url', 'added_at', 'synced',
];

const QUEUE_HEADERS = ['name', 'city', 'source', 'added_at'];
const QUEUE_TAB_NAME = 'scraped_queue';

// ... (getAuth and getSheets remain same)

export async function bootstrapSheet(): Promise<void> {
  const sheets = await getSheets();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: config.google.sheetsId,
  });
  
  // 檢查主分頁
  const tabExists = meta.data.sheets?.some(s => s.properties?.title === config.google.sheetTabName);
  if (!tabExists) {
    await createTab(sheets, config.google.sheetTabName, HEADERS);
  }

  // 檢查爬蟲暫存分頁
  const queueExists = meta.data.sheets?.some(s => s.properties?.title === QUEUE_TAB_NAME);
  if (!queueExists) {
    await createTab(sheets, QUEUE_TAB_NAME, QUEUE_HEADERS);
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
    range: `${config.google.sheetTabName}!A2:M`,
  });
  const rows = res.data.values ?? [];
  return rows.map(r => ({
    place_id: r[0] ?? '',
    name: r[1] ?? '',
    type: r[2] as Place['type'],
    cuisine: r[3] ?? '',
    rating: Number(r[4] ?? 0),
    reviews: Number(r[5] ?? 0),
    address: r[6] ?? '',
    lat: Number(r[7] ?? 0),
    lng: Number(r[8] ?? 0),
    source: r[9] ?? '',
    url: r[10] ?? '',
    added_at: r[11] ?? '',
    synced: r[12] === 'TRUE',
  }));
}

export async function appendPlaces(places: Place[]): Promise<void> {
  if (places.length === 0) return;
  const sheets = await getSheets();
  const rows = places.map(p => [
    p.place_id, p.name, p.type, p.cuisine,
    p.rating, p.reviews, p.address, p.lat, p.lng,
    p.source, p.url, p.added_at, 'FALSE',
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
    range: `${config.google.sheetTabName}!A2:M`,
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
    range: `${config.google.sheetTabName}!M${i}`,
    values: [['TRUE']],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: config.google.sheetsId,
    requestBody: { valueInputOption: 'RAW', data },
  });
}

function rowToPlace(r: string[]): Place {
  return {
    place_id: r[0] ?? '',
    name: r[1] ?? '',
    type: r[2] as Place['type'],
    cuisine: r[3] ?? '',
    rating: Number(r[4] ?? 0),
    reviews: Number(r[5] ?? 0),
    address: r[6] ?? '',
    lat: Number(r[7] ?? 0),
    lng: Number(r[8] ?? 0),
    source: r[9] ?? '',
    url: r[10] ?? '',
    added_at: r[11] ?? '',
    synced: r[12] === 'TRUE',
  };
}
