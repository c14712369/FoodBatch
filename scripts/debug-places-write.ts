import 'dotenv/config';
import { searchPlaces } from '../src/services/places.js';
import { getAllPlaces, appendPlaces } from '../src/services/sheets.js';
import { filterNewPlaces } from '../src/utils/dedup.js';

async function main() {
  console.log('=== Places 寫入流程診斷 ===\n');

  // Step 1: searchPlaces
  console.log('[1] 呼叫 searchPlaces (台北 餐廳)...');
  const found = await searchPlaces({ type: '餐廳', location: '台北' });
  console.log(`   → 回傳 ${found.length} 筆`);
  found.slice(0, 3).forEach(p => console.log(`     ${p.place_id} | ${p.name} ⭐${p.rating}`));

  // Step 2: getAllPlaces
  console.log('\n[2] 讀取 Sheet 現有資料...');
  const existing = await getAllPlaces();
  console.log(`   → Sheet 內有 ${existing.length} 筆`);
  if (existing.length > 0) {
    existing.slice(0, 3).forEach(p => console.log(`     ${p.place_id} | ${p.name}`));
  }

  // Step 3: filterNewPlaces
  console.log('\n[3] filterNewPlaces 結果...');
  const newPlaces = filterNewPlaces(found, existing);
  console.log(`   → ${found.length} 筆中有 ${newPlaces.length} 筆是新的`);

  if (newPlaces.length === 0 && found.length > 0) {
    const existingIds = new Set(existing.map(p => p.place_id));
    console.log('\n   [診斷] 所有筆數被過濾，原因分析:');
    for (const p of found) {
      if (existingIds.has(p.place_id)) {
        console.log(`   ✋ place_id 已存在: ${p.name}`);
      } else {
        console.log(`   ❓ 非重複但仍被濾掉: ${p.name} (id=${p.place_id})`);
      }
    }
  }

  // Step 4: 嘗試寫入
  if (newPlaces.length > 0) {
    console.log(`\n[4] 嘗試寫入 ${newPlaces.length} 筆到 Sheet...`);
    try {
      await appendPlaces(newPlaces);
      console.log('   ✅ 寫入成功！');
      // 確認寫入後資料
      const after = await getAllPlaces();
      console.log(`   → 寫入後 Sheet 共 ${after.length} 筆 (增加了 ${after.length - existing.length} 筆)`);
    } catch (err: any) {
      console.log('   ❌ 寫入失敗:', err.message);
      if (err.response?.data) console.log('   詳細錯誤:', JSON.stringify(err.response.data).slice(0, 300));
    }
  } else {
    console.log('\n[4] 無新資料需要寫入（全部已在 Sheet 中）');
  }
}

main().catch(console.error);
