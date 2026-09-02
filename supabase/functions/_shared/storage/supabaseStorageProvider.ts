import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import { StorageProviderError, type StorageFileMetadata, type StorageProvider, type StorageWriteRequest } from './contract.ts';

function safePath(value: string): string {
  const path = String(value ?? '').trim();
  if (!path || path.length > 1024 || path.startsWith('/') || path.includes('..') || path.includes('\\') || /[\u0000-\u001f]/.test(path)) {
    throw new StorageProviderError('INVALID_LOCATOR');
  }
  return path;
}

export class SupabaseStorageProvider implements StorageProvider {
  constructor(private readonly client: SupabaseClient, private readonly bucket = 'documents-private') {}

  async getMetadata(locator: string): Promise<StorageFileMetadata> {
    const bytes = await this.read(locator);
    const path = safePath(locator);
    return { id: path, name: path.split('/').pop() || path, mimeType: 'application/octet-stream', size: bytes.byteLength, parents: [], trashed: false, isPublic: false };
  }

  async read(locator: string): Promise<Uint8Array> {
    const path = safePath(locator);
    const { data, error } = await this.client.storage.from(this.bucket).download(path);
    if (error || !data) throw new StorageProviderError('SOURCE_NOT_FOUND');
    return new Uint8Array(await data.arrayBuffer());
  }

  async put(_request: StorageWriteRequest): Promise<StorageFileMetadata> {
    throw new StorageProviderError('INVALID_LOCATOR');
  }

  async delete(_locator: string): Promise<void> {
    throw new StorageProviderError('INVALID_LOCATOR');
  }
}
