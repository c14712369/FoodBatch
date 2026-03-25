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
  '景點': '在地 景點',
  '夜市': '夜市',
};

const REVIEW_MIN_THRESHOLD = 50;
const REQUEST_DELAY_MS = 300;

export async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function checkRatingAndReview(p: RawPlace): boolean {
  // 所有類別統一門檻：最低 50 則評論
  if (p.userRatingCount < REVIEW_MIN_THRESHOLD) return false;

  // 統一雙層門檻：50-200 則需 4.3+，超過 200 則需 4.2+
  if (p.userRatingCount <= 200) {
    return p.rating >= 4.3;
  } else {
    return p.rating >= 4.2;
  }
}

function isSuspiciousCheckInStore(p: RawPlace, type: PlaceType): boolean {
  // 僅針對餐飲類別（餐廳、咖啡廳、甜點）進行品質控管
  const foodTypes: PlaceType[] = ['餐廳', '咖啡廳', '甜點'];
  if (!foodTypes.includes(type)) return false;

  const reviews = p.reviews || [];
  if (reviews.length === 0) return false;

  // 1. 評論品質檢查 (基於 Google API 回傳之最新 5 則評論)
  const longReviews = reviews.filter(r => (r.text?.text?.length || 0) > 10);
  const minLongRequired = Math.min(2, reviews.length);
  if (longReviews.length < minLongRequired) return true;

  // 2. 負面/雷店關鍵字過濾 (只要出現 1 個就視為地雷)
  const BAD_KEYWORDS = [
    '難吃', '蟑螂', '不衛生', '環境髒', '態度差', '非常失望', '大雷', '踩雷', 
    '不會再去', '死鹹', '毛髮', '頭髮', '拉肚子', '變質', '酸掉', '反推', 
    '沒熟', '沒洗乾淨', '不新鮮', '縮水'
  ];
  
  // 3. 業配/招待關鍵字過濾 (出現 2 個以上才排除，避免誤殺)
  const SHILL_KEYWORDS = ['打卡送', '評論送', '招待', '5顆星', '五星送', '五顆星', '打卡禮', '招待券', '評價送'];
  
  let shillKeywordCount = 0;
  for (const r of reviews) {
    const text = r.text?.text || '';
    
    // 檢查明確雷點：只要 5 則評論中有任一則提到這些關鍵字，直接排除
    if (BAD_KEYWORDS.some(k => text.includes(k))) return true;
    
    // 統計業配字眼
    if (SHILL_KEYWORDS.some(k => text.includes(k))) shillKeywordCount++;
  }

  if (shillKeywordCount >= 2) return true;

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
      // 1. 評分與評論數過濾 (套用到所有類別)
      if (!checkRatingAndReview(p)) return false;

      // 2. 品質控管與業配過濾 (僅套用到餐飲類別)
      if (isSuspiciousCheckInStore(p, opts.type)) return false;

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
