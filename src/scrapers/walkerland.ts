import * as cheerio from 'cheerio';
import axios from 'axios';

export async function scrapeWalkerLandNames(city: string): Promise<string[]> {
  try {
    // 窩客島搜尋：使用 WordPress 標準搜尋 URL (/?s=城市美食)
    const url = `https://www.walkerland.com.tw/?s=${encodeURIComponent(city + '美食')}`;
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      timeout: 10000,
    });
    const $ = cheerio.load(res.data as string);

    const names: string[] = [];
    // 鎖定 POI (店家) 連結，每個 POI 連結出現兩次（縮圖 + 文字），只取有文字的
    $('a[href*="/poi/view/"]').each((_, el) => {
      let text = $(el).text().trim();

      const isNoise =
        text.includes('WalkerLand') ||
        text.includes('窩客島') ||
        text.includes('首頁') ||
        text.length < 2 ||
        text.length > 25;

      if (!isNoise) {
        // 清理括號與｜後的補充說明（如「店名｜台中火鍋」只取店名）
        text = text.replace(/[\(\（].*[\)\）]/g, '').replace(/[｜|].*/g, '').trim();
        if (text.length >= 2 && text.length <= 25) names.push(text);
      }
    });

    return [...new Set(names)].slice(0, 20);
  } catch (err) {
    console.warn(`[WalkerLand] ${city} 抓取失敗:`, (err as Error).message);
    return [];
  }
}
