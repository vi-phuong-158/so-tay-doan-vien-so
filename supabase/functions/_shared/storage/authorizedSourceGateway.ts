import { StorageProviderError, type StorageProvider } from './contract.ts';

export type GoogleDriveDocumentSource = {
  documentId: string;
  fileProvider: 'GOOGLE_DRIVE';
  externalFileId: string | null;
  storagePath: string | null;
};

// Keep Supabase authorization separate from storage. The caller must authorize before
// this module even validates a provider locator, so an unauthorized request has zero Drive calls.
export async function readAuthorizedGoogleDriveSource(options: {
  source: GoogleDriveDocumentSource;
  canAccessDocument: (documentId: string) => Promise<boolean>;
  provider: Pick<StorageProvider, 'read'>;
}): Promise<Uint8Array> {
  if (!await options.canAccessDocument(options.source.documentId)) {
    throw new StorageProviderError('PERMISSION_DENIED');
  }
  if (options.source.storagePath !== null || !options.source.externalFileId) {
    throw new StorageProviderError('INVALID_LOCATOR');
  }
  return options.provider.read(options.source.externalFileId);
}
