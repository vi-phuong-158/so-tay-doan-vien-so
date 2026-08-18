export type StorageProviderErrorCode =
  | 'AUTH_INVALID'
  | 'SOURCE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_LOCATOR'
  | 'MALFORMED_RESPONSE';

const retryableCodes = new Set<StorageProviderErrorCode>(['RATE_LIMITED', 'PROVIDER_UNAVAILABLE']);

export class StorageProviderError extends Error {
  readonly retryable: boolean;

  constructor(readonly code: StorageProviderErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'StorageProviderError';
    this.retryable = retryableCodes.has(code);
  }
}

export type StorageFileMetadata = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  parents: string[];
  trashed: boolean;
  isPublic: boolean;
};

export type StorageWriteRequest = {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  parentId?: string;
};

// This intentionally small contract is shared by P5-02R rehearsal and P5-03 ingestion.
// It never carries OAuth credentials or a public URL.
export interface StorageProvider {
  getMetadata(locator: string): Promise<StorageFileMetadata>;
  read(locator: string): Promise<Uint8Array>;
  put(request: StorageWriteRequest): Promise<StorageFileMetadata>;
  delete(locator: string): Promise<void>;
}

export function assertOpaqueStorageLocator(value: string): string {
  const locator = String(value ?? '').trim();
  // Drive IDs are opaque URL-safe identifiers. Reject paths, URLs, whitespace and query strings
  // before a caller can interpolate an attacker-controlled request path.
  if (!/^[A-Za-z0-9_-]{10,512}$/.test(locator)) {
    throw new StorageProviderError('INVALID_LOCATOR');
  }
  return locator;
}
