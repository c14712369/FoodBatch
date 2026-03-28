export type PlaceType = '餐廳' | '咖啡廳' | '甜點' | '藝術' | '購物' | '景點' | '夜市';

export interface Place {
  country: string;
  region: string;
  name: string;
  type: PlaceType;
  cuisine: string;
  url: string;
  address: string;
  rating: number;
  reviews: number;
  place_id: string;
  lat: number;
  lng: number;
  added_at: string; // ISO datetime string
  synced: boolean;
}

export interface SearchOptions {
  type: PlaceType;
  location: string;
  cuisine?: string;
  country?: string;
  region?: string;
}

export interface RunSummary {
  total: number;
  byType: Record<PlaceType, number>;
  errors: string[];
}
