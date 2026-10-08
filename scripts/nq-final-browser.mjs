// Real Preview acceptance. Keys are supplied only for this exact owned synthetic attempt.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import jsQR from 'jsqr';

const runtime = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const { chromium } = await import(pathToFileURL(resolve(runtime, 'playwright/index.mjs')).href);
const sharp = createRequire(import.meta.url)(resolve(runtime, 'sharp'));
const base = process.env.NQ_BASE_URL;
const correct = Number(process.env.NQ_CORRECT || 24);
const mode = process.argv[2] || 'start';
assert.ok(base?.startsWith('https://')); assert.ok([23,24,30].includes(correct));
const dir = resolve(process.env.NQ_FINAL_DIR || 'tmp/nq-final');
await mkdir(dir, { recursive: true });
const fixturePath = resolve(dir, `fixture-${correct}.json`);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const storage = mode !== 'start' ? JSON.parse(await readFile(resolve(dir, `session-${correct}.json`), 'utf8')) : null;
if (storage) storage.origins = storage.origins.map((o) => ({ ...o, origin: base }));
const context = await browser.newContext({ viewport: { width: 390, height: 844 },
  ...(storage ? { storageState: storage } : {}) });
const page = await context.newPage();
page.on('dialog', (dialog) => dialog.accept());
const errors = []; page.on('pageerror', (err) => errors.push(err.message));
const quizPath = '/tri-thuc/trac-nghiem/7c620b81-6dc6-4a57-9908-3a1f68652a00';
try {
  await page.goto((await readFile('tmp/nq-final-access.txt', 'utf8')).trim());
  if (mode === 'start') {
    await page.goto(base);
    await page.getByRole('link', { name: 'BẮT ĐẦU THI', exact: true }).click();
    await page.getByRole('button', { name: 'BẮT ĐẦU THI', exact: true }).click();
    const name = `NQFINAL ${correct} ${Date.now()}`;
    const session = JSON.parse(await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.includes('-auth-token'))[1]));
    const fixture = { actor_id: session.user.id, participant_name: name, attempt_id: null, origin: base };
    await writeFile(fixturePath, JSON.stringify(fixture));
    await page.getByLabel('Họ và tên', { exact: false }).fill(name);
    await page.getByLabel('Đơn vị', { exact: false }).fill('NQFINAL REHEARSAL ONLY');
    await page.locator('#nq-confirm-checkbox').check();
    const saving = page.waitForResponse((r) => r.url().endsWith('/rpc/nq_save_participant') && r.ok());
    await page.getByRole('button', { name: 'Xác nhận và Bắt đầu', exact: true }).click();
    const response = await saving;
    fixture.attempt_id = response.request().postDataJSON().p_attempt_id;
    await context.storageState({ path: resolve(dir, `session-${correct}.json`) });
    await writeFile(fixturePath, JSON.stringify(fixture));
    console.log(`NQFINAL_START_${correct}_PASS`);
  } else {
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
    await page.goto(`${base}${quizPath}`);
    if (mode === 'finish') {
      const keys = JSON.parse(await readFile(resolve(dir, `keys-${correct}.json`), 'utf8'));
      await page.getByText('Câu 1 / 30', { exact: true }).waitFor();
      for (let i = 0; i < 30; i++) {
        const index = i < correct ? keys[i].option_index : (keys[i].option_index + 1) % 4;
        await page.locator('.quiz-option').nth(index).getByRole('radio').check();
        if (i < 29) await page.getByRole('button', { name: 'Câu tiếp', exact: true }).click();
      }
      const submitted = page.waitForResponse((r) => r.url().endsWith('/rpc/nq_attempt')
        && r.request().postDataJSON()?.p_action === 'submit' && r.ok());
      await page.getByRole('button', { name: 'Nộp bài', exact: true }).click();
      const result = await (await submitted).json();
      assert.equal(result.correct, correct); assert.equal(result.passed, correct >= 24);
      assert.equal(result.percentage, correct === 23 ? 76.67 : correct === 24 ? 80 : 100);
      await writeFile(resolve(dir, `result-${correct}.json`), JSON.stringify(result));
    }
    if (correct === 23) {
      await page.getByText('CHƯA ĐẠT YÊU CẦU', { exact: true }).waitFor();
      await page.getByText(/Bạn cần thêm 1 câu đúng/).waitFor();
      assert.equal(await page.getByRole('button', { name: 'XEM CHỨNG NHẬN', exact: true }).count(), 0);
      const result = JSON.parse(await readFile(resolve(dir, `result-${correct}.json`), 'utf8'));
      assert.equal(result.certificate, null);
      await page.screenshot({ path: resolve(dir, 'fail-23.png'), fullPage: true });
      console.log('NQFINAL_BROWSER_23_FAIL_PASS');
    } else {
      await page.getByText('HOÀN THÀNH ĐẠT YÊU CẦU', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'XEM CHỨNG NHẬN', exact: true }).click();
      await page.locator('.nq-certificate-name').waitFor();
      if (mode === 'inspect') {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.emulateMedia({ media: 'print' });
        console.log(JSON.stringify(await page.locator('.nq-certificate').evaluate((element) => {
          const rows = [];
          for (let e = element; e; e = e.parentElement) {
            const s = getComputedStyle(e), r = e.getBoundingClientRect();
            rows.push({ tag: e.tagName, cls: e.className, rect: [r.x,r.y,r.width,r.height],
              visibility: s.visibility, display: s.display, overflow: s.overflow, position: s.position, transform: s.transform });
          }
          return rows;
        })));
        await page.screenshot({ path: resolve(dir, 'print-debug.png'), fullPage: true });
        await page.pdf({ path: resolve(dir, 'certificate-debug.pdf'), printBackground: true, preferCSSPageSize: true });
        process.exitCode = 0;
      } else {
      await page.screenshot({ path: resolve(dir, 'certificate-mobile.png'), fullPage: true });
      const downloading = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Tải chứng nhận (PNG)', exact: true }).click();
      await (await downloading).saveAs(resolve(dir, 'certificate.png'));
      const decoded = await sharp(resolve(dir, 'certificate.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const qr = jsQR(new Uint8ClampedArray(decoded.data), decoded.info.width, decoded.info.height);
      const result = JSON.parse(await readFile(resolve(dir, `result-${correct}.json`), 'utf8'));
      const expected = `${base}/xac-minh-chung-nhan/${result.certificate.code}`;
      assert.equal(qr?.data, expected);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: resolve(dir, 'certificate-desktop.png'), fullPage: true });
      await page.getByRole('button', { name: 'In / Lưu PDF', exact: true }).click();
      await page.pdf({ path: resolve(dir, 'certificate.pdf'), format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
      const verified = page.waitForResponse((r) => r.url().endsWith('/rpc/verify_nq_certificate') && r.ok());
      await page.goto(expected);
      const publicCert = await (await verified).json();
      assert.ok(!/(attempt_id|user_id|auth_id|email|answers)/.test(JSON.stringify(publicCert)));
      await page.getByText('CHỨNG NHẬN HỢP LỆ', { exact: true }).waitFor();
      await page.getByText(fixture.participant_name, { exact: true }).waitFor();
      await page.screenshot({ path: resolve(dir, 'verification.png'), fullPage: true });
      await writeFile(resolve(dir, 'qr-receipt.json'), JSON.stringify({ expected, decoded: qr.data, width: decoded.info.width, height: decoded.info.height }));
      console.log('NQFINAL_BROWSER_PASS_PNG_QR_VERIFY_PDF_CREATED');
      }
    }
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
