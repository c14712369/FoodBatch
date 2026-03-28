import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import Parser from 'rss-parser';

// ─── 顏色輸出 ────────────────────────────────────────────────
const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red:   (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow:(s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan:  (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold:  (s: string) => `\x1b[1m${s}\x1b[0m`,
};
function section(title: string) {
  console.log('\n' + c.bold(c.cyan(`${'═'.repeat(60)}`)));
  console.log(c.bold(c.cyan(`  ${title}`)));
  console.log(c.bold(c.cyan(`${'═'.repeat(60)}`)));
}
const ok   = (msg: string) => console.log(c.green(`  ✅ ${msg}`));
const fail = (msg: string) => console.log(c.red(`  ❌ ${msg}`));
const warn = (msg: string) => console.log(c.yellow(`  ⚠️  ${msg}`));
const info = (msg: string) => console.log(`     ${msg}`);

// ─── 1. Google Places API ────────────────────────────────────
async function testPlacesAPI() {
  section('1. Google Places API 門檻診斷');
  const apiKey = process.env['GOOGLE_API_KEY'];
  if (!apiKey) { fail('GOOGLE_API_KEY 未設定'); return; }
  ok(`API Key 存在 (${apiKey.slice(0, 8)}...)`);

  const queries = [
    { label: '台北 餐廳',   body: { textQuery: '台北 餐廳美食',    maxResultCount: 20, languageCode: 'zh-TW' } },
    { label: '台北 咖啡廳', body: { textQuery: '台北 特色咖啡廳',  maxResultCount: 20, languageCode: 'zh-TW' } },
    { label: '東京 餐廳',   body: { textQuery: '東京 餐廳美食',    maxResultCount: 20, languageCode: 'zh-TW' } },
  ];

  for (const q of queries) {
    try {
      const res = await axios.post(
        'https://places.googleapis.com/v1/places:searchText',
        q.body,
        {
          params: { key: apiKey },
          headers: { 'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.reviews' },
        }
      );
      const raw: any[] = res.data.places ?? [];
      const REVIEW_MIN = 30;

      const passed = raw.filter(p => {
        if ((p.userRatingCount ?? 0) < REVIEW_MIN) return false;
        if ((p.userRatingCount ?? 0) <= 200) return (p.rating ?? 0) >= 4.1;
        return (p.rating ?? 0) >= 4.0;
      });

      if (passed.length > 0) {
        ok(`[${q.label}] 原始 ${raw.length} 筆 → 過篩後 ${c.bold(String(passed.length))} 筆`);
      } else {
        fail(`[${q.label}] 原始 ${raw.length} 筆 → 全部被門檻過濾 (0 筆通過)`);
      }

      // 詳細分析被濾掉的原因
      const noReview = raw.filter(p => (p.userRatingCount ?? 0) < REVIEW_MIN);
      const lowRating = raw.filter(p => (p.userRatingCount ?? 0) >= REVIEW_MIN && (p.rating ?? 0) < 4.0);
      const midRating = raw.filter(p =>
        (p.userRatingCount ?? 0) >= REVIEW_MIN && (p.userRatingCount ?? 0) <= 200 &&
        (p.rating ?? 0) >= 4.0 && (p.rating ?? 0) < 4.1
      );

      if (noReview.length)  info(`評論數 < ${REVIEW_MIN}: ${noReview.length} 筆 → 被過濾`);
      if (lowRating.length) info(`評分 < 4.0: ${lowRating.length} 筆 → 被過濾`);
      if (midRating.length) info(`評論 30-200 筆但評分 4.0~4.09: ${midRating.length} 筆 → 被過濾（門檻 4.1）`);

      // 顯示前 5 名
      if (raw.length > 0) {
        info(`前 5 名原始結果:`);
        raw.slice(0, 5).forEach(p =>
          info(`  ${p.displayName?.text ?? '?'} ⭐${p.rating ?? 'N/A'} 💬${p.userRatingCount ?? 0}`)
        );
      }
    } catch (err: any) {
      fail(`[${q.label}] 請求失敗: ${err.response?.status ?? ''} ${err.message}`);
      if (err.response?.data) info(JSON.stringify(err.response.data).slice(0, 300));
    }
  }
}

// ─── 2. iFood 爬蟲 ───────────────────────────────────────────
async function testIFood() {
  section('2. iFood (愛食記) 爬蟲');
  const city = '台北';
  const url = `https://ifoodie.tw/explore/${encodeURIComponent(city)}/list?page=1`;
  info(`URL: ${url}`);
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 12000,
      validateStatus: s => s < 500,
    });
    if (res.status !== 200) { fail(`HTTP ${res.status}`); return; }
    ok(`HTTP ${res.status}`);
    const $ = cheerio.load(res.data as string);

    info(`.title-text: ${$('.title-text').length}  a.title: ${$('a.title').length}`);

    const names: string[] = [];
    $('.title-text, a.title').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length >= 2 && text.length <= 25) names.push(text);
    });

    if (names.length > 0) {
      ok(`抓到 ${names.length} 個名稱: ${names.slice(0, 5).join(', ')}`);
    } else {
      fail('抓到 0 個名稱，HTML 結構可能已改，掃描替代 selector...');
      const trySelectors = ['h2 a', 'h3 a', '.restaurant-name', '[class*="title"]', '[class*="name"]', 'article a'];
      for (const sel of trySelectors) {
        const els = $(sel);
        if (els.length > 0 && els.length < 200) {
          warn(`"${sel}" → ${els.length} 個`);
          els.slice(0, 3).each((_, el) => info(`  "${$(el).text().trim().slice(0, 40)}"`));
        }
      }
    }
  } catch (err: any) {
    fail(`iFood: ${err.response?.status ?? ''} ${err.message}`);
  }
}

// ─── 3. WalkerLand 爬蟲 ──────────────────────────────────────
async function testWalkerLand() {
  section('3. 窩客島 (WalkerLand) 爬蟲');
  const city = '台北';
  // 使用 WordPress 搜尋端點 (/?s=城市美食)
  const url = `https://www.walkerland.com.tw/?s=${encodeURIComponent(city + '美食')}`;
  info(`URL: ${url}`);
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36' },
      timeout: 10000,
      validateStatus: s => s < 500,
    });
    if (res.status !== 200) { fail(`HTTP ${res.status}`); return; }
    ok(`HTTP ${res.status}`);

    const $ = cheerio.load(res.data as string);
    info(`a[href*="/poi/view/"]: ${$('a[href*="/poi/view/"]').length} 個`);

    const names: string[] = [];
    $('a[href*="/poi/view/"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length >= 2 && text.length <= 25) names.push(text);
    });
    const unique = [...new Set(names)];

    if (unique.length > 0) {
      ok(`抓到 ${unique.length} 個: ${unique.slice(0, 5).join(', ')}`);
    } else {
      fail('0 個名稱');
    }
  } catch (err: any) {
    fail(`WalkerLand: ${err.message}`);
  }
}

// ─── 4. RSS Feed ─────────────────────────────────────────────
async function testRSS() {
  section('4. RSS Feed 測試');
  const parser = new Parser();
  const feeds = [
    { url: 'https://www.ptt.cc/atom/Food.xml', name: 'PTT 美食板', headers: { Cookie: 'over18=1' } },
    { url: 'https://news.google.com/rss/search?q=%E5%8F%B0%E5%8C%97+%E7%BE%8E%E9%A3%9F+%E9%A3%9F%E8%A8%98&hl=zh-TW&gl=TW&ceid=TW:zh-Hant', name: 'Google News 台北美食', headers: {} },
  ];

  for (const feed of feeds) {
    info(`${feed.name}: ${feed.url}`);
    try {
      const res = await axios.get(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0', ...feed.headers },
        timeout: 10000,
        validateStatus: s => s < 500,
      });
      if (res.status === 404) { fail(`HTTP 404 已失效`); continue; }
      ok(`HTTP ${res.status}`);
      const parsed = await parser.parseString(res.data as string);
      const total = parsed.items.length;
      const foodPosts = parsed.items.filter(i => i.title?.includes('[食記]'));
      info(`共 ${total} 篇，其中食記 ${foodPosts.length} 篇`);
      if (total > 0) info(`最新: ${parsed.items[0].title?.slice(0, 50)}`);
    } catch (err: any) {
      fail(`${feed.name}: ${err.response?.status ?? ''} ${err.message}`);
    }
  }
}

// ─── 5. 建議新增的來源可用性測試 ─────────────────────────────
async function testNewSources() {
  section('5. 建議新增來源可用性測試');

  const sources = [
    { name: '痞客邦 美食分類 RSS',       url: 'https://www.pixnet.net/channel/food/feed' },
    { name: '食力 foodNEXT RSS',         url: 'https://www.foodnext.net/feeds' },
    { name: 'ETtoday 美食頻道 RSS',      url: 'https://feeds.ettoday.net/ettoday-news/lifestyle' },
    { name: '台灣美食情報 (Ichef Blog)', url: 'https://www.ichef.com.tw/blog/feed/' },
    { name: 'Tasteful Taiwan RSS',       url: 'https://www.tasteful.tw/feed' },
    { name: 'Noms Magazine RSS',         url: 'https://nomsmag.com/feed/' },
  ];

  for (const src of sources) {
    try {
      const res = await axios.get(src.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 8000,
        validateStatus: s => s < 500,
      });
      if (res.status === 200) ok(`${src.name} → HTTP 200 可用`);
      else warn(`${src.name} → HTTP ${res.status}`);
    } catch (err: any) {
      fail(`${src.name} → ${err.message.slice(0, 60)}`);
    }
  }
}

// ─── 主程式 ──────────────────────────────────────────────────
async function main() {
  console.log(c.bold('\n🍜 FoodBatch 本機完整診斷'));
  console.log(`時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n`);

  await testPlacesAPI();
  await testIFood();
  await testWalkerLand();
  await testRSS();
  await testNewSources();

  console.log('\n' + c.bold(c.cyan('═'.repeat(60))));
  console.log(c.bold(c.cyan('  診斷完成！')));
  console.log(c.bold(c.cyan('═'.repeat(60))) + '\n');
}

main().catch(err => {
  console.error('診斷腳本錯誤:', err);
  process.exit(1);
});
