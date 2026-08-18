export type IngestionQueueClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export type IngestionJob = { id: string; job_kind: string; claim_token: string };
export type IngestionWorkerResult = {
  claimed: number; succeeded: number; retried: number; failed: number; stale: number; rpcErrors: number;
};
export type IngestionExecutor = (job: IngestionJob) => Promise<void>;

export async function processIngestionBatch(options: {
  adminClient: IngestionQueueClient;
  workerId: string;
  batchSize: number;
  leaseSeconds: number;
  execute?: IngestionExecutor;
}): Promise<IngestionWorkerResult> {
  const { data, error } = await options.adminClient.rpc('claim_ingestion_jobs', {
    p_worker_id: options.workerId,
    p_batch_size: Math.min(Math.max(options.batchSize, 1), 50),
    p_lease_seconds: options.leaseSeconds
  });
  if (error) throw new Error('INGESTION_CLAIM_FAILED');

  const jobs = (data ?? []) as IngestionJob[];
  const result: IngestionWorkerResult = { claimed: jobs.length, succeeded: 0, retried: 0, failed: 0, stale: 0, rpcErrors: 0 };
  const execute = options.execute ?? (async () => undefined);
  for (const job of jobs) {
    try {
      // P5-02 deliberately executes no external action: Drive, AI, extraction and embedding are deferred.
      await execute(job);
      const completion = await options.adminClient.rpc('complete_ingestion_job', {
        p_job_id: job.id, p_claim_token: job.claim_token, p_result: { handler: 'NO_OP' }
      });
      if (completion.error) result.rpcErrors += 1;
      else if (completion.data === true) result.succeeded += 1;
      else result.stale += 1;
    } catch {
      const transition = await options.adminClient.rpc('fail_ingestion_job', {
        p_job_id: job.id, p_claim_token: job.claim_token,
        p_error_code: 'NO_OP_HANDLER_FAILED', p_error_message: 'Ingestion test handler failed', p_retryable: true
      });
      if (transition.error) result.rpcErrors += 1;
      else if (transition.data !== true) result.stale += 1;
      else result.retried += 1;
    }
  }
  return result;
}
