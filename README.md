# FoodBatch Discord 機器人

自動探索台灣、日本、香港的熱門餐廳、咖啡廳、景點與購物去處，存入 Google Sheets，並支援 Discord 指令即時查詢。

---

## 🚀 功能概覽

| 功能 | 說明 |
|------|------|
| **全自動排程** | 每日 09:00 自動執行（透過 GitHub Actions），省去伺服器維護成本 |
| **跨國資料蒐集** | 涵蓋台、日、港 13 個核心城市，包含台北、新北、花蓮、東京、大阪、香港等 |
| **品質過濾器 3.0** | 內建「防打卡店」機制，自動過濾虛高評分，保留真實口碑名店 |
| **生活化分類** | 自動區分餐廳、咖啡廳、甜點、藝術、購物、景點、夜市 |
| **Google Sheets 整合** | 使用試算表作為雲端資料庫，方便隨時檢視與匯出 KML 地圖 |
| **Discord 互動** | 支援 `/搜尋`、`/查詢` 指令，並在每日執行後發送摘要報告 |

---

## 🛠️ 數據篩選與防雷機制 (Anti-Shill Logic)

為了避開「打卡五星送小菜」導致的評分虛假膨脹，本機器人採用進階過濾邏輯：

1.  **極高分審核 (4.9+ Stars)**：針對評分極高但評論數不夠多（< 500 則）的店家，執行嚴格的內容字數檢查。
2.  **激勵性關鍵字過濾**：自動掃描最近 5 則評論，若出現 **2 則以上** 提到「打卡送」、「評論換」等字眼則自動剔除。
3.  **內容深度分析**：平均評論長度若低於 10 個字，視為內容空洞的刷分店，將不予採集。
4.  **名店保護機制**：對於 4.8 星以下或評論數極多（1000+）的老字號名店，放寬審查以避免誤傷。

---

## 📍 搜尋範圍

本機器人旨在極大化利用 Google Cloud 每月 $200 美金的免費額度：

*   **台灣**：台北、新北、花蓮
*   **日本**：東京、大阪、京都、福岡、沖繩、札幌、名古屋、奈良、神戶
*   **國際**：香港
*   **深度挖掘**：針對台北、新北、香港、東京、大阪執行額外的熱門料理（火鍋、日式、燒烤等）細分搜尋。

---

## ⚙️ 快速開始 (GitHub Actions 版)

### 1. 複製專案
```bash
git clone https://github.com/c14712369/FoodBatch.git
cd FoodBatch
npm install
```

### 2. 設定 GitHub Secrets
**請勿將 `.env` 上傳至 GitHub。** 請至您的 GitHub 儲存庫：
`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`
依序加入以下變數：
*   `DISCORD_TOKEN`
*   `DISCORD_CLIENT_ID`
*   `DISCORD_SUMMARY_CHANNEL_ID`
*   `GOOGLE_API_KEY`
*   `GOOGLE_SHEETS_ID`
*   `GOOGLE_SERVICE_ACCOUNT_JSON` (請貼上單行 JSON 字串)
*   `APPS_SCRIPT_WEBHOOK_URL`
*   `APPS_SCRIPT_SECRET`
*   `MY_MAPS_FILE_ID`

### 3. 排程設定
GitHub Actions 會根據 `.github/workflows/daily-job.yml` 的設定，在每日 01:00 UTC (台北時間 09:00) 自動執行。

---

## 📂 檔案結構
*   `src/index.ts`: 機器人入口點與指令處理。
*   `src/scheduler.ts`: 核心採集邏輯與 GitHub Actions 執行入口。
*   `src/services/`: 整合 Google Places, Sheets 與 Apps Script。
*   `src/utils/`: 包含分類、去重與防打卡店邏輯。
*   `scripts/export-kml.ts`: 匯出資料至 Google My Maps 的工具。
