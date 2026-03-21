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
    // 鎖定更精確的標題選擇器，並過濾掉雜訊
    $('.title-text, a.title').each((_, el) => {
      const text = $(el).text().trim();
      // 過濾規則：
      // 1. 長度在 2-20 字之間
      // 2. 不能包含「則評論」、「愛食記」、「登入」
      // 3. 不能是純數字或括號開頭
      if (
        text.length >= 2 && 
        text.length <= 20 && 
        !text.includes('則評論') && 
        !text.includes('愛食記') &&
        !text.startsWith('(') &&
        !/^\d+$/.test(text)
      ) {
        names.push(text);
      }
    });

    return [...new Set(names)].slice(0, 20);
  } catch (err) {
    console.warn('[iFood] 抓取失敗:', (err as Error).message);
    return [];
  }
}
