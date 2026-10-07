import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

test('Home.jsx: campaign hero banner contains required copy, CTAs, badge and accessibility', () => {
  const content = fs.readFileSync(path.join(root, 'src', 'pages', 'Home.jsx'), 'utf8');

  // Exact Campaign texts
  assert.ok(content.includes('KIỂM TRA HỌC TẬP'), 'Should contain kicker KIỂM TRA HỌC TẬP');
  assert.ok(content.includes('Nghị quyết Đại hội Đoàn toàn quốc lần thứ XIII'), 'Should contain title Nghị quyết Đại hội Đoàn toàn quốc lần thứ XIII');
  assert.ok(content.includes('30 câu hỏi · 20 phút · Đạt từ 80%'), 'Should contain meta 30 câu hỏi · 20 phút · Đạt từ 80%');
  assert.ok(content.includes('Hoàn thành đạt yêu cầu để nhận chứng nhận'), 'Should contain message Hoàn thành đạt yêu cầu để nhận chứng nhận');

  // Exact CTAs
  assert.ok(content.includes('BẮT ĐẦU THI'), 'Should contain primary CTA BẮT ĐẦU THI');
  assert.ok(content.includes('TRA CỨU 300 CÂU HỎI'), 'Should contain secondary CTA TRA CỨU 300 CÂU HỎI');

  // CTA Links
  assert.ok(content.includes('/tri-thuc/trac-nghiem/${NQ_QUIZ_ID}'), 'Primary CTA links to NQ quiz path');
  assert.ok(content.includes('/tri-thuc/trac-nghiem/${NQ_QUIZ_ID}?view=lookup'), 'Secondary CTA links to NQ lookup view');

  // Brand Asset
  assert.ok(content.includes('/brand/logo-doan-badge.png'), 'Should use official badge asset logo-doan-badge.png');

  // Accessibility
  assert.ok(content.includes('home-campaign-nq13'), 'Has CSS class home-campaign-nq13');
  assert.ok(content.includes('aria-label="Kiểm tra học tập Nghị quyết Đại hội Đoàn toàn quốc lần thứ XIII"'), 'Has accessible aria-label');
});

test('App.jsx: registers public certificate verification routes', () => {
  const content = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');

  assert.ok(content.includes('import { CertificateVerification } from \'./pages/CertificateVerification\';'), 'Imports CertificateVerification');
  assert.ok(content.includes('path="xac-minh-chung-nhan"'), 'Registers route xac-minh-chung-nhan');
  assert.ok(content.includes('path="xac-minh-chung-nhan/:code"'), 'Registers route xac-minh-chung-nhan/:code');
});

test('NqCertificate.jsx: adheres to official formatting and contains no fake signatures/stamps', () => {
  const content = fs.readFileSync(path.join(root, 'src', 'components', 'NqCertificate.jsx'), 'utf8');

  // Exact Title
  assert.ok(content.includes('CHỨNG NHẬN HOÀN THÀNH'), 'Certificate title is CHỨNG NHẬN HOÀN THÀNH');

  // Exact Activity
  assert.ok(content.includes('KIỂM TRA HỌC TẬP'), 'Activity title is KIỂM TRA HỌC TẬP');
  assert.ok(content.includes('NGHỊ QUYẾT ĐẠI HỘI ĐOÀN TOÀN QUỐC LẦN THỨ XIII'), 'Activity subtitle is NGHỊ QUYẾT ĐẠI HỘI ĐOÀN TOÀN QUỐC LẦN THỨ XIII');

  // Exact Issuer
  assert.ok(content.includes('BAN THANH NIÊN'), 'Issuer must include BAN THANH NIÊN');
  assert.ok(content.includes('CÔNG AN TỈNH PHÚ THỌ'), 'Issuer must include CÔNG AN TỈNH PHÚ THỌ');

  // Official badge
  assert.ok(content.includes('/brand/logo-doan-badge.png'), 'Uses official Đoàn badge');

  // Anti-tamper: No fake signatures, seals, stamps
  assert.ok(!content.includes('con_dau'), 'Must not contain fake seal keywords');
  assert.ok(!content.includes('chu_ky'), 'Must not contain fake signature keywords');
  assert.ok(!content.includes('dangerouslySetInnerHTML'), 'Must not use dangerouslySetInnerHTML');
});

test('NqQuiz.jsx: enforces pass/fail screens, participant gate, and certificate view', () => {
  const content = fs.readFileSync(path.join(root, 'src', 'pages', 'NqQuiz.jsx'), 'utf8');

  // Intro rules
  assert.ok(content.includes('KIỂM TRA HỌC TẬP'), 'Intro has kicker KIỂM TRA HỌC TẬP');
  assert.ok(content.includes('NGHỊ QUYẾT ĐẠI HỘI ĐOÀN TOÀN QUỐC LẦN THỨ XIII'), 'Intro has title NGHỊ QUYẾT ĐẠI HỘI ĐOÀN TOÀN QUỐC LẦN THỨ XIII');
  assert.ok(content.includes('24/30 câu đúng'), 'Mentions 24/30 minimum pass boundary');

  // Participant gate
  assert.ok(content.includes('Thông tin người dự thi'), 'Participant registration modal exists');
  assert.ok(content.includes('Tôi xác nhận thông tin trên là chính xác.'), 'Confirmation checkbox exists');
  assert.ok(content.includes('saveParticipant'), 'Calls saveParticipant service method');

  // Pass screen
  assert.ok(content.includes('HOÀN THÀNH ĐẠT YÊU CẦU'), 'Pass screen displays HOÀN THÀNH ĐẠT YÊU CẦU');
  assert.ok(content.includes('XEM CHỨNG NHẬN'), 'Pass screen has XEM CHỨNG NHẬN button');

  // Fail screen
  assert.ok(content.includes('CHƯA ĐẠT YÊU CẦU'), 'Fail screen displays CHƯA ĐẠT YÊU CẦU');
  assert.ok(content.includes('THI LẠI'), 'Fail screen has THI LẠI button');
  assert.ok(content.includes('Bạn cần thêm'), 'Fail screen has encouraging gap counter');

  // Certificate Modal integration
  assert.ok(content.includes('<NqCertificate'), 'Integrates NqCertificate component');
});
