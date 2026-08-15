import "server-only"

import { v2 as cloudinary, type UploadApiResponse } from "cloudinary"

import type { ArchiveDocumentStorage, StoredArchiveDocument } from "./storage"

function requiredEnvironment(name: "CLOUDINARY_CLOUD_NAME" | "CLOUDINARY_API_KEY" | "CLOUDINARY_API_SECRET"): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error("Cloudinary configuration is incomplete")
  return value
}

function configureCloudinary(): void {
  cloudinary.config({
    cloud_name: requiredEnvironment("CLOUDINARY_CLOUD_NAME"),
    api_key: requiredEnvironment("CLOUDINARY_API_KEY"),
    api_secret: requiredEnvironment("CLOUDINARY_API_SECRET"),
    secure: true,
  })
}

function uploadBuffer(bytes: Uint8Array, folder: string, publicId: string): Promise<UploadApiResponse> {
  configureCloudinary()
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, overwrite: false, resource_type: "raw", type: "upload", format: "json" },
      (error, result) => {
        if (error || !result) reject(new Error("Archive document upload failed"))
        else resolve(result)
      },
    )
    stream.end(Buffer.from(bytes))
  })
}

export const cloudinaryArchiveDocumentStorage: ArchiveDocumentStorage = {
  provider: "cloudinary",
  async upload({ bytes, folder, publicId }): Promise<StoredArchiveDocument> {
    const result = await uploadBuffer(bytes, folder, publicId)
    if (!result.public_id || !result.secure_url?.startsWith("https://")) throw new Error("Archive document upload failed")
    return { publicId: result.public_id, secureUrl: result.secure_url }
  },
  async read(secureUrl): Promise<Uint8Array> {
    const response = await fetch(secureUrl, { cache: "no-store", signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error("Archive document read failed")
    return new Uint8Array(await response.arrayBuffer())
  },
  async remove(publicId): Promise<void> {
    configureCloudinary()
    const result = await cloudinary.uploader.destroy(publicId, { invalidate: true, resource_type: "raw", type: "upload" })
    if (result.result !== "ok" && result.result !== "not found") throw new Error("Archive document removal failed")
  },
}
