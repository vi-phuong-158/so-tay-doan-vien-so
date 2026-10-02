// Acceptance harness only: real Auth and RPC; credentials come from an untracked fixture file.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const { chromium } = await import(pathToFileURL(resolve(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright/index.mjs')).href);
const guestMode = process.env.NQ_GUEST_MODE === '1';
const actor = guestMode ? null : JSON.parse(await readFile(process.env.NQ_BROWSER_ACTOR_FILE, 'utf8'));
const evidence = resolve('docs/quiz-300/evidence');
await mkdir(evidence, { recursive: true });
const origin = process.env.NQ_BASE_URL || 'http://127.0.0.1:5174';
const server = process.env.NQ_BASE_URL ? null : await createServer({ server: { host: '127.0.0.1', port: 5174 } });
await server?.listen();
const browser = await chromium.launch({ executablePath: process.env.NQ_CHROMIUM_PATH,
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
const page = await context.newPage();
const errors = [];
const states = [];
let anonymousIdentityCreated = false;
page.on('pageerror', (error) => errors.push(error.message));
page.on('response', async (response) => {
  if (guestMode && response.url().includes('/auth/v1/signup') && response.ok()) {
    assert.equal(new URL(response.url()).hostname, 'znexculhbdjiflkczpyu.supabase.co');
    const authResult = await response.json();
    anonymousIdentityCreated = authResult.user?.is_anonymous === true;
  }
  if (response.url().includes('/rpc/nq_attempt') && response.ok()) {
    assert.equal(new URL(response.url()).hostname, 'znexculhbdjiflkczpyu.supabase.co');
    // A navigation may discard a completed response body before this observer reads it.
    // State assertions below still require the subsequent live response from the new page.
    try {
      const state = await response.json();
      if (state) states.push(state);
    } catch { /* The page's RPC consumer and subsequent state assertions remain authoritative. */ }
  }
});
page.on('dialog', (dialog) => dialog.accept());
const quizPath = '/tri-thuc/trac-nghiem/7c620b81-6dc6-4a57-9908-3a1f68652a00';
try {
  if (process.env.NQ_PREVIEW_ACCESS_FILE) {
    await page.goto((await readFile(process.env.NQ_PREVIEW_ACCESS_FILE, 'utf8')).trim());
  }
  if (!guestMode) {
    await page.goto(`${origin}/login`);
    console.log('LOGIN_DOM', (await page.locator('body').innerText()).slice(0, 500));
    await page.getByLabel('Email', { exact: true }).fill(actor.email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(actor.password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForURL(origin + '/', { timeout: 45000 });
  }
  if (process.env.NQ_EXPIRY_ONLY) {
    await page.goto(`${origin}${quizPath}`);
    await page.getByRole('button', { name: 'Làm đề khác', exact: true }).waitFor({ timeout: 45000 });
    await page.getByRole('button', { name: 'Làm đề khác', exact: true }).click();
    await page.getByText('Câu 1 / 30', { exact: true }).waitFor({ timeout: 45000 });
    const ready = { attempt_id: states.at(-1).attempt_id };
    await writeFile(resolve(evidence, 'expiry-ready.json'), JSON.stringify(ready));
    console.log('EXPIRY_BROWSER_READY', JSON.stringify(ready));
    const until = Date.now() + 60000;
    while (Date.now() < until) {
      try { await readFile(process.env.NQ_EXPIRY_CONTROL_FILE); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
    }
    await page.reload();
    await page.getByText('Câu 1 / 30', { exact: true }).waitFor({ timeout: 45000 });
    await page.getByRole('button', { name: 'Xem lại đáp án', exact: true }).waitFor({ timeout: 45000 });
    assert.equal(states.at(-1).status, 'EXPIRED');
    assert.equal(states.at(-1).elapsed_seconds, 1200);
    await page.screenshot({ path: resolve(evidence, 'mobile-auto-submit.png'), fullPage: true });
    await writeFile(resolve(evidence, 'auto-submit-summary.json'), JSON.stringify({ auto_submit: 'PASS',
      status: states.at(-1).status, elapsed_seconds: states.at(-1).elapsed_seconds }, null, 2) + '\n');
    console.log('BROWSER_AUTO_SUBMIT_PASS');
  } else {
  await page.goto(`${origin}/tri-thuc`);
  await page.getByRole('tab', { name: 'Trắc nghiệm', exact: true }).click();
  await page.getByRole('link', { name: /Trắc nghiệm Nghị quyết/ }).click({ timeout: 45000 });
  await page.getByRole('button', { name: 'Bắt đầu thi', exact: true }).waitFor({ timeout: 45000 });
  if (guestMode) {
    assert.equal(anonymousIdentityCreated, true, 'A non-interactive Supabase guest session was created');
    await page.getByText('Miễn phí, không cần đăng nhập.', { exact: false }).waitFor();
  }
  await page.screenshot({ path: resolve(evidence, 'mobile-intro.png'), fullPage: true });
  await page.getByRole('button', { name: 'Bắt đầu thi', exact: true }).click();
  await page.getByText('Câu 1 / 30', { exact: true }).waitFor({ timeout: 45000 });
  const first = states.at(-1);
  assert.equal(first.questions.length, 30);
  assert.equal(new Set(first.questions.map((q) => q.id)).size, 30);
  assert.ok(!/correct|is_correct|answer_key/.test(JSON.stringify(first)));
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Câu tiếp', exact: true }).click();
  await page.getByRole('radio').nth(1).check();
  await page.getByText('Đã trả lời 2 / 30', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(evidence, 'mobile-attempt.png'), fullPage: true });
  await page.reload();
  await page.getByText('Câu 1 / 30', { exact: true }).waitFor({ timeout: 45000 });
  await page.getByText('Đã trả lời 2 / 30', { exact: true }).waitFor({ timeout: 45000 });
  const resumed = states.at(-1);
  assert.equal(resumed.attempt_id, first.attempt_id);
  assert.equal(resumed.expires_at, first.expires_at);
  assert.deepEqual(resumed.questions, first.questions);
  assert.equal(Object.values(resumed.answers).filter(Boolean).length, 2);
  // Navigate away, then reopen: server-owned state survives route unmount.
  await page.goto(`${origin}/tri-thuc`);
  await page.goto(`${origin}${quizPath}`);
  await page.getByText('Đã trả lời 2 / 30', { exact: true }).waitFor({ timeout: 45000 });
  // Brief offline autosave + reconnect preserves the pending selection.
  await context.setOffline(true);
  await page.getByRole('radio').nth(2).check();
  await context.setOffline(false);
  await page.reload();
  await page.getByText('Đã trả lời 2 / 30', { exact: true }).waitFor({ timeout: 45000 });
  await page.getByRole('radio').nth(2).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('input[type=radio]')[2]?.checked);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false);
  // Answer the rest through UI navigation, retaining the two existing answers.
  for (let i = 2; i < 30; i += 1) {
    await page.getByRole('button', { name: `Câu ${i + 1}, chưa trả lời`, exact: true }).click();
    await page.getByRole('radio').nth(i % 4).check();
  }
  await page.getByText('Đã trả lời 30 / 30', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Nộp bài', exact: true }).click();
  await page.getByRole('button', { name: 'Xem lại đáp án', exact: true }).waitFor({ timeout: 45000 });
  await page.screenshot({ path: resolve(evidence, 'mobile-result.png'), fullPage: true });
  const submitted = states.at(-1);
  assert.equal(submitted.correct + submitted.wrong + submitted.unanswered, 30);
  assert.equal(submitted.unanswered, 0);
  await page.getByRole('button', { name: 'Xem lại đáp án', exact: true }).click();
  assert.equal(await page.getByText('Đáp án đúng', { exact: false }).count(), 30);
  await page.screenshot({ path: resolve(evidence, 'mobile-review.png'), fullPage: true });
  await page.getByRole('button', { name: 'Tra cứu câu hỏi', exact: true }).click();
  for (const term of ['1', '300', 'Câu 125', 'công nghiệp']) {
    await page.getByRole('searchbox').fill(term);
    const response = page.waitForResponse((r) => r.url().includes('/rpc/lookup_nq_questions'));
    await page.getByRole('button', { name: 'Tìm', exact: true }).click();
    const rows = await (await response).json();
    assert.ok(rows.length > 0);
    if (term !== 'công nghiệp') assert.equal(rows[0].question_number, Number(term.replace('Câu ', '')));
    assert.equal(rows[0].options.length, 4);
    assert.ok('ABCD'.includes(rows[0].correct_answer));
  }
  // Changing the input must not append a different query using the previous offset.
  await page.getByRole('searchbox').fill('');
  let lookupResponse = page.waitForResponse((r) => r.url().includes('/rpc/lookup_nq_questions'));
  await page.getByRole('button', { name: 'Tìm', exact: true }).click();
  assert.equal((await (await lookupResponse).json()).length, 20);
  await page.getByRole('searchbox').fill('công nghiệp');
  assert.equal(await page.getByRole('button', { name: 'Xem thêm', exact: true }).isDisabled(), true);
  lookupResponse = page.waitForResponse((r) => r.url().includes('/rpc/lookup_nq_questions'));
  await page.getByRole('button', { name: 'Tìm', exact: true }).click();
  const keywordRows = await (await lookupResponse).json();
  await page.waitForFunction((count) => document.querySelectorAll('.nq-lookup-options').length === count, keywordRows.length);
  assert.deepEqual(await page.locator('.quiz-question-card h3').allTextContents(), keywordRows.map((q) => `Câu ${q.question_number}`));
  await page.screenshot({ path: resolve(evidence, 'mobile-lookup.png'), fullPage: true });
  for (const width of [360, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: resolve(evidence, 'desktop-lookup.png'), fullPage: true });
  await page.getByRole('button', { name: 'Quay lại trắc nghiệm', exact: true }).click();
  await page.getByRole('button', { name: 'Làm đề khác', exact: true }).click();
  await page.getByText('Câu 1 / 30', { exact: true }).waitFor({ timeout: 45000 });
  const retry = states.at(-1);
  assert.notEqual(retry.attempt_id, first.attempt_id);
  assert.notDeepEqual(retry.questions.map((q) => q.id), first.questions.map((q) => q.id));
  await page.screenshot({ path: resolve(evidence, 'desktop-attempt.png'), fullPage: true });
  assert.deepEqual(errors, []);
  const summary = { mobile: 'PASS', desktop: 'PASS', answer_leakage: 'PASS',
    resume: 'PASS', offline_reconnect: 'PASS', lookup: 'PASS', lookup_query_change: 'PASS',
    viewports: [360, 390, 430, 768, 1440], origin, auth_mode: guestMode ? 'anonymous_no_login' : 'member',
    browser_errors: errors,
    initial_attempt_id: first.attempt_id, final_attempt_id: retry.attempt_id };
  await writeFile(resolve(evidence, 'browser-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary));
  }
} catch (error) {
  await page.screenshot({ path: resolve(evidence, 'failure.png'), fullPage: true });
  console.error('BROWSER_FAILURE', error.message, 'DOM', (await page.locator('body').innerText()).slice(0, 2200));
  process.exitCode = 1;
} finally {
  await context.close(); await browser.close(); await server?.close();
}
