import {
  StorageProviderError,
  type StorageFileMetadata,
  type StorageProvider,
  type StorageWriteRequest,
} from './contract.ts';

export type AuthorizedSource = {
  documentId: string;
  providerKind: 'SUPABASE_STORAGE' | 'GOOGLE_DRIVE' | 'HTTP';
  storagePath: string | null;
  externalFileId: string | null;
};

function sourceLocator(source: AuthorizedSource): string {
  if (source.providerKind === 'GOOGLE_DRIVE') {
    if (source.storagePath !== null || !source.externalFileId) {
      throw new StorageProviderError('INVALID_LOCATOR');
    }
    return source.externalFileId;
  }
  if (source.providerKind === 'SUPABASE_STORAGE') {
    if (!source.storagePath || source.externalFileId !== null) {
      throw new StorageProviderError('INVALID_LOCATOR');
    }
    return source.storagePath;
  }
  throw new StorageProviderError('INVALID_LOCATOR');
}

async function authorize(options: {
  source: AuthorizedSource;
  canAccessDocument: (documentId: string) => Promise<boolean>;
}): Promise<void> {
  if (!await options.canAccessDocument(options.source.documentId)) {
    throw new StorageProviderError('PERMISSION_DENIED');
  }
}

export async function getAuthorizedSourceMetadata(options: {
  source: AuthorizedSource;
  canAccessDocument: (documentId: string) => Promise<boolean>;
  provider: Pick<StorageProvider, 'getMetadata'>;
}): Promise<StorageFileMetadata> {
  await authorize(options);
  return options.provider.getMetadata(sourceLocator(options.source));
}

export async function readAuthorizedSource(options: {
  source: AuthorizedSource;
  canAccessDocument: (documentId: string) => Promise<boolean>;
  provider: Pick<StorageProvider, 'read'>;
}): Promise<Uint8Array> {
  await authorize(options);
  return options.provider.read(sourceLocator(options.source));
}

export async function deleteAuthorizedSource(options: {
  source: AuthorizedSource;
  canManageDocument: (documentId: string) => Promise<boolean>;
  provider: Pick<StorageProvider, 'delete'>;
}): Promise<void> {
  if (!await options.canManageDocument(options.source.documentId)) {
    throw new StorageProviderError('PERMISSION_DENIED');
  }
  await options.provider.delete(sourceLocator(options.source));
}

export async function putAuthorizedSource(options: {
  source: Pick<AuthorizedSource, 'documentId' | 'providerKind'>;
  canManageDocument: (documentId: string) => Promise<boolean>;
  provider: Pick<StorageProvider, 'put'>;
  request: StorageWriteRequest;
}): Promise<StorageFileMetadata> {
  if (!await options.canManageDocument(options.source.documentId)) {
    throw new StorageProviderError('PERMISSION_DENIED');
  }
  if (options.source.providerKind !== 'GOOGLE_DRIVE') {
    throw new StorageProviderError('INVALID_LOCATOR');
  }
  return options.provider.put(options.request);
}
