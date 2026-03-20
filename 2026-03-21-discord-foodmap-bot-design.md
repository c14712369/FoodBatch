# Discord FoodMap Bot — Design Spec

**Date:** 2026-03-21
**Status:** Approved

---

## 1. Overview

A Discord Bot that automatically discovers and collects popular restaurants, cafes, attractions, and night markets from multiple sources, stores them in Google Sheets, and syncs them to a Google My Maps for easy mobile browsing (especially for finding nearby places on the go).

**Cost:** ~$0/month (within free tiers; see Section 12 for hosting caveat)

---

## 2. Goals

- Automatically discover trending food/attraction spots daily at 09:00
- Support manual on-demand search via Discord Slash Commands
- Categorize places by type (餐廳、咖啡廳、景點、夜市) and cuisine (火鍋、燒肉、漢堡、日式...)
- Store all data in Google Sheets as the source of truth
- Sync to Google My Maps with color-coded layers for mobile use
- Allow users to find nearby places by opening the My Maps link on their phone

---

## 3. Architecture

```
Discord Bot (discord.js, Node.js, hosted on Fly.io)
  |
  |-- Scheduler (node-cron, daily 09:00)
  |     |-- Google Places API (Text Search, primary source)
  |     |-- iFood.tw scraper (台灣熱門美食榜)
  |     |-- Openrice.com scraper (評分推薦)
  |     |-- RSS Feeds (食尚玩家、ETtoday美食、三立美食)
  |
  |-- Slash Commands
  |     |-- /搜尋 <類型> [料理類型] <地點>
  |     |-- /同步
  |     |-- /查詢 <類型>
  |
  |-- Google Sheets API (write new places, mark synced status)
  |
  |-- Apps Script Web App (HTTP trigger → sync Sheet rows to My Maps)
        |-- Google My Maps
              |-- Layer: 餐廳 (red)
              |-- Layer: 咖啡廳 (orange)
              |-- Layer: 景點 (blue)
              |-- Layer: 夜市 (yellow)
```

---

## 4. Data Sources

| Source | Method | Purpose |
|--------|--------|---------|
| Google Places API (New) | API | Primary: actively search by category + location, sorted by rating/review count |
| iFood.tw | Web scraper (Cheerio) | Weekly popular restaurant rankings in Taiwan |
| Openrice.com | Web scraper (Cheerio) | Rated recommendations |
| 食尚玩家 RSS | RSS Parser | TV show featured restaurants (trending) |
| ETtoday 美食 RSS | RSS Parser | Latest viral/trending food spots |
| 三立美食 RSS | RSS Parser | Latest food news |

RSS and scraper sources extract place names/keywords → feed into Places API to get coordinates and full details.

**RSS/Scraper → Places API name resolution:**
1. Use the extracted place name + city context as the Places Text Search query (e.g. `"鼎泰豐 台北"`).
2. Take the first result only if its name similarity score (simple string inclusion check) is above 80% AND rating >= 3.5.
3. If zero results or no confident match: discard the entry and log a warning.
4. If multiple plausible matches: take the highest `reviews` count (most popular branch).

**Scraper ToS and fragility notice:**
iFood.tw and Openrice.com are commercial sites. Scraping may violate their Terms of Service. These scrapers are supplementary only — if either site blocks access or changes its DOM structure, that source is silently skipped and the bot continues with other sources. Scraper failures are logged and reported in the daily Discord summary. These scrapers should be treated as fragile and may require periodic maintenance.

---

## 5. Data Model (Google Sheet)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `place_id` | string | Google Places unique ID (dedup key) | `ChIJN1t_tDeuEmsRUsoyG83frY4` |
| `name` | string | Place name | 鼎泰豐（101店） |
| `type` | enum | Main category | 餐廳 / 咖啡廳 / 景點 / 夜市 |
| `cuisine` | string | Cuisine sub-type (餐廳 only) | 火鍋 / 燒肉 / 漢堡 / 日式 / 台式 |
| `rating` | number | Google rating | 4.6 |
| `reviews` | number | Total review count | 2847 |
| `address` | string | Full address | 台北市信義區松高路194號 |
| `lat` | number | Latitude | 25.0338 |
| `lng` | number | Longitude | 121.5645 |
| `source` | string | Where it was discovered | iFood / Places / ETtoday |
| `url` | string | Source URL or Google Maps link | https://... |
| `added_at` | datetime | When added | 2026-03-21 09:00:00 |
| `synced` | boolean | Synced to My Maps | TRUE / FALSE |

**Deduplication:** `place_id` is checked before insert; existing records are skipped.

**Sheet bootstrapping:** On first run, the bot checks if the target sheet (tab name: `places`) exists. If not, it creates the sheet and writes the header row automatically. The spreadsheet itself must be created manually and its ID set in `GOOGLE_SHEETS_ID`.

---

## 6. Google My Maps Structure

One shared map with four color-coded layers:

- **餐廳** — Red marker. Pin description includes: cuisine type, rating, review count, source link.
- **咖啡廳** — Orange marker. Pin description includes: rating, review count, source link.
- **景點** — Blue marker. Pin description includes: rating, review count, source link.
- **夜市** — Yellow marker. Pin description includes: rating, review count, source link.

Mobile usage: Open My Maps link → opens in Google Maps app → enable location → see nearby colored pins → tap pin to view details.

---

## 7. Cuisine Type Classification

Use Google Places API (New) built-in place types for free classification:

| Places API type | Mapped cuisine |
|-----------------|---------------|
| `japanese_restaurant` | 日式 |
| `korean_restaurant` | 韓式 |
| `chinese_restaurant` | 中式 |
| `american_restaurant` | 美式 |
| `hamburger_restaurant` | 漢堡 |
| `ramen_restaurant` | 拉麵 |
| `sushi_restaurant` | 壽司 |
| `hot_pot_restaurant` | 火鍋 |
| `barbecue_restaurant` | 燒烤/燒肉 |
| `italian_restaurant` | 義式 |
| `thai_restaurant` | 泰式 |
| `vietnamese_restaurant` | 越式 |
| `seafood_restaurant` | 海鮮 |
| `steak_house` | 牛排 |
| `dessert_shop` | 甜點 |
| (no match) | 其他 |

No Claude API needed — fully free.

---

## 8. Discord Slash Commands

### `/搜尋`
Search and add places immediately.

**Parameters:**
- `類型` (required): 餐廳 / 咖啡廳 / 景點 / 夜市
- `地點` (required): e.g. 台北、信義區、台中
- `料理類型` (optional, only for 餐廳): e.g. 火鍋、漢堡

**Response:** Embed showing newly added places with name, rating, address, and a My Maps link.

### `/同步`
Manually trigger sync of all `synced=FALSE` rows in Google Sheet to My Maps.

**Response:** Count of newly synced pins per layer.

### `/查詢`
List recently added places of a given type.

**Parameters:**
- `類型` (required): 餐廳 / 咖啡廳 / 景點 / 夜市
- `數量` (optional, default 10, max 25): Number of results to show, sorted by `added_at` DESC

---

## 9. Scheduler

**Schedule:** Daily at 09:00 (Asia/Taipei timezone)

**Search targets per run:**
- Cities: 台北, 台中, 高雄, 台南, 新北 (expandable)
- Types: 餐廳, 咖啡廳, 景點, 夜市
- Per query: top 20 results (first page only, no pagination), rating >= 4.0, review count >= 100

**Rate limiting:** 300ms delay between consecutive Places API requests (stays well under the 10 QPS limit).

**Estimated API calls per day:**
- Places Text Search: 5 cities × 4 types = 20 requests
- Monthly: ~620 requests → well within $200 free credit

**After run:** Bot posts a summary to the channel specified by `DISCORD_SUMMARY_CHANNEL_ID`:
```
今日新增 12 筆
餐廳 8 | 咖啡廳 2 | 景點 1 | 夜市 1
```

---

## 10. Apps Script Sync

Deployed as a Google Apps Script Web App (doPost endpoint).

**Authentication:** The Discord Bot includes a shared secret in the POST body (`{ token: APPS_SCRIPT_SECRET, ... }`). The Apps Script validates this token before processing any request and returns HTTP 403 if it does not match.

**My Maps write mechanism:**
Google My Maps has no public API. The approach used here is:
1. Google My Maps stores its data as a KML file in Google Drive (MIME type `application/vnd.google-apps.map`).
2. Apps Script opens this file via `DriveApp.getFileById(MY_MAPS_FILE_ID)`, reads the KML content as text, appends new `<Placemark>` elements under the correct `<Folder>` (one folder per layer: 餐廳/咖啡廳/景點/夜市), then saves the file back.
3. This is an unofficial but widely-used community approach. It is a maintenance risk — Google could change the internal format. If it breaks, the fallback is to regenerate the entire KML from the Sheet and overwrite the file.

`MY_MAPS_FILE_ID` is the file ID from the My Maps share URL, added as an env var.

**Flow:**
1. Discord Bot sends HTTP POST to Apps Script Web App URL with `token` in the body
2. Apps Script validates token; rejects with 403 if invalid
3. Apps Script reads all rows where `synced = FALSE` from Google Sheet
4. For each row: appends a `<Placemark>` to the correct KML folder in the My Maps Drive file
5. Updates `synced = TRUE` for processed rows
6. Returns count of synced records

---

## 11. Error Handling

| Scenario | Behavior |
|----------|----------|
| Places API quota exceeded | Stop current run, post warning to Discord channel |
| Scraper (iFood/Openrice) fails | Skip that source, continue with others, log warning |
| RSS feed unreachable | Skip that feed, continue |
| Apps Script sync fails | Leave `synced = FALSE`, retry on next trigger |
| Duplicate place_id | Skip silently (deduplication) |

---

## 12. Tech Stack

| Component | Technology |
|-----------|------------|
| Bot runtime | Node.js + TypeScript |
| Discord library | discord.js v14 |
| Scheduling | node-cron |
| Web scraping | Cheerio (static pages), Puppeteer (if needed) |
| RSS parsing | rss-parser |
| Google APIs | googleapis (npm) |
| Hosting | Fly.io free tier (3 shared-CPU VMs/month free as of 2024; verify current limits at fly.io/docs/about/pricing — alternatively use a home server or VPS for guaranteed $0) |

---

## 13. Project Structure

```
discord-foodmap-bot/
├── src/
│   ├── index.ts
│   ├── commands/
│   │   ├── search.ts
│   │   ├── sync.ts
│   │   └── query.ts
│   ├── scrapers/
│   │   ├── ifood.ts
│   │   ├── openrice.ts
│   │   └── rss.ts
│   ├── services/
│   │   ├── places.ts        # Google Places API
│   │   ├── sheets.ts        # Google Sheets API
│   │   └── appsscript.ts    # Trigger Apps Script sync
│   ├── utils/
│   │   ├── dedup.ts
│   │   └── classify.ts      # Places type → cuisine label
│   └── scheduler.ts
├── apps-script/
│   └── sync-to-mymap.gs
├── .env.example
├── package.json
└── tsconfig.json
```

---

## 14. Environment Variables

```
DISCORD_TOKEN=                 # Bot token from Discord Developer Portal
DISCORD_CLIENT_ID=             # Application ID from Discord Developer Portal
DISCORD_SUMMARY_CHANNEL_ID=    # Channel ID for daily scheduler summaries

GOOGLE_API_KEY=                # API key for Places API (New) — key-based auth
GOOGLE_SHEETS_ID=              # Target spreadsheet ID (from the Sheet URL)
GOOGLE_SHEET_TAB_NAME=places   # Sheet tab name (default: places)
GOOGLE_SERVICE_ACCOUNT_JSON=   # Service account credentials JSON (string) — for Sheets API

# Note: Places API uses GOOGLE_API_KEY (API key auth).
# Sheets API uses GOOGLE_SERVICE_ACCOUNT_JSON (Service Account OAuth2).
# These are two separate auth mechanisms and must both be configured.

APPS_SCRIPT_WEBHOOK_URL=       # Deployed Apps Script Web App URL (doPost endpoint)
APPS_SCRIPT_SECRET=            # Shared secret — sent in POST body, validated by Apps Script
MY_MAPS_FILE_ID=               # Google Drive file ID of the My Maps file (from share URL)
```
