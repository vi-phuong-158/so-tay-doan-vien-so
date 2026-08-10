export const REVIEW_ACTIONS = ['ACCEPTED', 'NEEDS_SUPPLEMENT', 'EXEMPTED'] as const;

export type ReviewAction = typeof REVIEW_ACTIONS[number];

export function isReviewAction(value: unknown): value is ReviewAction {
  return typeof value === 'string' && REVIEW_ACTIONS.includes(value as ReviewAction);
}

export function getReviewHttpStatus(message: string): number {
  if (message.includes('UNAUTHENTICATED')) return 401;
  if (['SCOPE_DENIED', 'FORBIDDEN', 'ACCOUNT_NOT_ACTIVE'].some(code => message.includes(code))) return 403;
  if (message.includes('ASSIGNMENT_NOT_FOUND')) return 404;
  if (['INVALID_REPORT_TRANSITION', 'REPORT_ALREADY_ACCEPTED', 'REPORT_EXEMPTED', 'REPORT_CLOSED']
    .some(code => message.includes(code))) return 409;
  return 400;
}
