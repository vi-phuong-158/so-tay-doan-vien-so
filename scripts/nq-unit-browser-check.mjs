// Real browser -> rehearsal Auth/RPC -> PostgreSQL. Never intercept or fabricate API data.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(pathToFileURL(resolve(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright/index.mjs')).href);
const origin = process.env.NQ_BASE_URL || 'http://127.0.0.1:5180';
const mode = process.argv[2] || 'ui';
const fixtureDir = process.env.NQ_UNIT_DIR || 'tmp/nq-unit-source';
const sessionPath = resolve(fixtureDir, 'browser-session.json');
const fixturePath = resolve(fixtureDir, 'browser-fixture.json');
const evidence = resolve(process.env.NQ_UNIT_EVIDENCE_DIR || 'tmp/nq-unit-source/browser-evidence');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.NQ_CHROMIUM_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 },
  ...(mode === 'finish' ? { storageState: sessionPath } : {}) });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('dialog', (dialog) => dialog.accept());
const quizPath = '/tri-thuc/trac-nghiem/7c620b81-6dc6-4a57-9908-3a1f68652a00';
const dashboardPath = '/tri-thuc/nq13/thanh-tich';
async function overflow() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
}
async function screenshot(name) { await page.screenshot({ path: resolve(evidence, name), fullPage: !name.startsWith('leaderboard-') }); }
async function assertPublicDashboard(response) {
  assert.equal(new URL(response.url()).hostname, 'znexculhbdjiflkczpyu.supabase.co');
  const data = await response.json();
  assert.equal(data.summary.unit_count, 148);
  assert.equal(data.units.length, 148);
  const allowed = new Set(['unit_code','unit_name','unit_type','active','eligible_members','participants','attempts',
    'average_best_score','pass_count','certificate_count','highest_score','latest_activity_at','completion_rate','pass_rate','ranking_status','competition_score','rank','statistics_suppressed']);
  for (const unit of data.units) for (const key of Object.keys(unit)) assert.ok(allowed.has(key), `public field ${key}`);
  assert.ok(!/(identity_key|full_name|auth_user|authenticated_user_id|attempt_id|certificate_code|email|answers)/.test(JSON.stringify(data)));
  assert.equal(data.config.public_min_participants, 3);
  for (const unit of data.units) {
    for (const key of ['eligible_members','completion_rate','rank','competition_score']) assert.equal(unit[key], null);
    assert.equal(unit.statistics_suppressed, unit.participants < 3);
    if (unit.statistics_suppressed) for (const key of ['average_best_score','pass_count','pass_rate','highest_score','certificate_count','latest_activity_at']) assert.equal(unit[key], null);
  }
  await writeFile(resolve(evidence, `public-dashboard-${mode}.json`), JSON.stringify(data, null, 2));
  return data;
}
try {
  if (process.env.NQ_PREVIEW_ACCESS_FILE) await page.goto((await readFile(process.env.NQ_PREVIEW_ACCESS_FILE, 'utf8')).trim());
  if (mode === 'participant') {
    console.log('BROWSER_STAGE_HOME');
    await page.goto(origin);
    await page.getByRole('link', { name: 'BẮT ĐẦU THI', exact: true }).click();
    console.log('BROWSER_STAGE_QUIZ');
    await page.getByRole('button', { name: 'BẮT ĐẦU THI', exact: true }).click();
    const name = `NQTEST Browser ${Date.now()}`;
    const initialSession = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.includes('-auth-token'))?.[1]);
    assert.ok(initialSession);
    await writeFile(fixturePath, JSON.stringify({ actor_id: JSON.parse(initialSession).user.id, attempt_id: null, participant_name: name, origin }, null, 2));
    await page.getByLabel('Họ và tên', { exact: false }).fill(name);
    await page.locator('#nq-unit-button').click();
    const search = page.getByRole('combobox', { name: 'Tìm tên xã/phường' });
    await search.fill('Việt Trì');
    await page.getByRole('option', { name: 'Phường Việt Trì', exact: true }).waitFor();
    await search.press('Escape');
    assert.equal(await search.count(), 0);
    await page.locator('#nq-unit-button').press('ArrowDown');
    await search.fill('viet tri');
    await page.getByRole('option', { name: 'Phường Việt Trì', exact: true }).waitFor();
    assert.equal(await page.getByRole('option').count(), 1);
    assert.ok((await page.getByRole('option').first().boundingBox()).height >= 44);
    assert.ok((await page.locator('#nq-unit-button').boundingBox()).height >= 44);
    await search.press('ArrowDown'); await search.press('ArrowUp');
    await overflow(); await screenshot('dropdown-390.png');
    await search.press('Enter');
    console.log('BROWSER_STAGE_UNIT_SELECTED');
    await page.locator('#nq-confirm-checkbox').check();
    const saving = page.waitForResponse((response) => response.url().endsWith('/rpc/nq_save_unit_participant') && response.ok());
    await page.getByRole('button', { name: 'Xác nhận và Bắt đầu', exact: true }).click();
    const savedResponse = await saving;
    console.log('BROWSER_STAGE_SNAPSHOT_SAVED');
    const participant = await savedResponse.json();
    assert.equal(participant.organization_name, 'Phường Việt Trì');
    const session = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.includes('-auth-token'))?.[1]);
    assert.ok(session);
    const parsed = JSON.parse(session);
    const attemptId = savedResponse.request().postDataJSON().p_attempt_id;
    assert.ok(attemptId);
    await context.storageState({ path: sessionPath });
    await writeFile(fixturePath, JSON.stringify({ actor_id: parsed.user.id, attempt_id: attemptId, participant_name: name,
      unit_id: participant.unit_id, unit_name: participant.organization_name, origin }, null, 2));
    await screenshot('attempt-390.png');
    console.log('NQ_UNIT_PARTICIPANT_BROWSER_PASS');
  } else if (mode === 'finish') {
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
    const keys = JSON.parse(await readFile(resolve(fixtureDir, 'browser-answer-key.json'), 'utf8'));
    await page.goto(`${origin}${quizPath}`);
    await page.getByText('Câu 1 / 30', { exact: true }).waitFor();
    for (let i = 0; i < keys.length; i++) {
      await page.locator('.quiz-option').nth(keys[i].option_index).getByRole('radio').check();
      if (i < keys.length - 1) await page.getByRole('button', { name: 'Câu tiếp', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Nộp bài', exact: true }).click();
    await page.getByText('HOÀN THÀNH ĐẠT YÊU CẦU', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'XEM CHỨNG NHẬN', exact: true }).click();
    await page.getByText(fixture.unit_name, { exact: true }).last().waitFor();
    await overflow(); await screenshot('certificate-390.png');
    await page.keyboard.press('Escape');
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/rpc/nq_competition_dashboard') && response.ok());
    await page.goto(`${origin}${dashboardPath}`);
    const data = await assertPublicDashboard(await responsePromise);
    const unit = data.units.find((u) => u.unit_name === fixture.unit_name);
    assert.equal(unit.participants, 1); assert.equal(unit.attempts, 1);
    assert.equal(unit.highest_score, null); assert.equal(unit.certificate_count, null); assert.equal(unit.pass_count, null);
    await screenshot('leaderboard-updated-390.png');
    console.log('NQ_UNIT_RESULT_CERTIFICATE_LEADERBOARD_BROWSER_PASS');
  } else if (mode === 'privacy') {
    const dataResponse = page.waitForResponse((response) => response.url().endsWith('/rpc/nq_competition_dashboard') && response.ok());
    await page.goto(`${origin}${dashboardPath}`);
    const data = await assertPublicDashboard(await dataResponse);
    for (const [code,count] of [['PT-NQ-132',1],['PT-NQ-133',2],['PT-NQ-134',3]]) {
      const unit = data.units.find((u) => u.unit_code === code);
      assert.equal(unit.participants, count); assert.equal(unit.attempts, count);
      assert.equal(unit.average_best_score, count === 3 ? 80 : null);
      await page.getByLabel('Tìm xã/phường', { exact: true }).fill(unit.unit_name);
      await page.getByRole('link', { name: unit.unit_name, exact: true }).last().click();
      if (count < 3) await page.getByText('Chưa đủ số người để công khai thống kê chi tiết', { exact: true }).waitFor();
      else assert.equal(await page.getByText('Chưa đủ số người để công khai thống kê chi tiết', { exact: true }).count(),0);
      await screenshot(`privacy-${count}-detail.png`);
      await page.getByRole('link', { name: 'Toàn tỉnh', exact: true }).click();
      await page.getByLabel('Tìm xã/phường', { exact: true }).fill('');
    }
    assert.equal(await page.locator('.nq-competition-top').count(), 0);
    assert.equal(await page.getByRole('columnheader', { name: /Hạng|Điểm thi đua/ }).count(), 0);
    await page.getByLabel('Triển khai', { exact: true }).selectOption('ready');
    await page.getByText('1 đơn vị phù hợp', { exact: true }).waitFor();
    for (const width of [390,1440]) {
      await page.setViewportSize({ width, height: 844 }); await overflow();
      await page.getByRole('heading', { name: 'BẢNG TỔNG HỢP HỌC TẬP NGHỊ QUYẾT XIII', exact: true }).scrollIntoViewIfNeeded();
      await screenshot(`statistics-ready-${width}.png`);
    }
    const refreshed = page.waitForResponse((response) => response.url().endsWith('/rpc/nq_competition_dashboard') && response.ok());
    await page.getByRole('button', { name: 'Cập nhật', exact: true }).click();
    const again = await assertPublicDashboard(await refreshed);
    assert.deepEqual(again.units, data.units);
    await page.reload(); await page.getByText('BẢNG TỔNG HỢP HỌC TẬP NGHỊ QUYẾT XIII', { exact: true }).waitFor();
    assert.ok(!(await page.locator('body').innerText()).includes('NaN'));
    console.log('NQ_UNIT_SMALL_CELL_PRIVACY_REFRESH_BROWSER_PASS');
  } else {
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/rpc/nq_competition_dashboard') && response.ok());
    await page.goto(`${origin}${dashboardPath}`);
    const data = await assertPublicDashboard(await responsePromise);
    await page.getByText('148 đơn vị phù hợp', { exact: true }).waitFor();
    for (const width of [360,390,430,768,1440]) {
      await page.setViewportSize({ width, height: 844 }); await overflow();
      if (width === 390 || width === 1440) await screenshot(`leaderboard-${width}.png`);
    }
    await page.getByLabel('Tìm xã/phường', { exact: true }).fill('viet tri');
    await page.getByText('1 đơn vị phù hợp', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Phường Việt Trì', exact: true }).last().click();
    await page.getByRole('heading', { name: 'Phường Việt Trì', exact: true }).first().waitFor();
    await overflow(); await screenshot('unit-detail-1440.png');
    await page.getByRole('link', { name: 'Toàn tỉnh', exact: true }).click();
    await page.getByLabel('Tìm xã/phường', { exact: true }).fill('');
    await page.getByLabel('Loại đơn vị', { exact: true }).selectOption('phuong');
    await page.getByText('15 đơn vị phù hợp', { exact: true }).waitFor();
    await page.getByLabel('Loại đơn vị', { exact: true }).selectOption('xa');
    await page.getByText('133 đơn vị phù hợp', { exact: true }).waitFor();
    await page.getByLabel('Loại đơn vị', { exact: true }).selectOption('');
    await page.getByLabel('Triển khai', { exact: true }).selectOption('incomplete');
    assert.ok(data.units.some((u) => u.statistics_suppressed));
    await page.getByLabel('Triển khai', { exact: true }).selectOption('missing');
    await page.getByText(`${data.summary.missing_units} đơn vị phù hợp`, { exact: true }).waitFor();
    await page.goto(`${origin}/admin/nq13-thanh-tich`);
    await page.getByText('Đăng nhập để tiếp tục', { exact: false }).waitFor();
    console.log('NQ_UNIT_PUBLIC_UI_PRIVACY_RESPONSIVE_BROWSER_PASS');
  }
  assert.deepEqual(errors, []);
} catch (error) {
  await screenshot(`failure-${mode}.png`).catch(() => {});
  console.error('BROWSER_FAILURE_PAGE', page.url().split('?')[0], (await page.locator('body').innerText()).slice(0, 900));
  throw error;
} finally { await browser.close(); }
