import * as cheerio from 'cheerio';
import axios from 'axios';

export async function scrapeWalkerLandNames(city: string): Promise<string[]> {
  const allNames: string[] = [];

  // 每天推進 5 頁，範圍 1~50 頁循環 (10 天一個週期)
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const cycleDays = 10;
  const pagesPerDay = 5;
  const startPage = ((dayOfYear % cycleDays) * pagesPerDay) + 1;
  const endPage = startPage + pagesPerDay - 1;

  for (let page = startPage; page <= endPage; page++) {
    try {
      // 窩客島搜尋：使用 WordPress 標準搜尋 URL
      const url = `https://www.walkerland.com.tw/?s=${encodeURIComponent(city + '美食')}&page=${page}`;
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        timeout: 10000,
      });
      const $ = cheerio.load(res.data as string);

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
          if (text.length >= 2 && text.length <= 25) allNames.push(text);
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.warn(`[WalkerLand] ${city} 第 ${page} 頁抓取失敗:`, (err as Error).message);
      break;
    }
  }

  return [...new Set(allNames)];
}
