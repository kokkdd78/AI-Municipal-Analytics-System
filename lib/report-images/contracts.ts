// Keep multipart uploads below Vercel Functions' fixed 4.5 MB request limit.
export const MAX_REPORT_IMAGE_BYTES = 4 * 1024 * 1024

export const REPORT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export type ReportImageMimeType = (typeof REPORT_IMAGE_MIME_TYPES)[number]

export interface ValidatedReportImage {
  bytes: Uint8Array
  mimeType: ReportImageMimeType
  name: string
  size: number
}

export type ReportImageValidationResult =
  | { ok: true; image: ValidatedReportImage }
  | { ok: false; reason: "invalid" | "too-large" }

function detectedMimeType(bytes: Uint8Array): ReportImageMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return "image/png"
  }
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp"
  }
  return null
}

function safeFileName(name: string, mimeType: ReportImageMimeType): string {
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1]
  const leaf = name.replaceAll("\\", "/").split("/").at(-1)?.trim() ?? ""
  const normalized = leaf.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 255)
  return normalized || `report-image.${extension}`
}

function isFileLike(value: unknown): value is File {
  return Boolean(
    value
    && typeof value === "object"
    && "arrayBuffer" in value
    && typeof value.arrayBuffer === "function"
    && "size" in value
    && typeof value.size === "number"
    && "type" in value
    && typeof value.type === "string"
    && "name" in value
    && typeof value.name === "string",
  )
}

export function hasSupportedReportImageMediaType(contentType: string | null): boolean {
  if (!contentType || contentType.length > 512 || contentType.includes(",")) return false
  return /^multipart\/form-data\s*;\s*boundary=(?:"[^"\r\n]{1,200}"|[!#$%&'*+.^_`|~0-9A-Za-z-]{1,200})$/i.test(contentType)
}

export async function validateReportImageForm(form: FormData): Promise<ReportImageValidationResult> {
  const entries = [...form.entries()]
  if (entries.length !== 1 || entries[0]?.[0] !== "image" || !isFileLike(entries[0][1])) {
    return { ok: false, reason: "invalid" }
  }

  const file = entries[0][1]
  if (file.size <= 0) return { ok: false, reason: "invalid" }
  if (file.size > MAX_REPORT_IMAGE_BYTES) return { ok: false, reason: "too-large" }
  if (!REPORT_IMAGE_MIME_TYPES.includes(file.type.toLowerCase() as ReportImageMimeType)) {
    return { ok: false, reason: "invalid" }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const actualMimeType = detectedMimeType(bytes)
  if (!actualMimeType || actualMimeType !== file.type.toLowerCase()) {
    return { ok: false, reason: "invalid" }
  }

  return {
    ok: true,
    image: {
      bytes,
      mimeType: actualMimeType,
      name: safeFileName(file.name, actualMimeType),
      size: bytes.byteLength,
    },
  }
}
