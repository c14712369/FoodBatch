import * as cheerio from 'cheerio';
import axios from 'axios';
import { searchPlaces } from '../services/places.js';
import type { Place } from '../types.js';
import { isSimilar } from '../utils/similarity.js';

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
