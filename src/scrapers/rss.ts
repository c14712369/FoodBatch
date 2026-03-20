import Parser from 'rss-parser';
import { searchPlaces } from '../services/places.js';
import type { Place } from '../types.js';
import { isSimilar } from '../utils/similarity.js';

const RSS_FEEDS = [
  { url: 'https://www.setn.com/rss.aspx?NewsType=5', name: '三立美食' },
  { url: 'https://www.ettoday.net/news/food/rss2.xml', name: 'ETtoday美食' },
  { url: 'https://www.setn.com/rss.aspx?NewsType=97', name: '食尚玩家' },
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
      const parsed = await parser.parseURL(feed.url);
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
