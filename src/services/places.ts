import axios from 'axios';
import { config } from '../config.js';
import { classifyCuisine } from '../utils/classify.js';
import type { Place, PlaceType, SearchOptions } from '../types.js';

const PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';

const TYPE_QUERY: Record<PlaceType, string> = {
  '餐廳': '熱門餐廳',
  '咖啡廳': '熱門咖啡廳',
  '景點': '熱門景點',
  '夜市': '夜市',
};

const RATING_THRESHOLD = 4.0;
const REVIEW_THRESHOLD = 100;
const REQUEST_DELAY_MS = 300;

export async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
          'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.location,places.types,places.googleMapsUri',
      },
    }
  );

  const raw: RawPlace[] = res.data.places ?? [];

  await sleep(REQUEST_DELAY_MS);

  return raw
    .filter(p => p.rating >= RATING_THRESHOLD && p.userRatingCount >= REVIEW_THRESHOLD)
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
}
