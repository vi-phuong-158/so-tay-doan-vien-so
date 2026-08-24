import {
  assertOpaqueStorageLocator,
  assertPrivateStorageMetadata,
  StorageProviderError,
  type StorageFileMetadata,
  type StorageProvider,
  type StorageWriteRequest,
} from './contract.ts';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export type GoogleDriveRuntimeConfig = {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  rootFolderId?: string;
  timeoutMs?: number;
};

type GoogleFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  parents?: string[];
  trashed?: boolean;
  permissions?: Array<{ type?: string; role?: string }>;
};

function requiredConfig(config: GoogleDriveRuntimeConfig) {
  if (!config.clientId || !config.clientSecret || !config.refreshToken || !config.rootFolderId) {
    throw new StorageProviderError('AUTH_INVALID', 'GOOGLE_DRIVE_CREDENTIALS_NOT_CONFIGURED');
  }
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    refreshToken: config.refreshToken,
    rootFolderId: assertOpaqueStorageLocator(config.rootFolderId),
  };
}

function encodeLocator(locator: string): string {
  return encodeURIComponent(assertOpaqueStorageLocator(locator));
}

function metadataFromGoogleFile(file: GoogleFile): StorageFileMetadata {
  if (!file.id || !file.name || !file.mimeType || !Array.isArray(file.parents)) {
    throw new StorageProviderError('MALFORMED_RESPONSE');
  }
  const size = file.size == null ? null : Number(file.size);
  if (size != null && (!Number.isSafeInteger(size) || size < 0)) {
    throw new StorageProviderError('MALFORMED_RESPONSE');
  }
  const metadata = {
    id: assertOpaqueStorageLocator(file.id),
    name: file.name,
    mimeType: file.mimeType,
    size,
    parents: file.parents.map(assertOpaqueStorageLocator),
    trashed: file.trashed === true,
    isPublic: (file.permissions ?? []).some(permission => permission.type === 'anyone' && permission.role !== 'none'),
  } satisfies StorageFileMetadata;
  return assertPrivateStorageMetadata(metadata);
}

function errorFromResponse(response: Response): StorageProviderError {
  if (response.status === 401) return new StorageProviderError('AUTH_INVALID');
  if (response.status === 403) return new StorageProviderError('PERMISSION_DENIED');
  if (response.status === 404) return new StorageProviderError('SOURCE_NOT_FOUND');
  if (response.status === 429) return new StorageProviderError('RATE_LIMITED');
  if (response.status >= 500) return new StorageProviderError('PROVIDER_UNAVAILABLE');
  return new StorageProviderError('MALFORMED_RESPONSE');
}

type FetchFn = typeof fetch;

export class GoogleDriveStorageProvider implements StorageProvider {
  #accessToken: string | undefined;
  #accessTokenExpiresAt = 0;
  #config: GoogleDriveRuntimeConfig;
  #fetchFn: FetchFn;
  #now: () => number;

  constructor(
    config: GoogleDriveRuntimeConfig,
    fetchFn: FetchFn = fetch,
    now: () => number = () => Date.now(),
  ) {
    this.#config = config;
    this.#fetchFn = fetchFn;
    this.#now = now;
  }

  async getMetadata(locator: string): Promise<StorageFileMetadata> {
    const response = await this.driveFetch(
      `${DRIVE_API}/files/${encodeLocator(locator)}?fields=id,name,mimeType,size,parents,trashed,permissions(type,role)`,
    );
    const metadata = metadataFromGoogleFile(await this.readJson<GoogleFile>(response));
    if (metadata.trashed) throw new StorageProviderError('SOURCE_NOT_FOUND');
    return metadata;
  }

  async read(locator: string): Promise<Uint8Array> {
    const response = await this.driveFetch(`${DRIVE_API}/files/${encodeLocator(locator)}?alt=media`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async put(request: StorageWriteRequest): Promise<StorageFileMetadata> {
    const config = requiredConfig(this.#config);
    if (!request.name || request.name.length > 255 || !request.mimeType || !(request.bytes instanceof Uint8Array)) {
      throw new StorageProviderError('MALFORMED_RESPONSE', 'INVALID_WRITE_REQUEST');
    }
    const parentId = request.parentId ? assertOpaqueStorageLocator(request.parentId) : config.rootFolderId;
    const boundary = `phase5-${crypto.randomUUID()}`;
    const metadata = JSON.stringify({ name: request.name, mimeType: request.mimeType, parents: [parentId] });
    const prefix = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${request.mimeType}\r\n\r\n`;
    const suffix = `\r\n--${boundary}--`;
    const encoder = new TextEncoder();
    const prefixBytes = encoder.encode(prefix);
    const suffixBytes = encoder.encode(suffix);
    const body = new Uint8Array(prefixBytes.length + request.bytes.length + suffixBytes.length);
    body.set(prefixBytes, 0);
    body.set(request.bytes, prefixBytes.length);
    body.set(suffixBytes, prefixBytes.length + request.bytes.length);
    const response = await this.driveFetch(
      `${UPLOAD_API}?uploadType=multipart&fields=id,name,mimeType,size,parents,trashed,permissions(type,role)`,
      { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
    );
    return metadataFromGoogleFile(await this.readJson<GoogleFile>(response));
  }

  async delete(locator: string): Promise<void> {
    await this.driveFetch(`${DRIVE_API}/files/${encodeLocator(locator)}`, { method: 'DELETE' });
  }

  private async driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();
    const response = await this.fetchWithTimeout(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw errorFromResponse(response);
    return response;
  }

  private async getAccessToken(): Promise<string> {
    if (this.#accessToken && this.#accessTokenExpiresAt > this.#now() + 30_000) return this.#accessToken;
    const config = requiredConfig(this.#config);
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    });
    let response: Response;
    try {
      response = await this.fetchWithTimeout(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (error) {
      if (error instanceof StorageProviderError) throw error;
      throw new StorageProviderError('PROVIDER_UNAVAILABLE');
    }
    if (!response.ok) {
      if (response.status >= 500) throw new StorageProviderError('PROVIDER_UNAVAILABLE');
      throw new StorageProviderError('AUTH_INVALID');
    }
    const data = await this.readJson<{ access_token?: string; expires_in?: number }>(response);
    const expiresIn = data.expires_in;
    if (!data.access_token || typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new StorageProviderError('MALFORMED_RESPONSE');
    }
    this.#accessToken = data.access_token;
    this.#accessTokenExpiresAt = this.#now() + expiresIn * 1_000;
    return this.#accessToken;
  }

  private async readJson<T>(response: Response): Promise<T> {
    try {
      return await response.json() as T;
    } catch {
      throw new StorageProviderError('MALFORMED_RESPONSE');
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(Math.max(this.#config.timeoutMs ?? 10_000, 1_000), 30_000),
    );
    try {
      return await this.#fetchFn(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof StorageProviderError) throw error;
      throw new StorageProviderError('PROVIDER_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const googleDriveScope = DRIVE_SCOPE;
