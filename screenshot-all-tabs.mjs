// Jalankan di mesin Anda sendiri (punya akses browser/internet penuh), BUKAN di sandbox Claude.
// Cara pakai:
//   npm install -D playwright
//   npx playwright install chromium
//   npm run build:react
//   npx vite preview --config vite.config.ts --outDir dist/react --port 4173 &
//   node screenshot-all-tabs.mjs
//
// Script ini membuka setiap tab nav (persis daftar di src/app/app/main.tsx -> nav array)
// dan menyimpan screenshot ke ./screenshots/<tabId>.png untuk dibandingkan before/after.
import { chromium } from 'playwright';
import fs from 'node:fs';

const TABS = ['overview','health','command','recovery','team','governance','clients','acquisition',
  'business','finance','target','inventory','opname','payroll','opex','kpi','sop','actionplan',
  'marketing','accounting','sales','intake','diagnosis','internal','analytics','settings'];

const BASE_URL = process.env.TRACE_PREVIEW_URL || 'http://localhost:4173';

fs.mkdirSync('screenshots', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

for (const tab of TABS) {
  await page.goto(`${BASE_URL}/?view=${tab}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400); // biarkan animasi motion selesai
  await page.screenshot({ path: `screenshots/${tab}.png`, fullPage: true });
  console.log(`captured ${tab}`);
}

await browser.close();
console.log('Selesai. Bandingkan folder screenshots/ dari commit sebelum & sesudah refactor.');
