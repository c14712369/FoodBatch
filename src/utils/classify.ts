const CUISINE_MAP: Record<string, string> = {
  japanese_restaurant: '日式',
  korean_restaurant: '韓式',
  chinese_restaurant: '中式',
  american_restaurant: '美式',
  hamburger_restaurant: '漢堡',
  ramen_restaurant: '拉麵',
  sushi_restaurant: '壽司',
  hot_pot_restaurant: '火鍋',
  barbecue_restaurant: '燒烤/燒肉',
  italian_restaurant: '義式',
  thai_restaurant: '泰式',
  vietnamese_restaurant: '越式',
  seafood_restaurant: '海鮮',
  steak_house: '牛排',
  dessert_shop: '甜點',
};

const RESTAURANT_TYPES = new Set([
  'restaurant', 'food', ...Object.keys(CUISINE_MAP),
]);

export function classifyCuisine(types: string[]): string {
  // If no restaurant-like type present, this is not a restaurant
  const isRestaurant = types.some(t => RESTAURANT_TYPES.has(t));
  if (!isRestaurant) return '';

  for (const t of types) {
    if (CUISINE_MAP[t]) return CUISINE_MAP[t];
  }
  return '其他';
}
