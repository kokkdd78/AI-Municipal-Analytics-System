import { randomUUID } from "node:crypto"

import type { AuthenticatedMunicipalUser } from "../auth/authorization-core"
import type { ReportAttachmentDto } from "../reports/dto"
import type { ValidatedReportImage } from "./contracts"
import type { ReportImageRepository } from "./repository"
import type { ReportImageStorage } from "./storage"

export type ReportImageServiceErrorCode = "conflict" | "forbidden" | "not-found" | "server"

export class ReportImageServiceError extends Error {
  constructor(readonly code: ReportImageServiceErrorCode) {
    super("Report image operation failed")
    this.name = "ReportImageServiceError"
  }
}

export interface ReportImageService {
  upload(
    user: AuthenticatedMunicipalUser,
    reportId: string,
    image: ValidatedReportImage,
  ): Promise<ReportAttachmentDto>
}

export function createReportImageService(
  repository: ReportImageRepository,
  storage: ReportImageStorage,
  generateId: () => string = randomUUID,
): ReportImageService {
  return {
    async upload(user, reportId, image) {
      if (user.role !== "Citizen") throw new ReportImageServiceError("forbidden")
      if (!(await repository.ownedReportExists(reportId, user.id))) {
        throw new ReportImageServiceError("not-found")
      }

      let stored
      try {
        stored = await storage.upload({
          bytes: image.bytes,
          folder: `smart-municipal-assistant/reports/${reportId}`,
          publicId: generateId(),
        })
      } catch {
        throw new ReportImageServiceError("server")
      }

      try {
        const result = await repository.createPhoto({
          id: generateId(),
          reportId,
          uploadedById: user.id,
          name: image.name,
          mimeType: image.mimeType,
          url: stored.secureUrl,
        })
        if (result.status !== "created") {
          await storage.remove(stored.publicId).catch(() => undefined)
          throw new ReportImageServiceError(result.status === "exists" ? "conflict" : "not-found")
        }
        return {
          id: result.attachment.id,
          name: result.attachment.name,
          mimeType: image.mimeType,
          url: result.attachment.url,
          kind: "report-photo",
          createdAt: result.attachment.createdAt.toISOString(),
        }
      } catch (error) {
        if (error instanceof ReportImageServiceError) throw error
        await storage.remove(stored.publicId).catch(() => undefined)
        throw new ReportImageServiceError("server")
      }
    },
  }
}
