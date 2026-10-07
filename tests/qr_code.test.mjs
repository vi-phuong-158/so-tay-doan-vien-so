import assert from 'node:assert/strict';
import test from 'node:test';
import { generateQrMatrix, generateQrSvg } from '../src/lib/qrCode.js';

test('QR generator produces square matrix with finder patterns', () => {
  const url = 'https://so-tay-doan-vien-so.vercel.app/xac-minh-chung-nhan/NQ13-A83F19C2448E73B1';
  const matrix = generateQrMatrix(url);

  assert.ok(Array.isArray(matrix));
  const size = matrix.length;
  assert.ok(size >= 21, `Size ${size} should be at least 21`);
  for (const row of matrix) {
    assert.equal(row.length, size, 'Matrix must be square');
  }

  // Top-left finder pattern center must be black (1)
  assert.equal(matrix[3][3], true, 'Top-left finder center');
  // Top-right finder pattern center must be black (1)
  assert.equal(matrix[3][size - 4], true, 'Top-right finder center');
  // Bottom-left finder pattern center must be black (1)
  assert.equal(matrix[size - 4][3], true, 'Bottom-left finder center');
});

test('generateQrSvg returns valid SVG string', () => {
  const text = 'NQ13-TESTCODE1234';
  const svg = generateQrSvg(text, { size: 180 });

  assert.ok(svg.startsWith('<svg'), 'SVG tag starts');
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), 'XMLNS namespace');
  assert.ok(svg.includes('width="180"'), 'Width attribute');
  assert.ok(svg.includes('<rect'), 'Contains rect modules');
  assert.ok(svg.endsWith('</svg>'), 'SVG tag closes');
});
