import Parser from 'rss-parser';
import axios from 'axios';
import { searchPlaces } from '../services/places.js';
import type { Place } from '../types.js';
import { isSimilar } from '../utils/similarity.js';

const RSS_FEEDS = [
  { url: 'https://www.ptt.cc/atom/Food.xml', name: 'PTT美食板', headers: { Cookie: 'over18=1' } },
  { url: 'https://feeds.feedburner.com/rsscna/lifehealth', name: '中央社生活健康', headers: {} },
  { url: 'https://feeds.feedburner.com/rsscna/local', name: '中央社地方', headers: {} },
];

const parser = new Parser();

// Extract potential place names from RSS item titles using simple heuristics
function extractPlaceNames(title: string): string[] {
  // Match Chinese text patterns that look like place/store names (2-8 chars, often followed by 、，)
  const matches = title.match(/[\u4e00-\u9fa5]{2,10}(?:餐廳|小館|美食|咖啡|夜市|市場|名店|老店)?/g);
  return [...new Set(matches ?? [])];
}

export async function scrapeRssPlaces(city: string): Promise<Place[]> {
  const results: Place[] = [];

  for (const feed of RSS_FEEDS) {
    try {
      const res = await axios.get(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FoodBot/1.0)', ...feed.headers },
        timeout: 10000,
      });
      const parsed = await parser.parseString(res.data as string);
      const recentItems = parsed.items.slice(0, 20);

      for (const item of recentItems) {
        const names = extractPlaceNames(item.title ?? '');
        for (const name of names) {
          try {
            // Pass name + city as the text query so Places API resolves the specific place
            const places = await searchPlaces({ type: '餐廳', location: `${name} ${city}` });
            // Take the first result if its name is similar to what we searched for
            const match = places.find(p => isSimilar(p.name, name) && p.rating >= 3.5);
            if (match) {
              results.push({ ...match, source: feed.name });
            }
          } catch {
            // Individual lookup failure is non-fatal
          }
        }
      }
    } catch (err) {
      console.warn(`[RSS] ${feed.name} 抓取失敗:`, (err as Error).message);
    }
  }

  return results;
}
