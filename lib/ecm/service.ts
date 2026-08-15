import { randomUUID } from "node:crypto"

import type { UserRole } from "../../generated/prisma/client"
import type { AuthenticatedMunicipalUser } from "../auth/authorization-core"
import { canonicalJson, sha256Hex } from "./canonical-json"
import type { ArchiveListQuery } from "./contracts"
import {
  createArchiveManifest,
  toArchiveDetailDto,
  toArchiveListRecordDto,
  toEligibleArchiveReportDto,
  type ArchiveDetailDto,
  type ArchiveListDto,
  type EligibleArchiveReportDto,
} from "./dto"
import type { ArchiveRepository } from "./repository"
import type { ArchiveDocumentStorage } from "./storage"

export type ArchiveServiceErrorCode = "conflict" | "forbidden" | "invalid-request" | "not-found" | "server"

export class ArchiveServiceError extends Error {
  constructor(readonly code: ArchiveServiceErrorCode) {
    super("Archive operation failed")
    this.name = "ArchiveServiceError"
  }
}

export interface ArchiveService {
  listArchives(user: AuthenticatedMunicipalUser, query: ArchiveListQuery): Promise<{ archives: ArchiveListDto[]; page: number; pageSize: number; total: number; totalPages: number }>
  listEligibleReports(user: AuthenticatedMunicipalUser): Promise<EligibleArchiveReportDto[]>
  getArchive(user: AuthenticatedMunicipalUser, id: string): Promise<ArchiveDetailDto>
  archiveReport(user: AuthenticatedMunicipalUser, reportId: string): Promise<ArchiveListDto>
  verifyIntegrity(user: AuthenticatedMunicipalUser, id: string): Promise<{ valid: boolean; verifiedAt: string; checksum: string }>
  openArchiveDocument(user: AuthenticatedMunicipalUser, id: string): Promise<{ documentUrl: string }>
}

function requireManager(role: UserRole): void {
  if (role !== "Manager") throw new ArchiveServiceError("forbidden")
}

function retentionDate(archivedAt: Date): Date {
  const retention = new Date(archivedAt)
  retention.setUTCFullYear(retention.getUTCFullYear() + 5)
  return retention
}

function ecmRecordNumber(now: Date, id: string): string {
  const year = now.getUTCFullYear()
  return `ECM-${year}-${id.replace(/[^A-Za-z0-9]/g, "").slice(0, 24).toUpperCase()}`
}

function isUniqueConstraint(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002")
}

export function createArchiveService(
  repository: ArchiveRepository,
  storage: ArchiveDocumentStorage,
  dependencies: { generateId?: () => string; now?: () => Date } = {},
): ArchiveService {
  const generateId = dependencies.generateId ?? randomUUID
  const now = dependencies.now ?? (() => new Date())

  return {
    async listArchives(user, query) {
      requireManager(user.role)
      const result = await repository.listArchives(query)
      return {
        archives: result.records.map(toArchiveListRecordDto),
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      }
    },

    async listEligibleReports(user) {
      requireManager(user.role)
      return (await repository.listEligibleReports()).map(toEligibleArchiveReportDto)
    },

    async getArchive(user, id) {
      requireManager(user.role)
      const archive = await repository.findArchive(id)
      if (!archive) throw new ArchiveServiceError("not-found")
      await repository.addAuditEvent({
        id: generateId(),
        archiveRecordId: archive.id,
        actorId: user.id,
        type: "VIEWED",
        createdAt: now(),
      })
      return toArchiveDetailDto(archive)
    },

    async archiveReport(user, reportId) {
      requireManager(user.role)
      const existing = await repository.findArchiveByReportId(reportId)
      if (existing) return toArchiveListRecordDto(existing)

      const report = await repository.findReportForArchive(reportId)
      if (!report) throw new ArchiveServiceError("not-found")
      if (report.status !== "RESOLVED") throw new ArchiveServiceError("conflict")

      const archivedAt = now()
      const archiveId = generateId()
      const recordNumber = ecmRecordNumber(archivedAt, generateId())
      const manifest = createArchiveManifest(report, {
        ecmRecordNumber: recordNumber,
        archivedAt,
        retentionUntil: retentionDate(archivedAt),
        archivedById: user.id,
      })
      const bytes = new TextEncoder().encode(canonicalJson(manifest))
      const checksum = sha256Hex(bytes)
      let stored: { publicId: string; secureUrl: string } | null = null

      try {
        stored = await storage.upload({
          bytes,
          folder: `smart-municipal-assistant/ecm/${archivedAt.getUTCFullYear()}`,
          publicId: recordNumber.toLowerCase(),
        })
        if (sha256Hex(await storage.read(stored.secureUrl)) !== checksum) {
          throw new ArchiveServiceError("server")
        }
      } catch (error) {
        if (stored) await storage.remove(stored.publicId).catch(() => undefined)
        if (error instanceof ArchiveServiceError) throw error
        throw new ArchiveServiceError("server")
      }

      try {
        const created = await repository.createArchive({
          id: archiveId,
          ecmRecordNumber: recordNumber,
          reportId: report.id,
          reportTitle: report.title,
          districtName: report.district.name,
          manifest,
          storageKey: stored.publicId,
          documentUrl: stored.secureUrl,
          checksum,
          provider: storage.provider,
          archivedAt,
          retentionUntil: retentionDate(archivedAt),
          archivedById: user.id,
          eventId: generateId(),
        })
        return toArchiveListRecordDto(created)
      } catch (error) {
        await storage.remove(stored.publicId).catch(() => undefined)
        if (isUniqueConstraint(error)) {
          const raced = await repository.findArchiveByReportId(report.id)
          if (raced) return toArchiveListRecordDto(raced)
        }
        throw new ArchiveServiceError("server")
      }
    },

    async verifyIntegrity(user, id) {
      requireManager(user.role)
      const archive = await repository.findArchive(id)
      if (!archive) throw new ArchiveServiceError("not-found")
      const verifiedAt = now()
      let valid = false
      try {
        valid = sha256Hex(await storage.read(archive.documentUrl)) === archive.checksum
      } catch {
        valid = false
      }
      await repository.addAuditEvent({
        id: generateId(),
        archiveRecordId: archive.id,
        actorId: user.id,
        type: valid ? "INTEGRITY_VERIFIED" : "INTEGRITY_FAILED",
        details: { checksum: archive.checksum },
        createdAt: verifiedAt,
      })
      return { valid, verifiedAt: verifiedAt.toISOString(), checksum: archive.checksum }
    },

    async openArchiveDocument(user, id) {
      requireManager(user.role)
      const archive = await repository.findArchive(id)
      if (!archive) throw new ArchiveServiceError("not-found")
      await repository.addAuditEvent({
        id: generateId(),
        archiveRecordId: archive.id,
        actorId: user.id,
        type: "VIEWED",
        details: { action: "open-document" },
        createdAt: now(),
      })
      return { documentUrl: archive.documentUrl }
    },
  }
}
