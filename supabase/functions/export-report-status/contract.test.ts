import { assertEquals, assertThrows } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { escapeCsvCell, getExportHttpStatus, normalizeExportStatus } from './contract.ts';

Deno.test('CSV contract escapes formulas and quotes', () => {
  assertEquals(escapeCsvCell('=SUM(A1)'), '"\'=SUM(A1)"');
  assertEquals(escapeCsvCell('a"b'), '"a""b"');
  assertEquals(escapeCsvCell(null), '""');
});

Deno.test('export status contract is allowlisted', () => {
  assertEquals(normalizeExportStatus('all'), null);
  assertEquals(normalizeExportStatus('overdue'), 'OVERDUE');
  assertThrows(() => normalizeExportStatus('UNKNOWN'), Error, 'INVALID_DASHBOARD_FILTER');
  assertEquals(getExportHttpStatus('REPORT_CAMPAIGN_SCOPE_DENIED'), 403);
});
