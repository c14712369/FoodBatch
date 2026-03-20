import * as cheerio from 'cheerio';
import axios from 'axios';
import { searchPlaces } from '../services/places.js';
import type { Place } from '../types.js';

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
