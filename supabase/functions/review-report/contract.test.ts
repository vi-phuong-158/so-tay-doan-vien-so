import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { getReviewHttpStatus, isReviewAction } from './contract.ts';

Deno.test('review action contract is allowlisted', () => {
  assertEquals(isReviewAction('ACCEPTED'), true);
  assertEquals(isReviewAction('NEEDS_SUPPLEMENT'), true);
  assertEquals(isReviewAction('EXEMPTED'), true);
  assertEquals(isReviewAction('PENDING'), false);
  assertEquals(isReviewAction(null), false);
});

Deno.test('review errors map to stable HTTP statuses', () => {
  assertEquals(getReviewHttpStatus('UNAUTHENTICATED'), 401);
  assertEquals(getReviewHttpStatus('ACCOUNT_NOT_ACTIVE'), 403);
  assertEquals(getReviewHttpStatus('ASSIGNMENT_NOT_FOUND'), 404);
  assertEquals(getReviewHttpStatus('INVALID_REPORT_TRANSITION'), 409);
  assertEquals(getReviewHttpStatus('REASON_REQUIRED'), 400);
});
