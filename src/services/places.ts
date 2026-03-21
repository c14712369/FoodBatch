import axios from 'axios';
import { config } from '../config.js';
import { classifyCuisine } from '../utils/classify.js';
import type { Place, PlaceType, SearchOptions } from '../types.js';

const PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';

const TYPE_QUERY: Record<PlaceType, string> = {
  '餐廳': '熱門餐廳',
  '咖啡廳': '熱門咖啡廳',
  '甜點': '熱門甜點 甜點店 蛋糕 伴手禮',
  '藝術': '熱門美術館 博物館 藝術中心 展覽',
  '購物': '熱門購物 商場 百貨',
  '景點': '熱門景點',
  '夜市': '夜市',
};

const REVIEW_THRESHOLD = 200;
const REQUEST_DELAY_MS = 300;

export async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRatingThreshold(type: PlaceType): number {
  // 對於美食類別要求較高 (4.2)，景點與生活類別維持 4.0
  const higherThresholdTypes: PlaceType[] = ['餐廳', '咖啡廳', '甜點'];
  return higherThresholdTypes.includes(type) ? 4.2 : 4.0;
}

function isSuspiciousCheckInStore(p: RawPlace): boolean {
  // 1. 調整高分審查門檻：4.9 以上才視為「疑似灌水」，但只要評論數破 500 就視為可信名店
  const isHighRatingSuspicious = p.rating >= 4.9 && p.userRatingCount < 500;

  // 2. 內容分析
  const reviews = p.reviews || [];
  if (reviews.length > 0) {
    // 改用更精確的「激勵性關鍵字」，避免單純提到「打卡」就被誤殺
    const SHILL_KEYWORDS = ['打卡送', '評論送', '五星送', '5星送', '評價送', '評論換', '打卡換', '送小菜', '送飲料'];
    let totalLength = 0;
    let shillKeywordCount = 0;
    let reviewsWithText = 0;

    for (const r of reviews) {
      const text = r.text?.text || '';
      if (text.length > 0) {
        reviewsWithText++;
        totalLength += text.length;
        if (SHILL_KEYWORDS.some(k => text.includes(k))) {
          shillKeywordCount++;
        }
      }
    }

    // 優化判定邏輯：
    // - 至少要有 2 則評論明確提到「送/換」相關字眼，才判定為打卡店
    if (shillKeywordCount >= 2) return true;

    // - 針對極高分 (4.9+) 且評論數不夠多 (<500) 的店，才檢查評論字數
    if (reviewsWithText > 0 && isHighRatingSuspicious) {
      const avgLength = totalLength / reviewsWithText;
      if (avgLength < 10) return true; // 只要平均有 10 個字就算過關
    }
  }

  return false;
}

export async function searchPlaces(opts: SearchOptions): Promise<Place[]> {
  const query = opts.cuisine
    ? `${opts.cuisine} ${opts.location}`
    : `${opts.location} ${TYPE_QUERY[opts.type]}`;

  const res = await axios.post(
    PLACES_API_URL,
    { textQuery: query, maxResultCount: 20, languageCode: 'zh-TW' },
    {
      params: { key: config.google.apiKey },
      headers: {
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.location,places.types,places.googleMapsUri,places.reviews',
      },
    }
  );

  const raw: RawPlace[] = res.data.places ?? [];

  await sleep(REQUEST_DELAY_MS);

  return raw
    .filter(p => {
      // 基礎過濾 (適用於所有類別)
      const dynamicRatingThreshold = getRatingThreshold(opts.type);
      
      if (p.rating < dynamicRatingThreshold) {
        // console.log(`[Filter] 低評分跳過: ${p.displayName.text} (${p.rating}星 < ${dynamicRatingThreshold})`);
        return false;
      }
      if (p.userRatingCount < REVIEW_THRESHOLD) {
        // console.log(`[Filter] 評論數不足跳過: ${p.displayName.text} (${p.userRatingCount}評)`);
        return false;
      }
      
      // 進階防打卡店過濾 (僅針對「餐廳」類別生效)
      if (opts.type === '餐廳') {
        const isSuspicious = isSuspiciousCheckInStore(p);
        if (isSuspicious) {
          // 內部偵錯 Log
          const reviews = p.reviews || [];
          const text = reviews.map(r => r.text?.text || '').join(' | ');
          console.log(`[Filter] 排除疑似打卡店 (餐廳): ${p.displayName.text} - 原因: 關鍵字或評論長度異常`);
          return false;
        }
      }
      
      return true;
    })
    .map(p => ({
      place_id: p.id,
      name: p.displayName.text,
      type: opts.type,
      cuisine: classifyCuisine(p.types),
      rating: p.rating,
      reviews: p.userRatingCount,
      address: p.formattedAddress,
      lat: p.location.latitude,
      lng: p.location.longitude,
      source: 'Places',
      url: p.googleMapsUri,
      added_at: new Date().toISOString(),
      synced: false,
    }));
}

interface RawPlace {
  id: string;
  displayName: { text: string };
  rating: number;
  userRatingCount: number;
  formattedAddress: string;
  location: { latitude: number; longitude: number };
  types: string[];
  googleMapsUri: string;
  reviews?: Array<{
    text?: { text: string };
  }>;
}
