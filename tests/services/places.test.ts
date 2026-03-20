import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { searchPlaces } from '../../src/services/places.js';

vi.mock('axios');
vi.mock('../../src/config.js', () => ({
  config: {
    google: {
      apiKey: 'test-key',
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('searchPlaces', () => {
  it('returns empty array when API returns no results', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { places: [] } });
    const results = await searchPlaces({ type: '餐廳', location: '台北' });
    expect(results).toHaveLength(0);
  });

  it('filters out results below rating threshold', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        places: [
          { id: 'p1', displayName: { text: '好吃館' }, rating: 3.5, userRatingCount: 200,
            formattedAddress: '台北市', location: { latitude: 25.0, longitude: 121.5 },
            types: ['chinese_restaurant'], googleMapsUri: 'https://maps.google.com/?cid=p1' },
        ],
      },
    });
    const results = await searchPlaces({ type: '餐廳', location: '台北' });
    expect(results).toHaveLength(0); // 3.5 < 4.0 threshold
  });

  it('maps cuisine type correctly', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        places: [
          { id: 'p2', displayName: { text: '火鍋天堂' }, rating: 4.5, userRatingCount: 500,
            formattedAddress: '台北市中山區', location: { latitude: 25.05, longitude: 121.52 },
            types: ['hot_pot_restaurant', 'restaurant'], googleMapsUri: 'https://maps.google.com/?cid=p2' },
        ],
      },
    });
    const results = await searchPlaces({ type: '餐廳', location: '台北' });
    expect(results).toHaveLength(1);
    expect(results[0]!.cuisine).toBe('火鍋');
  });
});
