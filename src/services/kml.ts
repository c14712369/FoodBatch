import type { Place, PlaceType } from '../types.js';

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateKml(places: Place[]): string {
  // 包含所有目前支援的類型
  const types: PlaceType[] = ['餐廳', '咖啡廳', '甜點', '藝術', '購物', '景點', '夜市'];

  const folders = types.map(type => {
    const group = places.filter(p => p.type === type);
    if (group.length === 0) return '';

    const placemarks = group.map(p => {
      const desc = [
        p.cuisine ? `料理類型：${p.cuisine}` : '',
        `評分：${p.rating} ⭐ (${p.reviews} 則評論)`,
        `地址：${p.address}`,
        `地圖連結：${p.url}`,
        `來源：${p.source}`,
        `加入時間：${p.added_at}`,
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
  }).filter(f => f !== '').join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>FoodBatch 美食生活地圖</name>
${folders}
</Document>
</kml>`;
}
