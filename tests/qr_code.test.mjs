import assert from 'node:assert/strict';
import test from 'node:test';
import jsQR from 'jsqr';
import {
  generateQrMatrix,
  generateQrSvg,
  getQrVersion,
  QR_QUIET_ZONE
} from '../src/lib/qrCode.js';

function decodeMatrix(matrix, margin = QR_QUIET_ZONE, scale = 8) {
  const modules = matrix.length + margin * 2;
  const width = modules * scale;
  const pixels = new Uint8ClampedArray(width * width * 4);
  pixels.fill(255);

  matrix.forEach((row, y) => row.forEach((dark, x) => {
    if (!dark) return;
    for (let py = (y + margin) * scale; py < (y + margin + 1) * scale; py += 1) {
      for (let px = (x + margin) * scale; px < (x + margin + 1) * scale; px += 1) {
        const offset = (py * width + px) * 4;
        pixels[offset] = 0;
        pixels[offset + 1] = 0;
        pixels[offset + 2] = 0;
        pixels[offset + 3] = 255;
      }
    }
  }));

  return jsQR(pixels, width, width, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

const payloads = [
  ['short code', 'NQ13-TESTCODE1234'],
  [
    'verification URL',
    'https://so-tay-doan-vien-so.vercel.app/xac-minh-chung-nhan/NQ13-4E6FBD0421A64629'
  ],
  [
    'long Preview-style URL',
    'https://so-tay-doan-vien-git-codex-nq13-certificate-redesign-acceptance-20261008-vi-phuong-158s-projects.vercel.app/xac-minh-chung-nhan/NQ13-4E6FBD0421A64629?source=preview-acceptance'
  ]
];

for (const [label, payload] of payloads) {
  test(`independent jsQR decoder reads exact ${label} payload`, () => {
    const matrix = generateQrMatrix(payload);
    assert.equal(decodeMatrix(matrix), payload);
  });
}

test('long Preview-style payload uses QR Version 7 or newer', () => {
  assert.ok(getQrVersion(payloads[2][1]) >= 7);
});

test('quiet zone is at least four modules in SVG output', () => {
  const payload = 'https://preview.example.vercel.app/xac-minh-chung-nhan/NQ13-TESTCODE1234';
  const matrix = generateQrMatrix(payload);
  const svg = generateQrSvg(payload, { margin: 1, size: 180 });
  const viewBox = svg.match(/viewBox="0 0 (\d+) (\d+)"/);

  assert.equal(QR_QUIET_ZONE, 4);
  assert.deepEqual(viewBox?.slice(1).map(Number), [matrix.length + 8, matrix.length + 8]);
  assert.ok(svg.includes(`x="4" y="4" width="1" height="1"`));
});

test('generateQrSvg returns a complete SVG', () => {
  const svg = generateQrSvg('NQ13-TESTCODE1234', { size: 180 });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes('width="180"'));
  assert.ok(svg.includes('<rect'));
  assert.ok(svg.endsWith('</svg>'));
});
