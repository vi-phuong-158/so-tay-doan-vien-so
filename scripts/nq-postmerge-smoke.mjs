// Read-only public smoke on the immutable master deployment. No synthetic Auth actors are created.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(resolve(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright/index.mjs')).href);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = []; const mutations = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (/\/auth\/v1\/(signup|token)|\/rpc\/(ensure_nq_quiz_guest|nq_save|nq_start)/.test(request.url())) mutations.push(request.url().split('?')[0]);
});
const base = process.env.NQ_BASE_URL;
try {
  await page.goto((await readFile(process.env.NQ_PREVIEW_ACCESS_FILE, 'utf8')).trim());
  await page.goto(base);
  await page.getByRole('link', { name: 'BẮT ĐẦU THI', exact: true }).waitFor();
  if (process.env.NQ_MASTER_STATS === '1') {
    await page.goto(`${base}/tri-thuc/nq13/thanh-tich`);
    await page.getByText('148 đơn vị phù hợp', { exact: true }).waitFor();
    assert.equal(await page.locator('.nq-competition-top').count(), 0);
  }
  await page.goto(`${base}/xac-minh-chung-nhan/NQ13-NQFINALINVALID`);
  await page.getByText(/Không tìm thấy chứng nhận/i).first().waitFor();
  await page.goto(`${base}/admin`);
  await page.getByText('Đăng nhập để tiếp tục', { exact: false }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []); assert.deepEqual(mutations, []);
  console.log('NQ_POSTMERGE_READ_ONLY_BROWSER_SMOKE_PASS');
} finally { await browser.close(); }
