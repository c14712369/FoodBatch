import Parser from 'rss-parser';
import axios from 'axios';
import { searchPlaces } from '../services/places.js';
import type { Place } from '../types.js';
import { isSimilar } from '../utils/similarity.js';

const RSS_FEEDS = [
  { url: 'https://www.ptt.cc/atom/Food.xml', name: 'PTT美食板', headers: { Cookie: 'over18=1' } },
  { url: 'https://travel.ettoday.net/rss/travel-9.xml', name: 'ETtoday美食新聞', headers: {} },
  { url: 'https://www.walkerland.com.tw/rss/poi/', name: 'WalkerLand窩客島', headers: {} },
];

const parser = new Parser();

// 提取標題中可能的店名（通常在 [食記] 之後或是特定引號內）
function extractPlaceNames(title: string): string[] {
  // 匹配常見的括號或引號內的店名，或是特定的中文模式
  const patterns = [
    /\[食記\]\s*([^-\s]+)/,
    /「([^」]+)」/,
    /『([^』]+)』/,
    /【([^】]+)】/
  ];
  
  const names: string[] = [];
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length >= 2 && name.length <= 15) names.push(name);
    }
  }
  
  // 如果沒匹配到括號，嘗試匹配 2-10 個中文字
  if (names.length === 0) {
    const matches = title.match(/[\u4e00-\u9fa5]{2,10}(?:餐廳|小館|咖啡|甜點|火鍋|燒烤)/g);
    if (matches) names.push(...matches);
  }

  return [...new Set(names)];
}

export async function scrapeRssNames(city: string): Promise<string[]> {
  const names: string[] = [];

  for (const feed of RSS_FEEDS) {
    try {
      const res = await axios.get(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', ...feed.headers },
        timeout: 10000,
      });
      const parsed = await parser.parseString(res.data as string);
      
      for (const item of parsed.items.slice(0, 15)) {
        // 檢查標題是否包含該城市
        if (item.title?.includes(city) || item.content?.includes(city)) {
          const extracted = extractPlaceNames(item.title ?? '');
          names.push(...extracted);
        }
      }
    } catch (err) {
      console.warn(`[RSS] ${feed.name} 抓取失敗:`, (err as Error).message);
    }
  }

  return [...new Set(names)];
}
