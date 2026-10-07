import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateParticipantInfo,
  formatCertificateDate,
  sanitizeCertificateFileName,
  PASS_SCORE_PERCENT,
  PASS_MIN_CORRECT,
  TOTAL_QUESTIONS,
  createNqQuizService
} from '../src/services/nqQuizService.js';

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
