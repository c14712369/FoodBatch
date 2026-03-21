import * as cheerio from 'cheerio';
import axios from 'axios';
import { searchPlaces } from '../services/places.js';
import type { Place } from '../types.js';
import { isSimilar } from '../utils/similarity.js';

export async function scrapeIFoodNames(city: string): Promise<string[]> {
  try {
    // 愛食記目前的探索網址
    const url = `https://ifoodie.tw/explore/${encodeURIComponent(city)}/list`;
    const res = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      },
      timeout: 10000,
    });
    const $ = cheerio.load(res.data as string);

    const names: string[] = [];
    // 嘗試多種可能的選擇器，愛食記的店名通常在 title-text 或特定 a 標籤內
    $('.title-text, .restaurant-name, a[href*="/restaurant/"]').each((_, el) => {
      const text = $(el).text().trim();
      // 過濾掉明顯不是店名的字串
      if (text.length >= 2 && text.length <= 20 && !text.includes('愛食記') && !text.includes('登入')) {
        names.push(text);
      }
    });

    return [...new Set(names)].slice(0, 20);
  } catch (err) {
    console.warn('[iFood] 抓取失敗:', (err as Error).message);
    return [];
  }
}
