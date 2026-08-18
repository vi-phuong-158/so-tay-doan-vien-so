import { errorResponse, json } from '../_shared/http.ts';
import { getIngestionWorkerConfig, hasTrustedWorkerSecret, type IngestionWorkerConfig } from './contract.ts';
import { processIngestionBatch, type IngestionQueueClient, type IngestionWorkerResult } from './worker.ts';

export function createIngestionHandler(options: {
  expectedSecret: string | undefined;
  config: IngestionWorkerConfig;
  createAdminClient: () => IngestionQueueClient;
  workerId: () => string;
  processBatch?: typeof processIngestionBatch;
}): (request: Request) => Promise<Response> {
  return async request => {
    if (request.method !== 'POST') return errorResponse(new Error('METHOD_NOT_ALLOWED'), 405);
    if (!hasTrustedWorkerSecret(request.headers.get('x-cron-secret'), options.expectedSecret)) {
      return errorResponse(new Error('FORBIDDEN'), 403);
    }
    try {
      const result: IngestionWorkerResult = await (options.processBatch ?? processIngestionBatch)({
        adminClient: options.createAdminClient(), workerId: options.workerId(),
        batchSize: options.config.batchSize, leaseSeconds: options.config.leaseSeconds
      });
      return json({ success: true, ...result });
    } catch {
      return errorResponse(new Error('INGESTION_WORKER_UNAVAILABLE'), 503);
    }
  };
}

export function getRuntimeIngestionConfig(): IngestionWorkerConfig {
  return getIngestionWorkerConfig({
    INGESTION_WORKER_BATCH_SIZE: Deno.env.get('INGESTION_WORKER_BATCH_SIZE'),
    INGESTION_WORKER_LEASE_SECONDS: Deno.env.get('INGESTION_WORKER_LEASE_SECONDS')
  });
}
