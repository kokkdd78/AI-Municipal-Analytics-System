import "server-only"

import { v2 as cloudinary, type UploadApiResponse } from "cloudinary"

import type { ReportImageStorage, StoredReportImage } from "./storage"

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

async function uploadBuffer(
  bytes: Uint8Array,
  folder: string,
  publicId: string,
): Promise<UploadApiResponse> {
  configureCloudinary()
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        overwrite: false,
        resource_type: "image",
        type: "upload",
      },
      (error, result) => {
        if (error || !result) reject(new Error("Image upload failed"))
        else resolve(result)
      },
    )
    stream.end(Buffer.from(bytes))
  })
}

export const cloudinaryReportImageStorage: ReportImageStorage = {
  async upload({ bytes, folder, publicId }): Promise<StoredReportImage> {
    const result = await uploadBuffer(bytes, folder, publicId)
    if (!result.public_id || !result.secure_url?.startsWith("https://")) {
      throw new Error("Image upload failed")
    }
    return { publicId: result.public_id, secureUrl: result.secure_url }
  },
  async remove(publicId): Promise<void> {
    configureCloudinary()
    await cloudinary.uploader.destroy(publicId, { invalidate: true, resource_type: "image", type: "upload" })
  },
}
