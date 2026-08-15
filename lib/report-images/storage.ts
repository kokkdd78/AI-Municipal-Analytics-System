export interface StoredReportImage {
  publicId: string
  secureUrl: string
}

export interface ReportImageStorage {
  upload(input: {
    bytes: Uint8Array
    folder: string
    publicId: string
  }): Promise<StoredReportImage>
  remove(publicId: string): Promise<void>
}
