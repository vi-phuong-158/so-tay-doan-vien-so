export function getQueueWorkerStatus() {
  return {
    code: 'EMAIL_PROVIDER_DEFERRED',
    message: 'Email provider delivery is disabled until P3-03.'
  } as const;
}
