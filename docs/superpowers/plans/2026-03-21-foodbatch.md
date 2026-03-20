# FoodBatch Discord Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a Discord Bot that automatically discovers popular restaurants/attractions in Taiwan and syncs them to Google My Maps for mobile browsing.

**Architecture:** Discord.js bot with node-cron scheduler; scrapes Google Places API, iFood.tw, Openrice.com, and RSS feeds daily at 09:00; writes to Google Sheets as source of truth; syncs to Google My Maps via an Apps Script Web App that manipulates the My Maps KML file through Drive API.

**Tech Stack:** Node.js 20, TypeScript, discord.js v14, node-cron, cheerio, rss-parser, googleapis, axios, vitest

---

## File Map

```
FoodBatch/
├── src/
│   ├── index.ts               # Bot entry point — starts client, registers commands, starts scheduler
│   ├── config.ts              # Reads and validates all env vars; exports typed config object
│   ├── types.ts               # Shared TypeScript interfaces (Place, PlaceType, etc.)
│   ├── commands/
│   │   ├── search.ts          # /搜尋 slash command handler
│   │   ├── sync.ts            # /同步 slash command handler
│   │   └── query.ts           # /查詢 slash command handler
│   ├── scrapers/
│   │   ├── rss.ts             # RSS feed fetcher + place name extractor
│   │   ├── ifood.ts           # iFood.tw popular list scraper (Cheerio)
│   │   └── openrice.ts        # Openrice.com scraper (Cheerio)
│   ├── services/
│   │   ├── places.ts          # Google Places API (New) Text Search wrapper
│   │   ├── sheets.ts          # Google Sheets read/write + bootstrap
│   │   └── appsscript.ts      # HTTP POST trigger to Apps Script Web App
│   ├── utils/
│   │   ├── classify.ts        # Maps Places API type strings → Chinese cuisine labels
│   │   └── dedup.ts           # Checks place_id against existing Sheet data
│   └── scheduler.ts           # node-cron daily job: runs all sources + writes Sheet + triggers sync
├── apps-script/
│   └── sync-to-mymap.gs       # Google Apps Script: reads Sheet, writes KML to My Maps Drive file
├── tests/
│   ├── utils/
│   │   ├── classify.test.ts
│   │   └── dedup.test.ts
│   └── services/
│       └── places.test.ts
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── fly.toml
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `fly.toml`
- Create: `vitest.config.ts`

- [x] **Step 1: Initialise git repo and install dependencies**

```bash
cd C:/Users/c1471/Desktop/FoodBatch
git init
npm init -y
npm install discord.js @discordjs/rest @discordjs/builders node-cron cheerio rss-parser googleapis axios dotenv
npm install -D typescript tsx vitest @types/node
```

- [x] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [x] **Step 3: Update package.json scripts**

Add to the `scripts` section:
```json
{
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Also set `"type": "module"` in package.json root.

- [x] **Step 4: Write .gitignore**

```
node_modules/
dist/
.env
*.js.map
```

- [x] **Step 5: Write .env.example**

```
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_SUMMARY_CHANNEL_ID=

GOOGLE_API_KEY=
GOOGLE_SHEETS_ID=
GOOGLE_SHEET_TAB_NAME=places
GOOGLE_SERVICE_ACCOUNT_JSON=

APPS_SCRIPT_WEBHOOK_URL=
APPS_SCRIPT_SECRET=
MY_MAPS_FILE_ID=
```

- [x] **Step 6: Write fly.toml**

The bot is a Discord WebSocket client with no HTTP server, so no `[[services]]` block is needed.

```toml
app = "foodbatch-bot"
primary_region = "nrt"

[build]

[env]
  NODE_ENV = "production"
```

- [x] **Step 7: Write vitest.config.ts**

Required for ESM + NodeNext module resolution to work with vitest.

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [x] **Step 8: Commit scaffold**

```bash
git add .
git commit -m "feat: 初始化專案結構與依賴套件"
```

---

## Task 2: Types and Config

**Files:**
- Create: `src/types.ts`
- Create: `src/config.ts`

- [x] **Step 1: Write src/types.ts**

```typescript
export type PlaceType = '餐廳' | '咖啡廳' | '景點' | '夜市';

export interface Place {
  place_id: string;
  name: string;
  type: PlaceType;
  cuisine: string;
  rating: number;
  reviews: number;
  address: string;
  lat: number;
  lng: number;
  source: string;
  url: string;
  added_at: string; // ISO datetime string
  synced: boolean;
}

export interface SearchOptions {
  type: PlaceType;
  location: string;
  cuisine?: string;
}

export interface RunSummary {
  total: number;
  byType: Record<PlaceType, number>;
  errors: string[];
}
```

- [x] **Step 2: Write src/config.ts**

```typescript
import 'dotenv/config';

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  discord: {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    summaryChannelId: required('DISCORD_SUMMARY_CHANNEL_ID'),
  },
  google: {
    apiKey: required('GOOGLE_API_KEY'),
    sheetsId: required('GOOGLE_SHEETS_ID'),
    sheetTabName: process.env['GOOGLE_SHEET_TAB_NAME'] ?? 'places',
    serviceAccountJson: required('GOOGLE_SERVICE_ACCOUNT_JSON'),
  },
  appsScript: {
    webhookUrl: required('APPS_SCRIPT_WEBHOOK_URL'),
    secret: required('APPS_SCRIPT_SECRET'),
    myMapsFileId: required('MY_MAPS_FILE_ID'),
  },
};
```

- [x] **Step 3: Commit**

```bash
git add src/types.ts src/config.ts
git commit -m "feat: 新增共用型別與設定模組"
```

---

## Task 3: classify Utility (TDD)

**Files:**
- Create: `src/utils/classify.ts`
- Create: `tests/utils/classify.test.ts`

- [x] **Step 1: Write failing tests**

```typescript
// tests/utils/classify.test.ts
import { describe, it, expect } from 'vitest';
import { classifyCuisine } from '../../src/utils/classify.js';

describe('classifyCuisine', () => {
  it('maps japanese_restaurant to 日式', () => {
    expect(classifyCuisine(['japanese_restaurant', 'restaurant'])).toBe('日式');
  });
  it('maps hot_pot_restaurant to 火鍋', () => {
    expect(classifyCuisine(['hot_pot_restaurant'])).toBe('火鍋');
  });
  it('maps hamburger_restaurant to 漢堡', () => {
    expect(classifyCuisine(['hamburger_restaurant'])).toBe('漢堡');
  });
  it('returns 其他 for unknown types', () => {
    expect(classifyCuisine(['restaurant', 'food'])).toBe('其他');
  });
  it('returns empty string for non-restaurant', () => {
    expect(classifyCuisine(['tourist_attraction'])).toBe('');
  });
  it('prioritises first known cuisine match', () => {
    expect(classifyCuisine(['sushi_restaurant', 'japanese_restaurant'])).toBe('壽司');
  });
});
```

- [x] **Step 2: Run to confirm failure**

```bash
npm test -- tests/utils/classify.test.ts
```
Expected: FAIL — `classifyCuisine` not found

- [x] **Step 3: Implement src/utils/classify.ts**

```typescript
const CUISINE_MAP: Record<string, string> = {
  japanese_restaurant: '日式',
  korean_restaurant: '韓式',
  chinese_restaurant: '中式',
  american_restaurant: '美式',
  hamburger_restaurant: '漢堡',
  ramen_restaurant: '拉麵',
  sushi_restaurant: '壽司',
  hot_pot_restaurant: '火鍋',
  barbecue_restaurant: '燒烤/燒肉',
  italian_restaurant: '義式',
  thai_restaurant: '泰式',
  vietnamese_restaurant: '越式',
  seafood_restaurant: '海鮮',
  steak_house: '牛排',
  dessert_shop: '甜點',
};

const RESTAURANT_TYPES = new Set([
  'restaurant', 'food', ...Object.keys(CUISINE_MAP),
]);

export function classifyCuisine(types: string[]): string {
  // If no restaurant-like type present, this is not a restaurant
  const isRestaurant = types.some(t => RESTAURANT_TYPES.has(t));
  if (!isRestaurant) return '';

  for (const t of types) {
    if (CUISINE_MAP[t]) return CUISINE_MAP[t];
  }
  return '其他';
}
```

- [x] **Step 4: Run tests to confirm pass**

```bash
npm test -- tests/utils/classify.test.ts
```
Expected: 6 passing

- [x] **Step 5: Commit**

```bash
git add src/utils/classify.ts tests/utils/classify.test.ts
git commit -m "feat: 新增料理類型分類工具（TDD）"
```

---

## Task 4: dedup Utility (TDD)

**Files:**
- Create: `src/utils/dedup.ts`
- Create: `tests/utils/dedup.test.ts`

- [x] **Step 1: Write failing tests**

```typescript
// tests/utils/dedup.test.ts
import { describe, it, expect } from 'vitest';
import { filterNewPlaces } from '../../src/utils/dedup.js';
import type { Place } from '../../src/types.js';

const existing: Place[] = [
  { place_id: 'abc123' } as Place,
  { place_id: 'def456' } as Place,
];

describe('filterNewPlaces', () => {
  it('removes places already in existing list', () => {
    const candidates = [{ place_id: 'abc123' } as Place, { place_id: 'new001' } as Place];
    expect(filterNewPlaces(candidates, existing)).toHaveLength(1);
    expect(filterNewPlaces(candidates, existing)[0]!.place_id).toBe('new001');
  });

  it('returns all if none are duplicates', () => {
    const candidates = [{ place_id: 'new001' } as Place];
    expect(filterNewPlaces(candidates, existing)).toHaveLength(1);
  });

  it('returns empty array if all are duplicates', () => {
    const candidates = [{ place_id: 'abc123' } as Place];
    expect(filterNewPlaces(candidates, existing)).toHaveLength(0);
  });

  it('handles empty existing list', () => {
    const candidates = [{ place_id: 'abc123' } as Place];
    expect(filterNewPlaces(candidates, [])).toHaveLength(1);
  });
});
```

- [x] **Step 2: Run to confirm failure**

```bash
npm test -- tests/utils/dedup.test.ts
```

- [x] **Step 3: Implement src/utils/dedup.ts**

```typescript
import type { Place } from '../types.js';

export function filterNewPlaces(candidates: Place[], existing: Place[]): Place[] {
  const existingIds = new Set(existing.map(p => p.place_id));
  return candidates.filter(p => !existingIds.has(p.place_id));
}
```

- [x] **Step 4: Run tests to confirm pass**

```bash
npm test -- tests/utils/dedup.test.ts
```
Expected: 4 passing

- [x] **Step 5: Commit**

```bash
git add src/utils/dedup.ts tests/utils/dedup.test.ts
git commit -m "feat: 新增去重工具（TDD）"
```

---

## Task 5: Google Sheets Service

**Files:**
- Create: `src/services/sheets.ts`

- [x] **Step 1: Write src/services/sheets.ts**

```typescript
import { google } from 'googleapis';
import { config } from '../config.js';
import type { Place } from '../types.js';

const HEADERS = [
  'place_id', 'name', 'type', 'cuisine', 'rating', 'reviews',
  'address', 'lat', 'lng', 'source', 'url', 'added_at', 'synced',
];

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
  const tabExists = meta.data.sheets?.some(
    s => s.properties?.title === config.google.sheetTabName
  );
  if (!tabExists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.google.sheetsId,
      requestBody: {
        requests: [{
          addSheet: { properties: { title: config.google.sheetTabName } },
        }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.sheetsId,
      range: `${config.google.sheetTabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
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
```

- [x] **Step 2: Commit**

```bash
git add src/services/sheets.ts
git commit -m "feat: 新增 Google Sheets 服務（bootstrap、讀寫、同步狀態）"
```

---

## Task 6: Google Places Service

**Files:**
- Create: `src/services/places.ts`
- Create: `tests/services/places.test.ts`

- [x] **Step 1: Write failing test**

```typescript
// tests/services/places.test.ts
import { describe, it, expect, vi } from 'vitest';
import axios from 'axios';
import { searchPlaces } from '../../src/services/places.js';

vi.mock('axios');

describe('searchPlaces', () => {
  it('returns empty array when API returns no results', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { places: [] } });
    const results = await searchPlaces({ type: '餐廳', location: '台北' });
    expect(results).toHaveLength(0);
  });

  it('filters out results below rating threshold', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        places: [
          { id: 'p1', displayName: { text: '好吃館' }, rating: 3.5, userRatingCount: 200,
            formattedAddress: '台北市', location: { latitude: 25.0, longitude: 121.5 },
            types: ['chinese_restaurant'], googleMapsUri: 'https://maps.google.com/?cid=p1' },
        ],
      },
    });
    const results = await searchPlaces({ type: '餐廳', location: '台北' });
    expect(results).toHaveLength(0); // 3.5 < 4.0 threshold
  });

  it('maps cuisine type correctly', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        places: [
          { id: 'p2', displayName: { text: '火鍋天堂' }, rating: 4.5, userRatingCount: 500,
            formattedAddress: '台北市中山區', location: { latitude: 25.05, longitude: 121.52 },
            types: ['hot_pot_restaurant', 'restaurant'], googleMapsUri: 'https://maps.google.com/?cid=p2' },
        ],
      },
    });
    const results = await searchPlaces({ type: '餐廳', location: '台北' });
    expect(results).toHaveLength(1);
    expect(results[0]!.cuisine).toBe('火鍋');
  });
});
```

- [x] **Step 2: Run to confirm failure**

```bash
npm test -- tests/services/places.test.ts
```

- [x] **Step 3: Implement src/services/places.ts**

```typescript
import axios from 'axios';
import { config } from '../config.js';
import { classifyCuisine } from '../utils/classify.js';
import type { Place, PlaceType, SearchOptions } from '../types.js';

const PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';

const TYPE_QUERY: Record<PlaceType, string> = {
  '餐廳': '熱門餐廳',
  '咖啡廳': '熱門咖啡廳',
  '景點': '熱門景點',
  '夜市': '夜市',
};

const RATING_THRESHOLD = 4.0;
const REVIEW_THRESHOLD = 100;
const REQUEST_DELAY_MS = 300;

export async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function searchPlaces(opts: SearchOptions): Promise<Place[]> {
  const query = opts.cuisine
    ? `${opts.cuisine} ${opts.location}`
    : `${opts.location} ${TYPE_QUERY[opts.type]}`;

  const res = await axios.post(
    PLACES_API_URL,
    { textQuery: query, maxResultCount: 20, languageCode: 'zh-TW' },
    {
      params: { key: config.google.apiKey },
      headers: {
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.location,places.types,places.googleMapsUri',
      },
    }
  );

  const raw: RawPlace[] = res.data.places ?? [];

  await sleep(REQUEST_DELAY_MS);

  return raw
    .filter(p => p.rating >= RATING_THRESHOLD && p.userRatingCount >= REVIEW_THRESHOLD)
    .map(p => ({
      place_id: p.id,
      name: p.displayName.text,
      type: opts.type,
      cuisine: classifyCuisine(p.types),
      rating: p.rating,
      reviews: p.userRatingCount,
      address: p.formattedAddress,
      lat: p.location.latitude,
      lng: p.location.longitude,
      source: 'Places',
      url: p.googleMapsUri,
      added_at: new Date().toISOString(),
      synced: false,
    }));
}

interface RawPlace {
  id: string;
  displayName: { text: string };
  rating: number;
  userRatingCount: number;
  formattedAddress: string;
  location: { latitude: number; longitude: number };
  types: string[];
  googleMapsUri: string;
}
```

- [x] **Step 4: Run tests to confirm pass**

```bash
npm test -- tests/services/places.test.ts
```
Expected: 3 passing

- [x] **Step 5: Commit**

```bash
git add src/services/places.ts tests/services/places.test.ts
git commit -m "feat: 新增 Google Places API 服務（TDD）"
```

---

## Task 7: RSS Scraper

**Files:**
- Create: `src/scrapers/rss.ts`

- [x] **Step 1: Write src/scrapers/rss.ts**

```typescript
import Parser from 'rss-parser';
import { searchPlaces } from '../services/places.js';
import type { Place } from '../types.js';

const RSS_FEEDS = [
  { url: 'https://www.setn.com/rss.aspx?NewsType=5', name: '三立美食' },
  { url: 'https://www.ettoday.net/news/food/rss2.xml', name: 'ETtoday美食' },
  { url: 'https://www.setn.com/rss.aspx?NewsType=97', name: '食尚玩家' },
];

const parser = new Parser();

// Simple name similarity: check if candidate contains query (case-insensitive, ignores spaces)
function isSimilar(candidate: string, query: string): boolean {
  const norm = (s: string) => s.replace(/\s/g, '').toLowerCase();
  return norm(candidate).includes(norm(query)) || norm(query).includes(norm(candidate));
}

// Extract potential place names from RSS item titles using simple heuristics
function extractPlaceNames(title: string): string[] {
  // Match Chinese text patterns that look like place/store names (2-8 chars, often followed by 、，)
  const matches = title.match(/[\u4e00-\u9fa5]{2,10}(?:餐廳|小館|美食|咖啡|夜市|市場|名店|老店)?/g);
  return [...new Set(matches ?? [])];
}

export async function scrapeRssPlaces(city: string): Promise<Place[]> {
  const results: Place[] = [];

  for (const feed of RSS_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      const recentItems = parsed.items.slice(0, 20);

      for (const item of recentItems) {
        const names = extractPlaceNames(item.title ?? '');
        for (const name of names) {
          try {
            // Pass name + city as the text query so Places API resolves the specific place
            const places = await searchPlaces({ type: '餐廳', location: `${name} ${city}` });
            // Take the first result if its name is similar to what we searched for
            const match = places.find(p => isSimilar(p.name, name) && p.rating >= 3.5);
            if (match) {
              results.push({ ...match, source: feed.name });
            }
          } catch {
            // Individual lookup failure is non-fatal
          }
        }
      }
    } catch (err) {
      console.warn(`[RSS] ${feed.name} 抓取失敗:`, (err as Error).message);
    }
  }

  return results;
}
```

- [x] **Step 2: Commit**

```bash
git add src/scrapers/rss.ts
git commit -m "feat: 新增 RSS 爬蟲（食尚玩家、ETtoday、三立）"
```

---

## Task 8: iFood and Openrice Scrapers

**Files:**
- Create: `src/scrapers/ifood.ts`
- Create: `src/scrapers/openrice.ts`

- [x] **Step 1: Write src/scrapers/ifood.ts**

```typescript
import * as cheerio from 'cheerio';
import axios from 'axios';
import { searchPlaces } from '../services/places.js';
import type { Place } from '../types.js';

const IFOOD_URL = 'https://www.ifoodie.tw/explore/台北市/restaurant';

function isSimilar(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s/g, '').toLowerCase();
  return norm(a).includes(norm(b)) || norm(b).includes(norm(a));
}

export async function scrapeIFood(city: string): Promise<Place[]> {
  try {
    const url = `https://www.ifoodie.tw/explore/${encodeURIComponent(city)}/restaurant`;
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FoodBot/1.0)' },
      timeout: 10000,
    });
    const $ = cheerio.load(res.data as string);

    const names: string[] = [];
    // iFood restaurant card titles — selector may need updating if DOM changes
    $('h2.restaurant-name, .title, [class*="name"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length >= 2 && text.length <= 15) names.push(text);
    });

    const results: Place[] = [];
    for (const name of names.slice(0, 30)) {
      try {
        // Pass name + city as text query to resolve the specific place
        const places = await searchPlaces({ type: '餐廳', location: `${name} ${city}` });
        const match = places.find(p => isSimilar(p.name, name));
        if (match) results.push({ ...match, source: 'iFood' });
      } catch {
        // non-fatal
      }
    }
    return results;
  } catch (err) {
    console.warn('[iFood] 抓取失敗:', (err as Error).message);
    return [];
  }
}
```

- [x] **Step 2: Write src/scrapers/openrice.ts**

```typescript
import * as cheerio from 'cheerio';
import axios from 'axios';
import { searchPlaces } from '../services/places.js';
import type { Place } from '../types.js';

function isSimilar(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s/g, '').toLowerCase();
  return norm(a).includes(norm(b)) || norm(b).includes(norm(a));
}

export async function scrapeOpenrice(city: string): Promise<Place[]> {
  try {
    const url = `https://www.openrice.com/zh/taiwan/restaurants?where=${encodeURIComponent(city)}`;
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FoodBot/1.0)' },
      timeout: 10000,
    });
    const $ = cheerio.load(res.data as string);

    const names: string[] = [];
    // Openrice restaurant name selector — may need updating if DOM changes
    $('[class*="restaurant-name"], [class*="title"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length >= 2 && text.length <= 20) names.push(text);
    });

    const results: Place[] = [];
    for (const name of [...new Set(names)].slice(0, 20)) {
      try {
        // Pass name + city as text query to resolve the specific place
        const places = await searchPlaces({ type: '餐廳', location: `${name} ${city}` });
        const match = places.find(p => isSimilar(p.name, name));
        if (match) results.push({ ...match, source: 'Openrice' });
      } catch {
        // non-fatal
      }
    }
    return results;
  } catch (err) {
    console.warn('[Openrice] 抓取失敗:', (err as Error).message);
    return [];
  }
}
```

- [x] **Step 3: Commit**

```bash
git add src/scrapers/ifood.ts src/scrapers/openrice.ts
git commit -m "feat: 新增 iFood 與 Openrice 爬蟲"
```

---

## Task 9: Apps Script Trigger Service

**Files:**
- Create: `src/services/appsscript.ts`
- Create: `apps-script/sync-to-mymap.gs`

- [x] **Step 1: Write src/services/appsscript.ts**

```typescript
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
    console.error('[AppsScript] 同步失敗:', msg);
    return { synced: 0, error: msg };
  }
}
```

- [x] **Step 2: Write apps-script/sync-to-mymap.gs**

```javascript
// Deploy as: Execute as = Me, Who has access = Anyone
// Set APPS_SCRIPT_SECRET and SHEET_ID in Script Properties

const SECRET = PropertiesService.getScriptProperties().getProperty('APPS_SCRIPT_SECRET');
const SHEET_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
const MY_MAPS_FILE_ID = PropertiesService.getScriptProperties().getProperty('MY_MAPS_FILE_ID');
const TAB_NAME = 'places';

const LAYER_COLORS = {
  '餐廳': 'red',
  '咖啡廳': 'orange',
  '景點': 'blue',
  '夜市': 'yellow',
};

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.token !== SECRET) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  const syncedCol = headers.indexOf('synced');
  const placeIdCol = headers.indexOf('place_id');
  const nameCol = headers.indexOf('name');
  const typeCol = headers.indexOf('type');
  const cuisineCol = headers.indexOf('cuisine');
  const ratingCol = headers.indexOf('rating');
  const reviewsCol = headers.indexOf('reviews');
  const latCol = headers.indexOf('lat');
  const lngCol = headers.indexOf('lng');
  const urlCol = headers.indexOf('url');

  const unsyncedRows = rows
    .map((r, i) => ({ row: r, rowNum: i + 2 }))
    .filter(({ row }) => row[syncedCol] !== true && row[syncedCol] !== 'TRUE');

  if (unsyncedRows.length === 0) {
    return ContentService.createTextOutput(JSON.stringify({ synced: 0 }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Read My Maps KML file
  const file = DriveApp.getFileById(MY_MAPS_FILE_ID);
  let kml = file.getBlob().getDataAsString();

  for (const { row, rowNum } of unsyncedRows) {
    const type = row[typeCol];
    const name = row[nameCol];
    const lat = row[latCol];
    const lng = row[lngCol];
    const rating = row[ratingCol];
    const reviews = row[reviewsCol];
    const cuisine = row[cuisineCol];
    const url = row[urlCol];

    const description = [
      cuisine ? `料理類型：${cuisine}` : '',
      `評分：${rating} ⭐ (${reviews} 則評論)`,
      `來源：<a href="${url}">查看地點</a>`,
    ].filter(Boolean).join('\n');

    const placemark = `
    <Placemark>
      <name>${escapeXml(name)}</name>
      <description>${escapeXml(description)}</description>
      <Point><coordinates>${lng},${lat},0</coordinates></Point>
    </Placemark>`;

    // Insert into the correct folder by type
    const folderTag = `<Folder><name>${type}</name>`;
    if (kml.includes(folderTag)) {
      kml = kml.replace(folderTag, folderTag + placemark);
    }
  }

  // Write back to Drive
  file.setContent(kml);

  // Mark rows as synced
  for (const { rowNum } of unsyncedRows) {
    sheet.getRange(rowNum, syncedCol + 1).setValue(true);
  }

  return ContentService.createTextOutput(JSON.stringify({ synced: unsyncedRows.length }))
    .setMimeType(ContentService.MimeType.JSON);
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

- [x] **Step 3: Commit**

```bash
git add src/services/appsscript.ts apps-script/sync-to-mymap.gs
git commit -m "feat: 新增 Apps Script 觸發服務與 My Maps KML 同步腳本"
```

---

## Task 10: Scheduler

**Files:**
- Create: `src/scheduler.ts`

- [x] **Step 1: Write src/scheduler.ts**

```typescript
import cron from 'node-cron';
import { Client } from 'discord.js';
import { searchPlaces } from './services/places.js';
import { scrapeRssPlaces } from './scrapers/rss.js';
import { scrapeIFood } from './scrapers/ifood.js';
import { scrapeOpenrice } from './scrapers/openrice.js';
import { getAllPlaces, appendPlaces } from './services/sheets.js';
import { triggerSync } from './services/appsscript.js';
import { filterNewPlaces } from './utils/dedup.js';
import { config } from './config.js';
import type { Place, PlaceType, RunSummary } from './types.js';

const CITIES = ['台北', '台中', '高雄', '台南', '新北'];
const TYPES: PlaceType[] = ['餐廳', '咖啡廳', '景點', '夜市'];

export async function runDailyJob(client: Client): Promise<RunSummary> {
  const summary: RunSummary = {
    total: 0,
    byType: { '餐廳': 0, '咖啡廳': 0, '景點': 0, '夜市': 0 },
    errors: [],
  };

  const existing = await getAllPlaces();
  const collected: Place[] = [];

  // 1. Google Places API (primary)
  let quotaExceeded = false;
  outer: for (const city of CITIES) {
    for (const type of TYPES) {
      try {
        const places = await searchPlaces({ type, location: city });
        collected.push(...places);
      } catch (err) {
        const msg = `Places API 失敗 (${city}/${type}): ${(err as Error).message}`;
        summary.errors.push(msg);
        console.error(msg);
        quotaExceeded = true;
        break outer; // Exit both loops — quota likely exceeded
      }
    }
  }

  // 2. RSS sources (supplementary, non-fatal)
  for (const city of CITIES) {
    const rssPlaces = await scrapeRssPlaces(city);
    collected.push(...rssPlaces);
  }

  // 3. iFood (supplementary, non-fatal)
  for (const city of CITIES) {
    const iFoodPlaces = await scrapeIFood(city);
    collected.push(...iFoodPlaces);
  }

  // 4. Openrice (supplementary, non-fatal)
  for (const city of CITIES) {
    const openricePlaces = await scrapeOpenrice(city);
    collected.push(...openricePlaces);
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
```

- [x] **Step 2: Commit**

```bash
git add src/scheduler.ts
git commit -m "feat: 新增每日排程任務（Places + RSS + iFood + Openrice）"
```

---

## Task 11: Discord Slash Commands

**Files:**
- Create: `src/commands/search.ts`
- Create: `src/commands/query.ts`
- Create: `src/commands/sync.ts`

- [x] **Step 1: Write src/commands/search.ts**

```typescript
import {
  ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder,
} from 'discord.js';
import { searchPlaces } from '../services/places.js';
import { getAllPlaces, appendPlaces } from '../services/sheets.js';
import { filterNewPlaces } from '../utils/dedup.js';
import type { PlaceType } from '../types.js';

export const data = new SlashCommandBuilder()
  .setName('搜尋')
  .setDescription('搜尋並新增地點到美食地圖')
  .addStringOption(o => o.setName('類型').setDescription('地點類型').setRequired(true)
    .addChoices(
      { name: '餐廳', value: '餐廳' },
      { name: '咖啡廳', value: '咖啡廳' },
      { name: '景點', value: '景點' },
      { name: '夜市', value: '夜市' },
    ))
  .addStringOption(o => o.setName('地點').setDescription('城市或地區，例如：台北、信義區').setRequired(true))
  .addStringOption(o => o.setName('料理類型').setDescription('例如：火鍋、漢堡（僅餐廳）').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const type = interaction.options.getString('類型', true) as PlaceType;
  const location = interaction.options.getString('地點', true);
  const cuisine = interaction.options.getString('料理類型') ?? undefined;

  try {
    const [found, existing] = await Promise.all([
      searchPlaces({ type, location, cuisine }),
      getAllPlaces(),
    ]);
    const newPlaces = filterNewPlaces(found, existing);

    if (newPlaces.length === 0) {
      await interaction.editReply('沒有找到新地點（可能已在地圖中）。');
      return;
    }

    await appendPlaces(newPlaces);

    const embed = new EmbedBuilder()
      .setTitle(`新增 ${newPlaces.length} 個${type}`)
      .setColor(0x5865F2)
      .setDescription(
        newPlaces.slice(0, 10).map(p =>
          `**${p.name}** ${p.cuisine ? `(${p.cuisine})` : ''}\n⭐ ${p.rating} · ${p.address}`
        ).join('\n\n')
      )
      .setFooter({ text: '已加入 Google Sheet，輸入 /同步 更新地圖' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply(`搜尋失敗：${(err as Error).message}`);
  }
}
```

- [x] **Step 2: Write src/commands/query.ts**

```typescript
import {
  ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder,
} from 'discord.js';
import { getAllPlaces } from '../services/sheets.js';
import type { PlaceType } from '../types.js';

export const data = new SlashCommandBuilder()
  .setName('查詢')
  .setDescription('查看最近新增的地點')
  .addStringOption(o => o.setName('類型').setDescription('地點類型').setRequired(true)
    .addChoices(
      { name: '餐廳', value: '餐廳' },
      { name: '咖啡廳', value: '咖啡廳' },
      { name: '景點', value: '景點' },
      { name: '夜市', value: '夜市' },
    ))
  .addIntegerOption(o => o.setName('數量').setDescription('筆數（預設10，最多25）')
    .setMinValue(1).setMaxValue(25).setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const type = interaction.options.getString('類型', true) as PlaceType;
  const count = Math.min(interaction.options.getInteger('數量') ?? 10, 25);

  try {
    const all = await getAllPlaces();
    const filtered = all
      .filter(p => p.type === type)
      .sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime())
      .slice(0, count);

    if (filtered.length === 0) {
      await interaction.editReply(`目前沒有${type}資料。`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`最近 ${filtered.length} 個${type}`)
      .setColor(0x57F287)
      .setDescription(
        filtered.map((p, i) =>
          `**${i + 1}. ${p.name}** ${p.cuisine ? `(${p.cuisine})` : ''}\n⭐ ${p.rating} · ${p.address}`
        ).join('\n\n')
      );

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply(`查詢失敗：${(err as Error).message}`);
  }
}
```

- [x] **Step 3: Write src/commands/sync.ts**

```typescript
import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { triggerSync } from '../services/appsscript.js';

export const data = new SlashCommandBuilder()
  .setName('同步')
  .setDescription('手動將 Google Sheet 資料同步到 My Maps');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const result = await triggerSync();

  if (result.error) {
    await interaction.editReply(`同步失敗：${result.error}`);
  } else {
    await interaction.editReply(`同步完成！新增 ${result.synced} 個地圖標記。`);
  }
}
```

- [x] **Step 4: Commit**

```bash
git add src/commands/
git commit -m "feat: 新增 /搜尋、/查詢、/同步 指令"
```

---

## Task 12: Bot Entry Point + Command Registration

**Files:**
- Create: `src/index.ts`

- [x] **Step 1: Write src/index.ts**

```typescript
import 'dotenv/config';
import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { bootstrapSheet } from './services/sheets.js';
import { startScheduler } from './scheduler.js';
import * as searchCmd from './commands/search.js';
import * as queryCmd from './commands/query.js';
import * as syncCmd from './commands/sync.js';

const commands = [searchCmd, queryCmd, syncCmd];

async function registerCommands() {
  const rest = new REST().setToken(config.discord.token);
  await rest.put(Routes.applicationCommands(config.discord.clientId), {
    body: commands.map(c => c.data.toJSON()),
  });
  console.log('[Bot] Slash commands 已註冊');
}

async function main() {
  await bootstrapSheet();
  await registerCommands();

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  const commandMap = new Collection<string, typeof commands[0]>();
  for (const cmd of commands) {
    commandMap.set(cmd.data.name, cmd);
  }

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const cmd = commandMap.get(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction);
    } catch (err) {
      console.error(`[Bot] 指令錯誤 (${interaction.commandName}):`, err);
    }
  });

  client.once(Events.ClientReady, c => {
    console.log(`[Bot] 已登入為 ${c.user.tag}`);
    startScheduler(client);
  });

  await client.login(config.discord.token);
}

main().catch(err => {
  console.error('[Bot] 啟動失敗:', err);
  process.exit(1);
});
```

- [x] **Step 2: Verify build compiles**

```bash
npm run build
```
Expected: No TypeScript errors, `dist/` directory created.

- [x] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: 新增 Bot 入口點與指令註冊"
```

---

## Task 13: Environment Setup & Smoke Test

- [x] **Step 1: Copy .env.example to .env and fill in values**

Follow these steps to get each value:
1. `DISCORD_TOKEN` + `DISCORD_CLIENT_ID`: Discord Developer Portal → Your App → Bot
2. `DISCORD_SUMMARY_CHANNEL_ID`: Right-click channel in Discord → Copy Channel ID
3. `GOOGLE_API_KEY`: Google Cloud Console → APIs & Services → Credentials → Create API Key → Enable "Places API (New)"
4. `GOOGLE_SHEETS_ID`: Create a new Google Sheet → copy ID from URL
5. `GOOGLE_SERVICE_ACCOUNT_JSON`: Google Cloud Console → IAM → Service Accounts → Create → Download JSON → share the Google Sheet with the service account email
6. `APPS_SCRIPT_WEBHOOK_URL` + `APPS_SCRIPT_SECRET` + `MY_MAPS_FILE_ID`: See Task 14

- [x] **Step 2: Run all unit tests**

```bash
npm test
```
Expected: All tests pass.

- [x] **Step 3: Run in dev mode to verify bot comes online**

```bash
npm run dev
```
Expected: `[Bot] 已登入為 YourBot#1234`

---

## Task 14: Google Apps Script Deployment

- [x] **Step 1: Create Google My Maps**

1. Go to `https://www.google.com/maps/d/`
2. Create a new map
3. Add 4 layers: 餐廳, 咖啡廳, 景點, 夜市
4. Get the file ID from the share URL: `https://www.google.com/maps/d/edit?mid=XXXXXXX` — `XXXXXXX` is your `MY_MAPS_FILE_ID`

- [x] **Step 2: Deploy Apps Script**

1. Go to `https://script.google.com/`
2. Create new project → paste contents of `apps-script/sync-to-mymap.gs`
3. Project Settings → Script Properties → Add:
   - `APPS_SCRIPT_SECRET` = same value as in `.env`
   - `SHEET_ID` = same as `GOOGLE_SHEETS_ID`
   - `MY_MAPS_FILE_ID` = from Step 1
4. Deploy → New deployment → Web App → Execute as: Me → Anyone → Deploy
5. Copy the deployment URL → set as `APPS_SCRIPT_WEBHOOK_URL` in `.env`

- [x] **Step 3: Test sync manually**

> Note: `ContentService` in Apps Script cannot set HTTP status codes, so an invalid token returns `{ error: 'Unauthorized' }` with HTTP 200 (not 403). The Node.js client checks the response body for an error field.

```bash
# With .env filled in (requires "type": "module" in package.json):
node --input-type=module -e "
import { config } from './src/config.js';
import { triggerSync } from './src/services/appsscript.js';
triggerSync().then(console.log);
"
```
Expected: `{ synced: 0 }` (no data yet, no error)

---

## Task 15: Final Integration Test & Deploy

- [x] **Step 1: Run a manual scheduler job**

```bash
node --input-type=module -e "
import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { runDailyJob } from './src/scheduler.js';
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.login(process.env.DISCORD_TOKEN).then(() => runDailyJob(client)).then(console.log);
"
```

- [x] **Step 2: Verify in Google Sheet that rows were added**

Open the Google Sheet — should see new rows with `synced=FALSE`.

- [x] **Step 3: Verify in Discord that /搜尋 works**

In Discord, type `/搜尋 類型:餐廳 地點:台北`

- [x] **Step 4: Deploy to Fly.io**

```bash
# Install Fly CLI if not installed
curl -L https://fly.io/install.sh | sh

flyctl auth login
flyctl launch --name foodbatch-bot --region nrt --no-deploy

# Set all env vars as secrets
flyctl secrets set DISCORD_TOKEN="..." DISCORD_CLIENT_ID="..." # etc.

flyctl deploy
```

- [x] **Step 5: Final commit**

```bash
git add .
git commit -m "feat: 完成 FoodBatch Discord Bot 初版實作"
```

---

## Summary

| Task | Description | Est. Complexity |
|------|-------------|-----------------|
| 1 | Project scaffold | Low |
| 2 | Types + config | Low |
| 3 | classify util (TDD) | Low |
| 4 | dedup util (TDD) | Low |
| 5 | Sheets service | Medium |
| 6 | Places service (TDD) | Medium |
| 7 | RSS scraper | Medium |
| 8 | iFood + Openrice | Medium |
| 9 | Scheduler | Medium |
| 10 | slash commands | Medium |
| 11 | Bot entry point | Low |
| 12 | Google setup | Low |
| 13 | Apps Script deploy | Medium |
| 14 | Integration + deploy | Medium |
