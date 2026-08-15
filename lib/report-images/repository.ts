import type { PrismaClient } from "../../generated/prisma/client"
import type { ReportAttachmentRecord } from "../reports/repository"

export interface CreateReportPhotoInput {
  id: string
  reportId: string
  uploadedById: string
  name: string
  mimeType: string
  url: string
}

export type CreateReportPhotoResult =
  | { status: "created"; attachment: ReportAttachmentRecord }
  | { status: "exists" }
  | { status: "not-found" }

export interface ReportImageRepository {
  ownedReportExists(reportId: string, citizenId: string): Promise<boolean>
  createPhoto(input: CreateReportPhotoInput): Promise<CreateReportPhotoResult>
}

const attachmentSelect = {
  id: true,
  name: true,
  mimeType: true,
  url: true,
  kind: true,
  createdAt: true,
} as const

export function createPrismaReportImageRepository(database: PrismaClient): ReportImageRepository {
  return {
    async ownedReportExists(reportId, citizenId) {
      return (await database.report.count({ where: { id: reportId, authorId: citizenId } })) === 1
    },
    async createPhoto(input) {
      return database.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext(${input.reportId})::bigint)`
        const report = await transaction.report.findFirst({
          where: { id: input.reportId, authorId: input.uploadedById },
          select: {
            id: true,
            attachments: {
              where: { kind: "REPORT_PHOTO" },
              select: { id: true },
              take: 1,
            },
          },
        })
        if (!report) return { status: "not-found" }
        if (report.attachments.length > 0) return { status: "exists" }

        const attachment = await transaction.attachment.create({
          data: {
            id: input.id,
            reportId: input.reportId,
            uploadedById: input.uploadedById,
            name: input.name,
            mimeType: input.mimeType,
            url: input.url,
            kind: "REPORT_PHOTO",
          },
          select: attachmentSelect,
        })
        return { status: "created", attachment }
      })
    },
  }
}
