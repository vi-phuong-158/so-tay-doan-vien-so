import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('src/index.css');

test('Brand uses the Đoàn badge asset and no retired logo is referenced', () => {
  for (const file of ['src/components/common.jsx', 'src/pages/auth/Login.jsx', 'index.html', 'preview.html', 'public/manifest.webmanifest', 'public/sw.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /app-icon\.svg|logo-doan\.jpg/, `${file} still references a retired logo`);
  }
  assert.match(read('src/components/common.jsx'), /\/brand\/logo-doan-badge\.png/);
  for (const asset of ['logo-doan-badge.png', 'app-icon-192.png', 'app-icon-512.png', 'favicon-64.png']) {
    assert.ok(fs.existsSync(new URL(`../public/brand/${asset}`, import.meta.url)), asset);
  }
});

test('mobile header logo stays 30-36px tall and never squeezes the text', () => {
  assert.match(css, /\.home-hero \.brand img\{width:auto;height:32px\}/);
  assert.match(css, /\.brand-compact img\{width:auto;height:32px\}/);
  assert.match(css, /\.brand>div\{min-width:0\}/);
  assert.match(css, /\.home-hero \.hero-top>\.brand\{flex:1 1 0;min-width:0\}/);
});

test('public knowledge card is a single column on mobile with the CTA below the copy', () => {
  assert.match(css, /\.home-public-card\{display:grid;grid-template-columns:minmax\(0,1fr\);/);
  assert.match(css, /\.home-public-actions\{display:flex;flex-wrap:wrap;/);
});

test('quick-action cards use equal shrinkable columns and clamp titles to two lines', () => {
  assert.match(css, /\.metrics-grid\.overlap\{margin-top:-37px;gap:8px;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
  assert.match(css, /\.metric-card strong\{font-size:16px;[^}]*-webkit-line-clamp:2/);
});

test('home page reserves room for the fixed bottom navigation', () => {
  assert.match(css, /--bottom-nav-h:62px/);
  assert.match(css, /\.home-page\{width:100%;padding:0 0 calc\(var\(--bottom-nav-h\) \+ 32px \+ env\(safe-area-inset-bottom\)\)\}/);
});

test('mobile hero is full-bleed: only the bottom corners are rounded and the status bar matches', () => {
  assert.match(css, /\.home-hero\{min-height:0;[^}]*background:#1257c4;border-radius:0 0 24px 24px\}/);
  for (const file of ['index.html', 'preview.html']) assert.match(read(file), /name="theme-color" content="#1257C4"/, file);
  assert.match(read('public/manifest.webmanifest'), /"theme_color": "#1257C4"/);
});

test('guest quick cards share one icon tone and the bottom nav marks the active tab with a pill', () => {
  const home = read('src/pages/Home.jsx');
  assert.match(home, /icon="file-search"[^>]*tone="blue"/);
  assert.match(home, /icon="school"[^>]*tone="blue"/);
  assert.match(home, /icon="bulb"[^>]*tone="blue"/);
  assert.match(css, /\.bottom-nav a\.active \.nav-icon\{background:var\(--brand-100\)\}/);
  assert.match(css, /\.button-primary,\.button-primary:hover\{background:var\(--brand-700\);box-shadow:none\}/);
});

test('mobile top bar is the same brand blue as the home hero and app bars', () => {
  assert.match(css, /@media\(max-width:960px\)\{\s*\.mobile-topbar\{[^}]*background:var\(--brand-700\);border-bottom:0\}/);
  assert.match(css, /\.mobile-topbar \.brand strong\{color:#fff\}/);
});

test('login offers a way back to the public home and shows the logo once', () => {
  const login = read('src/pages/auth/Login.jsx');
  assert.match(login, /<Link className="login-back" to="\/">/);
  assert.equal((login.match(/logo-doan-badge\.png/g) || []).length, 1);
});

test('empty state inside a bordered list does not draw a second dashed border', () => {
  assert.match(css, /\.document-list \.empty-state\{margin-top:0;border:0;border-radius:0;background:transparent\}/);
});

test('guest-facing copy does not mention an account the visitor does not have', () => {
  for (const file of ['src/pages/Knowledge.jsx', 'src/pages/LearningTopics.jsx']) {
    assert.doesNotMatch(read(file), /được công bố cho tài khoản của bạn/, file);
  }
  assert.match(read('src/pages/Home.jsx'), /Tài khoản cần thiết khi bạn làm bài/);
});

test('mobile bottom nav and metric cards are each defined once per breakpoint', () => {
  const count = (re) => (css.match(re) || []).length;
  assert.equal(count(/[{}]\s*\.bottom-nav\{/g), 2, '.bottom-nav: hidden on desktop + one mobile block');
  assert.equal(count(/[{}]\s*\.metric-card\{/g), 2, '.metric-card: one base + one mobile block');
  assert.equal(count(/[{}]\s*\.bottom-nav a\{/g), 1);
  assert.equal(count(/[{}]\s*\.bottom-nav a\.active\{/g), 1);
});

test('brand logo is the owner-confirmed asset and no longer marked as pending', () => {
  assert.doesNotMatch(read('src/components/common.jsx'), /BRAND_LOGO_PENDING_OWNER_ASSET/);
  assert.match(read('docs/02-design-system.md'), /BRAND_LOGO_OWNER_CONFIRMED/);
});
