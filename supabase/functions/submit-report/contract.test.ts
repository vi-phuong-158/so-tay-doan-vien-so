import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { buildReportActionUrl, buildReportVersionPath } from './contract.ts';

Deno.test('submit-report notification links to assignment detail route', () => {
  assertEquals(
    buildReportActionUrl('7f000002-0000-0000-0000-000000000002'),
    '/cong-viec/bao-cao/7f000002-0000-0000-0000-000000000002'
  );
});

Deno.test('submit-report finalizes each object under its immutable version namespace', () => {
  assertEquals(
    buildReportVersionPath('campaign/org/assignment/', 3, 'uuid-report.pdf'),
    'campaign/org/assignment/v3/uuid-report.pdf'
  );
});

Deno.test('submit-report rejects malformed finalized path inputs', () => {
  let failed = false;
  try {
    buildReportVersionPath('campaign/org/assignment/', 0, 'uuid-report.pdf');
  } catch (error) {
    failed = String(error).includes('INVALID_FINALIZED_PATH');
  }
  assertEquals(failed, true);
});
