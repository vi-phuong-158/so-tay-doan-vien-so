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
