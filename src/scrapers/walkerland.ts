import * as cheerio from 'cheerio';
import axios from 'axios';

export async function scrapeWalkerLandNames(city: string): Promise<string[]> {
  try {
    // 窩客島搜尋該城市的食記頁面
    const url = `https://www.walkerland.com.tw/search/food/list/?kw=${encodeURIComponent(city)}`;
    const res = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      },
      timeout: 10000,
    });
    const $ = cheerio.load(res.data as string);

    const names: string[] = [];
    // 鎖定窩客島的店名標題
    $('.title, .poi-name, a[href*="/poi/view/"]').each((_, el) => {
      let text = $(el).text().trim();
      
      // 窩客島的店名清理
      const isNoise = 
        text.includes('WalkerLand') || 
        text.includes('窩客島') || 
        text.includes('首頁') ||
        text.length < 2 || 
        text.length > 25;

      if (!isNoise) {
        // 清理括號
        text = text.replace(/[\(\（].*[\)\）]/g, '').trim();
        if (text.length >= 2) names.push(text);
      }
    });

    return [...new Set(names)].slice(0, 20);
  } catch (err) {
    console.warn(`[WalkerLand] ${city} 抓取失敗:`, (err as Error).message);
    return [];
  }
}
