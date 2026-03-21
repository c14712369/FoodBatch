import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { getAllPlaces } from '../src/services/sheets.js';
import type { Place } from '../src/types.js';

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const LAYER_COLORS: Record<string, string> = {
  '餐廳': 'ff0000ff',   // 紅
  '咖啡廳': 'ff0080ff', // 橘
  '景點': 'ffff0000',   // 藍
  '夜市': 'ff00ffff',   // 黃
};

function buildKml(places: Place[]): string {
  const types = ['餐廳', '咖啡廳', '景點', '夜市'];

  const folders = types.map(type => {
    const group = places.filter(p => p.type === type);
    const placemarks = group.map(p => {
      const desc = [
        p.cuisine ? `料理類型：${p.cuisine}` : '',
        `評分：${p.rating} ⭐ (${p.reviews} 則評論)`,
        `地址：${p.address}`,
        `來源：${p.url}`,
      ].filter(Boolean).join('\n');

      return `    <Placemark>
      <name>${escapeXml(p.name)}</name>
      <description>${escapeXml(desc)}</description>
      <Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>
    </Placemark>`;
    }).join('\n');

    return `  <Folder>
    <name>${type}</name>
${placemarks}
  </Folder>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>FoodBatch 美食地圖</name>
${folders.join('\n')}
</Document>
</kml>`;
}

async function main() {
  console.log('讀取 Google Sheet...');
  const places = await getAllPlaces();
  console.log(`共 ${places.length} 筆資料`);

  const kml = buildKml(places);

  mkdirSync('output', { recursive: true });
  writeFileSync('output/places.kml', kml, 'utf-8');

  const counts = ['餐廳', '咖啡廳', '景點', '夜市'].map(t =>
    `${t}: ${places.filter(p => p.type === t).length}`
  );
  console.log('✅ 已產生 output/places.kml');
  console.log(counts.join(' | '));
  console.log('\n匯入 My Maps 步驟：');
  console.log('1. 開啟 https://www.google.com/maps/d/');
  console.log('2. 開啟你的地圖 → 左側選單「匯入」');
  console.log('3. 上傳 output/places.kml');
}

main().catch(console.error);
