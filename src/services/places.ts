import axios from 'axios';
import { config } from '../config.js';
import { classifyCuisine } from '../utils/classify.js';
import type { Place, PlaceType, SearchOptions } from '../types.js';

const PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';

const TYPE_QUERY: Record<PlaceType, string> = {
  '餐廳': '在地 餐廳',
  '咖啡廳': '在地 咖啡廳',
  '甜點': '在地 甜點店 蛋糕店 冰店 造型甜點',
  '藝術': '在地 藝廊 博物館 藝術中心 展覽',
  '購物': '在地 選物店 設計師品牌 購物中心 買手店',
  '藝術': '在地 藝術',
  '景點': '在地 景點',
  '夜市': '夜市',
};

const REVIEW_THRESHOLD = 200;
const REQUEST_DELAY_MS = 300;

export async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRatingThreshold(type: PlaceType): number {
  // 針對餐飲類別要求較嚴格 (4.2)，景點或藝文活動則放寬至 4.0
  const higherThresholdTypes: PlaceType[] = ['餐廳', '咖啡廳', '甜點'];
  return higherThresholdTypes.includes(type) ? 4.2 : 4.0;
}

function isSuspiciousCheckInStore(p: RawPlace): boolean {
  // 1. 評價極高且評論數偏低（4.9 以上且不到 500 則），通常是剛開幕刷出來的
  const isHighRatingSuspicious = p.rating >= 4.9 && p.userRatingCount < 500;

  // 2. 關鍵字過濾
  const reviews = p.reviews || [];
  if (reviews.length > 0) {
    // 如果評論中出現 2 次以上「打卡、評論、五星、招待、評論送、五顆星」等，視為業配店
    const SHILL_KEYWORDS = ['打卡送', '評論送', '招待', '5顆星', '五星送', '五顆星', '打卡禮', '招待券', '評價送'];
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

    if (shillKeywordCount >= 2) return true;

    if (reviewsWithText > 0 && isHighRatingSuspicious) {
      const avgLength = totalLength / reviewsWithText;
      if (avgLength < 10) return true; // 平均評論長度不到 10 個字，視為灌水
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
      const dynamicRatingThreshold = getRatingThreshold(opts.type);

      if (p.rating < dynamicRatingThreshold) return false;
      if (p.userRatingCount < REVIEW_THRESHOLD) return false;

      // 針對「餐廳」進行進階的業配過濾
      if (opts.type === '餐廳') {
        if (isSuspiciousCheckInStore(p)) return false;
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
