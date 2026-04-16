import 'dotenv/config';
import { bootstrapSheet } from './services/sheets.js';
import { startScheduler, runDailyJob } from './scheduler.js';

async function main() {
  await bootstrapSheet();
  
  const runOnce = process.argv.includes('--run-once');
  
  if (runOnce) {
    console.log('[Bot] 執行一次性檢查...');
    await runDailyJob();
    console.log('[Bot] 檢查完成');
    process.exit(0);
  } else {
    startScheduler();
  }
}

main().catch(err => {
  console.error('[Bot] 啟動失敗:', err);
  process.exit(1);
});
