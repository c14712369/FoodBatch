export type PlaceType = '餐廳' | '咖啡廳' | '景點' | '夜市';

export interface Place {
  place_id: string;
  name: string;
  type: PlaceType;
  cuisine: string;
  rating: number;
  reviews: number;
  address: string;
  lat: number;
  lng: number;
  source: string;
  url: string;
  added_at: string; // ISO datetime string
  synced: boolean;
}

export interface SearchOptions {
  type: PlaceType;
  location: string;
  cuisine?: string;
}

export interface RunSummary {
  total: number;
  byType: Record<PlaceType, number>;
  errors: string[];
}
