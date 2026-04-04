import * as cheerio from 'cheerio';
import axios from 'axios';
import { searchPlaces } from '../services/places.js';
import type { Place } from '../types.js';
import { isSimilar } from '../utils/similarity.js';

export async function scrapeIFoodNames(city: string): Promise<string[]> {
  const allNames: string[] = [];
  
  // 每天推進 5 頁，範圍 1~50 頁循環 (10 天一個週期)
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const cycleDays = 10;
  const pagesPerDay = 5;
  const startPage = ((dayOfYear % cycleDays) * pagesPerDay) + 1;
  const endPage = startPage + pagesPerDay - 1;

  for (let page = startPage; page <= endPage; page++) {
    try {
      const url = `https://ifoodie.tw/explore/${encodeURIComponent(city)}/list?page=${page}`;
      const res = await axios.get(url, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
        },
        timeout: 10000,
      });
      const $ = cheerio.load(res.data as string);

      $('.title-text, a.title').each((_, el) => {
        let text = $(el).text().trim();
        const isNoise = 
          text.includes('評論') || text.includes('食記') || text.includes('人氣') ||
          text.includes('收藏') || text.includes('愛食記') || text.includes('登入') ||
          text.startsWith('(') || text.startsWith('（') || /^\d+$/.test(text) ||
          text.length < 2 || text.length > 25;

        if (!isNoise) {
          text = text.replace(/[\(\（].*[\)\）]/g, '').trim();
          if (text.length >= 2) allNames.push(text);
        }
      });
      
      // 稍微延遲避免被封鎖
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.warn(`[iFood] ${city} 第 ${page} 頁抓取失敗:`, (err as Error).message);
      break; // 如果某一頁失敗，通常後面的分頁也會失敗
    }
  }

  return [...new Set(allNames)];
}
