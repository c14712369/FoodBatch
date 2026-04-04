import axios from 'axios';
import { config } from '../config.js';
import { classifyCuisine } from '../utils/classify.js';
import type { Place, PlaceType, SearchOptions } from '../types.js';

const PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';

const TYPE_QUERY: Record<PlaceType, string> = {
  '餐廳': '餐廳美食',
  '咖啡廳': '特色咖啡廳',
  '甜點': '甜點 蛋糕店 冰店',
  '藝術': '藝廊 展覽',
  '購物': '選物店 潮流店',
  '景點': '私房景點',
  '夜市': '夜市',
};

const EXTRA_KEYWORDS: Record<PlaceType, string[]> = {
  '餐廳': ['中式', '日式', '韓式', '泰式', '義式', '美式', '火鍋', '燒肉', '小吃', '早午餐'],
  '咖啡廳': ['手沖', '貓咪', '老宅', '深夜', '文青', '網美', '不限時'],
  '甜點': ['法式', '傳統', '肉桂捲', '千層', '冰品', '伴手禮'],
  '藝術': ['聯展', '個展', '當代', '美術館', '文創'],
  '購物': ['古著', '選物', '手作', '潮流', '市集'],
  '景點': ['秘境', '夜景', '歷史', '親子', '約會'],
  '夜市': ['必吃', '老字號', '排隊', '隱藏版']
};

const REVIEW_MIN_THRESHOLD = 50;
const REQUEST_DELAY_MS = 300;

export async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function checkRatingAndReview(p: RawPlace): boolean {
  if (p.userRatingCount < REVIEW_MIN_THRESHOLD) return false;

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

  // 1. 評論品質檢查 (基於 Google API 回傳之最新 5 則評論，至少 2 則需 >= 10 字)
  const longReviews = reviews.filter(r => (r.text?.text?.length || 0) > 10);
  const minLongRequired = Math.min(2, reviews.length);
  if (longReviews.length < minLongRequired) return true;

  // 2. 負面/雷店關鍵字過濾 (只要出現 1 個就視為地雷)
  const BAD_KEYWORDS = [
    '難吃', '蟑螂', '不衛生', '環境髒', '態度差', '非常失望', '大雷', '踩雷', 
    '不會再去', '死鹹', '毛髮', '頭髮', '拉肚子', '變質', '酸掉', '反推', 
    '沒熟', '沒洗乾淨', '不新鮮', '縮水'
  ];
  
  // 3. 業配/招待關鍵字過濾 (10 則中任一則出現就排除)
  const SHILL_KEYWORDS = ['打卡送', '評論送', '招待', '5顆星', '五星送', '五顆星', '打卡禮', '招待券', '評價送'];

  for (const r of reviews) {
    const text = r.text?.text || '';

    if (BAD_KEYWORDS.some(k => text.includes(k))) return true;
    if (SHILL_KEYWORDS.some(k => text.includes(k))) return true;
  }

  return false;
}

export async function searchPlaces(opts: SearchOptions): Promise<Place[]> {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  
  let keywordSuffix = '';
  if (EXTRA_KEYWORDS[opts.type] && EXTRA_KEYWORDS[opts.type].length > 0) {
    const list = EXTRA_KEYWORDS[opts.type];
    keywordSuffix = ' ' + list[dayOfYear % list.length];
  }

  const baseQuery = TYPE_QUERY[opts.type];
  const query = opts.cuisine
    ? `${opts.cuisine} ${opts.location}`
    : `${opts.location} ${baseQuery}${keywordSuffix}`;

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
      country: opts.country ?? '',
      region: opts.region ?? '',
      name: p.displayName.text,
      type: opts.type,
      cuisine: classifyCuisine(p.types),
      url: p.googleMapsUri,
      address: p.formattedAddress,
      rating: p.rating,
      reviews: p.userRatingCount,
      place_id: p.id,
      lat: p.location.latitude,
      lng: p.location.longitude,
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
