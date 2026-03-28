import Parser from 'rss-parser';
import axios from 'axios';
import { searchPlaces } from '../services/places.js';
import type { Place } from '../types.js';
import { isSimilar } from '../utils/similarity.js';

// Google News RSS 需要帶入城市名動態生成，因此用函式處理
const STATIC_RSS_FEEDS = [
  { url: 'https://www.ptt.cc/atom/Food.xml', name: 'PTT美食板', headers: { Cookie: 'over18=1' } },
];

function googleNewsFeedUrl(city: string) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(city + ' 美食 食記')}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
}

const parser = new Parser();

// 提取標題中可能的店名
function extractPlaceNames(title: string): string[] {
  const names: string[] = [];
  
  // 1. 優先匹配括號或引號內的店名 (最準確)
  const bracketPatterns = [/「([^」]+)」/, /『([^』]+)』/, /【([^】]+)】/];
  for (const pattern of bracketPatterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length >= 2 && name.length <= 15) names.push(name);
    }
  }

  // 2. 針對 PTT [食記] 的特殊處理
  if (title.includes('[食記]')) {
    // 移除 [食記] 前綴以及常見的地名標籤
    let cleanTitle = title.replace(/\[食記\]/g, '').trim();
    cleanTitle = cleanTitle.replace(/^(台北|新北|花蓮|台中|高雄|台南|宜蘭|桃園|新竹)/g, '').trim();
    
    // 再次嘗試抓取剩餘文字中的前幾個字作為店名
    const parts = cleanTitle.split(/[\s\-\（\(\~\:\：\/]/);
    if (parts.length > 0) {
      let potentialName = parts[0].trim();
      
      // 過濾掉純地名與無意義字眼
      const noise = ['士林', '信義', '內湖', '大安', '中山', '松山', '萬華', '南港', '北投', '板橋', '三重', '中和', '永和', '新莊', '新店', '土城', '蘆洲', '汐止', '樹林', '區', '市', '縣', '食記', '食記串'];
      const isNoise = noise.some(n => potentialName === n || potentialName === n + '區' || potentialName === n + '市');
      
      if (!isNoise && potentialName.length >= 2 && potentialName.length <= 15) {
        names.push(potentialName);
      }
    }
  }

  return [...new Set(names)];
}

export async function scrapeRssNames(city: string): Promise<string[]> {
  const names: string[] = [];

  const feeds = [
    ...STATIC_RSS_FEEDS,
    { url: googleNewsFeedUrl(city), name: `Google News(${city})`, headers: {} },
  ];

  for (const feed of feeds) {
    try {
      const res = await axios.get(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', ...feed.headers },
        timeout: 10000,
      });
      const parsed = await parser.parseString(res.data as string);

      for (const item of parsed.items.slice(0, 15)) {
        // PTT: 檢查標題或內容是否含城市關鍵字才處理
        // Google News: 已按城市搜尋，直接解析
        const isGoogleNews = feed.name.startsWith('Google News');
        if (isGoogleNews || item.title?.includes(city) || item.content?.includes(city)) {
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
