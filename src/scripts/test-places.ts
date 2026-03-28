import { searchPlaces } from '../services/places.js';
import dotenv from 'dotenv';
dotenv.config();

async function runTest() {
  console.log('--- 測試：台北 拉麵 ---');
  try {
    const ramenResults = await searchPlaces({
      location: '台北',
      type: '餐廳',
      cuisine: '拉麵'
    });
    console.log(`\n通過篩選的拉麵店共 ${ramenResults.length} 家：`);
    ramenResults.forEach(r => console.log(`- ${r.name} (${r.rating} / ${r.reviews})`));

    console.log('\n--- 測試：中山區 咖啡廳 ---');
    const cafeResults = await searchPlaces({
      location: '台北 中山區',
      type: '咖啡廳'
    });
    console.log(`\n通過篩選的咖啡廳共 ${cafeResults.length} 家：`);
    cafeResults.forEach(r => console.log(`- ${r.name} (${r.rating} / ${r.reviews})`));

  } catch (error) {
    console.error('測試過程中發生錯誤：', error);
  }
}

runTest();
