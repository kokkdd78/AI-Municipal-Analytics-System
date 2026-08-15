export interface StoredArchiveDocument {
  publicId: string
  secureUrl: string
}

export interface ArchiveDocumentStorage {
  readonly provider: string
  upload(input: { bytes: Uint8Array; folder: string; publicId: string }): Promise<StoredArchiveDocument>
  read(secureUrl: string): Promise<Uint8Array>
  remove(publicId: string): Promise<void>
}
