import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CERTIFICATE_VERDICT_TEXT,
  CERTIFICATE_WATERMARK_OPACITY
} from '../src/lib/certificateCanvas.js';
import {
  validateParticipantInfo,
  formatCertificateDate,
  sanitizeCertificateFileName,
  isValidNqCertificateRecord,
  canViewNqCertificate,
  mapNqCertificateRecord,
  PASS_SCORE_PERCENT,
  PASS_MIN_CORRECT,
  TOTAL_QUESTIONS,
  createNqQuizService
} from '../src/services/nqQuizService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const cssRule = (styles, selector) => {
  const match = styles.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `CSS rule ${selector} must exist`);
  return match[1];
};

test('certificate V2 HTML viewer keeps the signer hierarchy, official badge and watermark', () => {
  const component = fs.readFileSync(path.join(root, 'src', 'components', 'NqCertificate.jsx'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'index.css'), 'utf8');

  assert.match(component, /src=\{CERTIFICATE_SIGNATURE_SRC\}/);
  assert.equal(component.includes('/brand/chu-ky.png'), false);
  assert.match(component, /src="\/brand\/logo-doan-badge\.png"/);
  assert.match(component, /className="nq-certificate-watermark"/);
  assert.match(component, /alt="Huy hiệu Đoàn TNCS Hồ Chí Minh"/);
  const order = ['TM. BAN THANH NIÊN', 'TRƯỞNG BAN', 'nq-certificate-signature', 'Hoàng Tuấn Việt'].map((text) => {
    const index = component.indexOf(text);
    assert.ok(index > -1, `Certificate signer hierarchy must include ${text}`);
    return index;
  });
  assert.deepEqual(order, [...order].sort((x, y) => x - y), 'signer hierarchy order must be role, title, seal, name');
  assert.match(component, /disabled=\{downloading \|\| !assetsReady\}/);
  assert.match(component, /onError=\{markAssetFailed\}/);
  const watermarkRule = cssRule(styles, '.nq-certificate-watermark');
  assert.match(watermarkRule, /height:\s*46%;/);
  assert.equal(/(^|[\s;])opacity\s*:/.test(watermarkRule), false, 'watermark opacity has a single source: CERTIFICATE_WATERMARK_OPACITY');
  assert.match(component, /className="nq-certificate-watermark"\s+style=\{\{ opacity: CERTIFICATE_WATERMARK_OPACITY \}\}/);
  assert.match(styles, /@page\s*\{\s*size:\s*A4 landscape;\s*margin:\s*0;/);
});

test('certificate verdict copy and watermark strength are shared by HTML, PNG and print', () => {
  const component = fs.readFileSync(path.join(root, 'src', 'components', 'NqCertificate.jsx'), 'utf8');
  const canvas = fs.readFileSync(path.join(root, 'src', 'lib', 'certificateCanvas.js'), 'utf8');

  assert.equal(CERTIFICATE_VERDICT_TEXT, 'đã hoàn thành và đạt yêu cầu');
  assert.match(component, /nq-certificate-verdict-intro">\{CERTIFICATE_VERDICT_TEXT\}</);
  assert.match(canvas, /drawCenteredText\(ctx, CERTIFICATE_VERDICT_TEXT,/);
  assert.match(canvas, /ctx\.globalAlpha = CERTIFICATE_WATERMARK_OPACITY;/);
  // The sentence is defined once; no component or CSS re-types an older variant.
  assert.equal(component.includes('đã hoàn thành đạt yêu cầu'), false);
  assert.equal(canvas.includes('đã hoàn thành đạt yêu cầu'), false);
  assert.equal(canvas.split('đã hoàn thành và đạt yêu cầu').length - 1, 1);
  assert.ok(CERTIFICATE_WATERMARK_OPACITY >= 0.025 && CERTIFICATE_WATERMARK_OPACITY <= 0.03);
});

test('certificate viewer is a group inside the NQ13 modal, which is the only dialog', () => {
  const component = fs.readFileSync(path.join(root, 'src', 'components', 'NqCertificate.jsx'), 'utf8');
  const quiz = fs.readFileSync(path.join(root, 'src', 'pages', 'NqQuiz.jsx'), 'utf8');

  assert.equal(/role="dialog"|aria-modal/.test(component), false, 'NqCertificate must not declare a nested dialog');
  assert.match(component, /role="group" aria-label="Chứng nhận hoàn thành"/);
  const modal = quiz.slice(quiz.indexOf('Certificate Viewer Modal'));
  assert.match(modal, /className="nq-cert-modal-backdrop"\s+role="dialog"\s+aria-modal="true"\s+aria-label="Chứng nhận hoàn thành bài kiểm tra"/);
  assert.equal(modal.match(/role="dialog"/g).length, 1);
});

test('certificate signature is shown whole (contain, auto width) and never cropped with cover', () => {
  const styles = fs.readFileSync(path.join(root, 'src', 'index.css'), 'utf8');
  const signature = cssRule(styles, '.nq-certificate-signature');
  assert.match(signature, /object-fit:\s*contain/);
  assert.match(signature, /width:\s*auto/);
  assert.equal(/object-fit:\s*cover/.test(signature), false);
  assert.equal(/object-position/.test(signature), false);
  // No certificate rule (screen or print) may force a fixed width AND height onto the signature.
  assert.equal(/\.nq-certificate-signature\s*\{[^}]*(?:mm|px)[^}]*width:\s*\d+(?:mm|px)[^}]*height:\s*\d+(?:mm|px)/s.test(styles.replace(signature, '')), false);
  const printBlock = styles.slice(styles.indexOf('@media print'));
  assert.equal(/\.nq-certificate-signature/.test(printBlock), false, 'print must reuse the screen signature rule');
});

test('certificate scales to the viewport instead of forcing horizontal scrolling', () => {
  const component = fs.readFileSync(path.join(root, 'src', 'components', 'NqCertificate.jsx'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'index.css'), 'utf8');
  const screenStyles = styles.slice(0, styles.indexOf('@media print'));

  assert.match(cssRule(styles, '.nq-certificate'), /width:\s*860px;[\s\S]*height:\s*608px;[\s\S]*transform:\s*scale\(var\(--cert-scale\)\)/);
  assert.match(cssRule(styles, '.nq-certificate-fit'), /width:\s*calc\(860px \* var\(--cert-scale\)\)/);
  assert.match(cssRule(styles, '.nq-certificate-fit'), /height:\s*calc\(608px \* var\(--cert-scale\)\)/);
  assert.match(component, /Math\.min\(1, available \/ CERTIFICATE_DESIGN_WIDTH\)/);
  assert.match(component, /ResizeObserver/);
  assert.equal(/\.nq-certificate-scrollable/.test(styles), false);
  assert.equal(/\.nq-certificate[^{]*\{[^}]*overflow-x:\s*auto/s.test(screenStyles), false);
  assert.equal(/\.nq-certificate\s*\{[^}]*flex:\s*0 0 860px/s.test(styles), false);
});

test('certificate print contract: one A4 landscape page, scaled design, no toolbar, fail-closed', () => {
  const styles = fs.readFileSync(path.join(root, 'src', 'index.css'), 'utf8');
  const printBlock = styles.slice(styles.indexOf('@media print'));

  assert.match(printBlock, /@page\s*\{\s*size:\s*A4 landscape;\s*margin:\s*0;/);
  assert.match(printBlock, /\.nq-certificate-fit\s*\{[^}]*--cert-scale:\s*1\.3053\s*!important/s);
  assert.match(printBlock, /\.nq-certificate-fit\s*\{[^}]*width:\s*297mm[^}]*height:\s*210mm/s);
  assert.match(printBlock, /\.nq-certificate-toolbar\s*\{\s*display:\s*none\s*!important/);
  assert.match(printBlock, /break-inside:\s*avoid-page/);
  assert.match(printBlock, /data-assets-ready="false"\]\s*\.nq-certificate\s*\{\s*display:\s*none\s*!important/);
  // 297mm at 96dpi / 860px design width.
  assert.ok(Math.abs((297 * 96 / 25.4) / 860 - 1.3053) < 0.0005);
});

test('validateParticipantInfo: accepts valid Vietnamese names and organization names', () => {
  const result = validateParticipantInfo('Nguyễn Thị Thu Hà', 'Chi đoàn An ninh mạng - CAT Phú Thọ');
  assert.equal(result.valid, true);
  assert.equal(result.data.fullName, 'Nguyễn Thị Thu Hà');
  assert.equal(result.data.organizationName, 'Chi đoàn An ninh mạng - CAT Phú Thọ');
  assert.equal(Object.keys(result.errors).length, 0);
});

test('validateParticipantInfo: trims extra whitespace', () => {
  const result = validateParticipantInfo('   Trần Văn Bình   ', '   Công an huyện Cẩm Khê   ');
  assert.equal(result.valid, true);
  assert.equal(result.data.fullName, 'Trần Văn Bình');
  assert.equal(result.data.organizationName, 'Công an huyện Cẩm Khê');
});

test('validateParticipantInfo: rejects empty or too short names', () => {
  const empty = validateParticipantInfo('', 'Đoàn cơ sở');
  assert.equal(empty.valid, false);
  assert.match(empty.errors.fullName, /họ và tên/i);

  const tooShort = validateParticipantInfo('A', 'Đoàn cơ sở');
  assert.equal(tooShort.valid, false);
  assert.match(tooShort.errors.fullName, /từ 2 đến 120/i);
});

test('validateParticipantInfo: rejects empty or too short organization names', () => {
  const emptyOrg = validateParticipantInfo('Nguyễn Văn An', '');
  assert.equal(emptyOrg.valid, false);
  assert.match(emptyOrg.errors.organizationName, /đơn vị/i);

  const tooShortOrg = validateParticipantInfo('Nguyễn Văn An', 'X');
  assert.equal(tooShortOrg.valid, false);
  assert.match(tooShortOrg.errors.organizationName, /từ 2 đến 180/i);
});

test('formatCertificateDate: formats valid dates as DD/MM/YYYY and handles empty safely', () => {
  assert.equal(formatCertificateDate('2026-10-08T10:30:00.000Z'), '08/10/2026');
  assert.equal(formatCertificateDate('2026-03-26'), '26/03/2026');
  assert.equal(formatCertificateDate(null), '');
  assert.equal(formatCertificateDate(undefined), '');
  assert.equal(formatCertificateDate('invalid-date'), '');
});

test('sanitizeCertificateFileName: strips Vietnamese diacritics and invalid file characters', () => {
  const name1 = sanitizeCertificateFileName('Nguyễn Văn Đạt');
  assert.equal(name1, 'Chung-nhan-NQ13-NGUYEN-VAN-DAT.png');

  const name2 = sanitizeCertificateFileName('Lê Thị Ánh Tuyết / Ban Thanh Niên');
  assert.equal(name2, 'Chung-nhan-NQ13-LE-THI-ANH-TUYET-BAN-THANH-NIEN.png');

  const empty = sanitizeCertificateFileName('');
  assert.equal(empty, 'Chung-nhan-NQ13.png');
});

test('certificate viewer requires PASS and a complete backend certificate record', () => {
  const certificate = {
    code: 'NQ13-4E6FBD0421A64629',
    full_name: 'Nguyễn Thị Phương Thảo',
    organization_name: 'Chi đoàn Phòng An ninh đối ngoại - Công an tỉnh Phú Thọ',
    issued_at: '2026-10-08T10:30:00.000Z',
    score: 80,
    correct_count: 24,
    total_questions: 30
  };

  assert.equal(canViewNqCertificate(true, certificate), true);
  assert.equal(canViewNqCertificate(true, null), false);
  assert.equal(canViewNqCertificate(true, { code: 'NQ13-4E6FBD0421A64629' }), false);
  assert.equal(canViewNqCertificate(false, certificate), false);
  assert.equal(isValidNqCertificateRecord({ ...certificate, issued_at: null }), false);
  assert.equal(isValidNqCertificateRecord({ ...certificate, issued_at: 1791455400000 }), false);
  assert.equal(isValidNqCertificateRecord({ ...certificate, code: '' }), false);
  assert.equal(isValidNqCertificateRecord({ ...certificate, code: ` ${certificate.code}` }), false);
  assert.equal(isValidNqCertificateRecord({ ...certificate, score: '80' }), false);
  assert.deepEqual(mapNqCertificateRecord(certificate), {
    fullName: 'Nguyễn Thị Phương Thảo',
    organizationName: 'Chi đoàn Phòng An ninh đối ngoại - Công an tỉnh Phú Thọ',
    score: 80,
    correctCount: 24,
    totalQuestions: 30,
    certificateCode: 'NQ13-4E6FBD0421A64629',
    issuedAt: '2026-10-08T10:30:00.000Z'
  });
});

test('Pass threshold contract: 24/30 is 80% (PASS) and 23/30 is 76.67% (FAIL)', () => {
  assert.equal(PASS_SCORE_PERCENT, 80);
  assert.equal(PASS_MIN_CORRECT, 24);
  assert.equal(TOTAL_QUESTIONS, 30);

  // 23 questions correct -> 76.67% -> FAIL
  const score23 = Math.round((23 / 30) * 100 * 100) / 100;
  assert.equal(score23, 76.67);
  assert.equal(23 >= PASS_MIN_CORRECT, false);

  // 24 questions correct -> 80% -> PASS
  const score24 = Math.round((24 / 30) * 100 * 100) / 100;
  assert.equal(score24, 80);
  assert.equal(24 >= PASS_MIN_CORRECT, true);

  // 30 questions correct -> 100% -> PASS
  const score30 = Math.round((30 / 30) * 100 * 100) / 100;
  assert.equal(score30, 100);
  assert.equal(30 >= PASS_MIN_CORRECT, true);
});

test('createNqQuizService: saveParticipant and verifyCertificate interface contract', async () => {
  const rpcCalls = [];
  const fakeClient = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }),
      getUser: async () => ({ data: { user: { id: 'u1' } }, error: null })
    },
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      if (name === 'nq_save_participant') {
        return { data: { success: true }, error: null };
      }
      if (name === 'verify_nq_certificate') {
        return {
          data: {
            found: true,
            valid: true,
            code: args.p_code,
            full_name: 'Nguyễn Văn A',
            organization_name: 'CAT Phú Thọ',
            score: 80,
            correct_count: 24,
            total_questions: 30
          },
          error: null
        };
      }
      return { data: null, error: null };
    }
  };

  const service = createNqQuizService(fakeClient);

  // saveParticipant contract
  await service.saveParticipant('att-123', 'Nguyễn Văn A', 'CAT Phú Thọ');
  assert.deepEqual(rpcCalls[0], {
    name: 'nq_save_participant',
    args: {
      p_attempt_id: 'att-123',
      p_full_name: 'Nguyễn Văn A',
      p_organization_name: 'CAT Phú Thọ'
    }
  });

  // verifyCertificate contract
  const certRes = await service.verifyCertificate('NQ13-TEST1234');
  assert.deepEqual(rpcCalls[1], {
    name: 'verify_nq_certificate',
    args: { p_code: 'NQ13-TEST1234' }
  });
  assert.equal(certRes.valid, true);
  assert.equal(certRes.score, 80);
});
