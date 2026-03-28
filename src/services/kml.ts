import type { Place, PlaceType } from '../types.js';

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateKml(places: Place[]): string {
  // 依照類型分組
  const types: PlaceType[] = ['餐廳', '咖啡廳', '甜點', '藝術', '購物', '景點', '夜市'];

  const folders = types.map(type => {
    const group = (places || []).filter(p => p.type === type);
    if (group.length === 0) return '';

    const placemarks = group.map(p => {
      const desc = [
        p.cuisine ? `類型：${p.cuisine}` : '',
        `評分：${p.rating} 星 (${p.reviews} 則評論)`,
        `地址：${p.address}`,
        `連結：${p.url}`,
        `加入時間：${p.added_at}`,
      ].filter(Boolean).map(line => escapeXml(line)).join('\n');

      return `    <Placemark>
      <name>${escapeXml(p.name)}</name>
      <description>${desc}</description>
    </Placemark>`;
    }).join('\n');

    return `  <Folder>
    <name>${type}</name>
    ${placemarks}
  </Folder>`;
  }).filter(f => f !== '').join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>FoodBatch 美食地圖備份</name>
  <description>自動採集的台日港美食清單</description>
${folders}
</Document>
</kml>`;
}
