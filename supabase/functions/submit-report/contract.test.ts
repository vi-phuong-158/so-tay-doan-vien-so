import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { buildReportActionUrl } from './contract.ts';

Deno.test('submit-report notification links to assignment detail route', () => {
  assertEquals(
    buildReportActionUrl('7f000002-0000-0000-0000-000000000002'),
    '/cong-viec/bao-cao/7f000002-0000-0000-0000-000000000002'
  );
});
