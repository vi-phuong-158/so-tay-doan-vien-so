import test from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil, getReportStatus, normalizeSafeFileName } from '../src/lib/status.mjs';

test('status mapping is readable', () => {
  assert.equal(getReportStatus('OVERDUE').label, 'Quá hạn');
  assert.equal(getReportStatus('ACCEPTED').tone, 'success');
});

test('daysUntil calculates whole remaining days', () => {
  assert.equal(daysUntil('2026-08-02T00:00:00+07:00', new Date('2026-07-30T20:00:00+07:00')), 3);
});

test('file name is normalized safely', () => {
  assert.equal(normalizeSafeFileName('Báo cáo Chi đoàn 01.pdf'), 'Bao-cao-Chi-doan-01.pdf');
});
