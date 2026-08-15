import { afterEach, describe, expect, it, vi } from "vitest"

import type { AuthenticatedMunicipalUser } from "../lib/auth/authorization-core"
import {
  MAX_REPORT_IMAGE_BYTES,
  validateReportImageForm,
  type ValidatedReportImage,
} from "../lib/report-images/contracts"
import { createReportImageHttpHandlers } from "../lib/report-images/http"
import type { ReportImageRepository } from "../lib/report-images/repository"
import { createReportImageService, ReportImageServiceError } from "../lib/report-images/service"
import type { ReportImageStorage } from "../lib/report-images/storage"
import type { ReportHttpAuthorization } from "../lib/reports/http"
import { uploadReportImage } from "../lib/reports/client"

const ORIGIN = "https://municipal.example.test"
const citizen: AuthenticatedMunicipalUser = {
  id: "citizen-1",
  name: "Citizen",
  role: "Citizen",
  isActive: true,
  avatarUrl: null,
  districtId: "al-naeem",
  departmentId: null,
}
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const validImage: ValidatedReportImage = {
  bytes: pngBytes,
  mimeType: "image/png",
  name: "street.png",
  size: pngBytes.length,
}

afterEach(() => vi.unstubAllGlobals())

describe("Phase 3B report image client", () => {
  it("sends multipart data with same-origin credentials and no forged Origin", async () => {
    const attachment = {
      id: "attachment-1",
      name: "street.png",
      mimeType: "image/png",
      url: "https://res.cloudinary.com/demo/image/upload/street.png",
      kind: "report-photo",
      createdAt: "2026-08-16T10:00:00.000Z",
    } as const
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(attachment, { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)
    const file = new File([pngBytes], "street.png", { type: "image/png" })

    await expect(uploadReportImage("report-1", file)).resolves.toEqual(attachment)
    const [, init] = fetchMock.mock.calls[0]!
    expect(init?.credentials).toBe("same-origin")
    expect(init?.body).toBeInstanceOf(FormData)
    expect(new Headers(init?.headers).has("content-type")).toBe(false)
    expect(new Headers(init?.headers).has("origin")).toBe(false)
  })
})

function imageRequest(file: File, origin = ORIGIN): Request {
  const form = new FormData()
  form.set("image", file)
  return new Request(`${ORIGIN}/api/reports/report-1/image`, {
    method: "POST",
    headers: { origin },
    body: form,
  })
}

describe("Phase 3B report image validation", () => {
  it("accepts JPEG, PNG, and WebP signatures and rejects MIME spoofing", async () => {
    const fixtures = [
      ["image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 1])],
      ["image/png", pngBytes],
      ["image/webp", new TextEncoder().encode("RIFF1234WEBP")],
    ] as const
    for (const [mimeType, bytes] of fixtures) {
      const form = new FormData()
      form.set("image", new File([bytes], `photo.${mimeType.split("/")[1]}`, { type: mimeType }))
      await expect(validateReportImageForm(form)).resolves.toMatchObject({
        ok: true,
        image: { mimeType },
      })
    }

    const spoofed = new FormData()
    spoofed.set("image", new File([new TextEncoder().encode("not an image")], "fake.png", { type: "image/png" }))
    await expect(validateReportImageForm(spoofed)).resolves.toEqual({ ok: false, reason: "invalid" })
  })

  it("rejects unsupported, duplicate, empty, and oversized image fields", async () => {
    const invalid = new FormData()
    invalid.set("image", new File(["text"], "note.txt", { type: "text/plain" }))
    await expect(validateReportImageForm(invalid)).resolves.toEqual({ ok: false, reason: "invalid" })

    const duplicate = new FormData()
    duplicate.append("image", new File([pngBytes], "one.png", { type: "image/png" }))
    duplicate.append("image", new File([pngBytes], "two.png", { type: "image/png" }))
    await expect(validateReportImageForm(duplicate)).resolves.toEqual({ ok: false, reason: "invalid" })

    const oversized = new FormData()
    oversized.set("image", new File([new Uint8Array(MAX_REPORT_IMAGE_BYTES + 1)], "large.png", { type: "image/png" }))
    await expect(validateReportImageForm(oversized)).resolves.toEqual({ ok: false, reason: "too-large" })
  })
})

describe("Phase 3B report image service", () => {
  function dependencies() {
    const repository: ReportImageRepository = {
      ownedReportExists: vi.fn().mockResolvedValue(true),
      createPhoto: vi.fn().mockResolvedValue({
        status: "created",
        attachment: {
          id: "attachment-1",
          name: "street.png",
          mimeType: "image/png",
          url: "https://res.cloudinary.com/demo/image/upload/street.png",
          kind: "REPORT_PHOTO",
          createdAt: new Date("2026-08-16T10:00:00.000Z"),
        },
      }),
    }
    const storage: ReportImageStorage = {
      upload: vi.fn().mockResolvedValue({
        publicId: "smart-municipal-assistant/reports/report-1/asset-1",
        secureUrl: "https://res.cloudinary.com/demo/image/upload/street.png",
      }),
      remove: vi.fn().mockResolvedValue(undefined),
    }
    return { repository, storage }
  }

  it("stores a safe attachment DTO in an organized report folder", async () => {
    const { repository, storage } = dependencies()
    const ids = ["asset-1", "attachment-1"]
    const service = createReportImageService(repository, storage, () => ids.shift()!)
    await expect(service.upload(citizen, "report-1", validImage)).resolves.toEqual({
      id: "attachment-1",
      name: "street.png",
      mimeType: "image/png",
      url: "https://res.cloudinary.com/demo/image/upload/street.png",
      kind: "report-photo",
      createdAt: "2026-08-16T10:00:00.000Z",
    })
    expect(storage.upload).toHaveBeenCalledWith(expect.objectContaining({
      folder: "smart-municipal-assistant/reports/report-1",
      publicId: "asset-1",
    }))
    expect(repository.createPhoto).toHaveBeenCalledWith(expect.objectContaining({
      reportId: "report-1",
      uploadedById: citizen.id,
    }))
  })

  it("rejects a non-owner before upload and removes an uploaded asset after a database failure", async () => {
    const denied = dependencies()
    vi.mocked(denied.repository.ownedReportExists).mockResolvedValue(false)
    await expect(createReportImageService(denied.repository, denied.storage).upload(citizen, "report-2", validImage))
      .rejects.toMatchObject({ code: "not-found" })
    expect(denied.storage.upload).not.toHaveBeenCalled()

    const failed = dependencies()
    vi.mocked(failed.repository.createPhoto).mockRejectedValue(new Error("private database detail"))
    await expect(createReportImageService(failed.repository, failed.storage).upload(citizen, "report-1", validImage))
      .rejects.toEqual(expect.any(ReportImageServiceError))
    expect(failed.storage.remove).toHaveBeenCalledOnce()
  })

  it("does not attempt a database write when Cloudinary upload fails", async () => {
    const failed = dependencies()
    vi.mocked(failed.storage.upload).mockRejectedValue(new Error("private Cloudinary detail"))
    await expect(createReportImageService(failed.repository, failed.storage).upload(citizen, "report-1", validImage))
      .rejects.toMatchObject({ code: "server", message: "Report image operation failed" })
    expect(failed.repository.createPhoto).not.toHaveBeenCalled()
    expect(failed.storage.remove).not.toHaveBeenCalled()
  })
})

describe("Phase 3B report image HTTP boundary", () => {
  const service = { upload: vi.fn() }
  const authorization: Pick<ReportHttpAuthorization, "requireRole"> = {
    requireRole: vi.fn().mockResolvedValue({ user: citizen }),
  }
  const handlers = createReportImageHttpHandlers({
    authorization,
    service,
    trustedOrigins: [ORIGIN],
  })
  const context = { params: Promise.resolve({ id: "report-1" }) }

  it("rejects untrusted or unauthenticated uploads before storage", async () => {
    vi.clearAllMocks()
    const rejected = await handlers.uploadPOST(
      imageRequest(new File([pngBytes], "street.png", { type: "image/png" }), "https://evil.test"),
      context,
    )
    expect(rejected.status).toBe(403)
    expect(authorization.requireRole).not.toHaveBeenCalled()
    expect(service.upload).not.toHaveBeenCalled()

    vi.mocked(authorization.requireRole).mockResolvedValueOnce({
      response: Response.json({ error: "Authentication required" }, { status: 401 }),
    })
    const anonymous = await handlers.uploadPOST(
      imageRequest(new File([pngBytes], "street.png", { type: "image/png" })),
      context,
    )
    expect(anonymous.status).toBe(401)
    expect(service.upload).not.toHaveBeenCalled()
  })

  it("returns a safe attachment and never exposes secret-shaped values", async () => {
    vi.clearAllMocks()
    vi.mocked(authorization.requireRole).mockResolvedValue({ user: citizen })
    service.upload.mockResolvedValue({
      id: "attachment-1",
      name: "street.png",
      mimeType: "image/png",
      url: "https://res.cloudinary.com/demo/image/upload/street.png",
      kind: "report-photo",
      createdAt: "2026-08-16T10:00:00.000Z",
    })
    const response = await handlers.uploadPOST(
      imageRequest(new File([pngBytes], "street.png", { type: "image/png" })),
      context,
    )
    expect(response.status).toBe(201)
    const raw = await response.text()
    expect(JSON.parse(raw)).toMatchObject({ id: "attachment-1", kind: "report-photo" })
    expect(raw).not.toMatch(/api.secret|api.key|credential|password/i)
  })
})
