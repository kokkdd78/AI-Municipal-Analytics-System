import { describe, expect, it, vi } from "vitest"

import type { AuthenticatedMunicipalUser } from "../lib/auth/authorization-core"
import { canonicalJson, sha256Hex } from "../lib/ecm/canonical-json"
import type { ArchiveRepository, ArchiveSourceReport } from "../lib/ecm/repository"
import { createArchiveService, ArchiveServiceError } from "../lib/ecm/service"
import type { ArchiveDocumentStorage } from "../lib/ecm/storage"

const manager: AuthenticatedMunicipalUser = { id: "manager-1", name: "Manager", role: "Manager", isActive: true, avatarUrl: null, districtId: null, departmentId: null }

const resolvedReport: ArchiveSourceReport = {
  id: "report-1", title: "Resolved streetlight", description: "The light was repaired.", category: "lighting", severity: "HIGH", status: "RESOLVED", latitude: 21.5, longitude: 39.1, createdAt: new Date("2026-08-01T10:00:00.000Z"), updatedAt: new Date("2026-08-02T10:00:00.000Z"), district: { id: "district-1", name: "Al-Naeem" }, importedVoteBaseline: 2, voteCount: 3,
  statusHistory: [{ id: "history-1", actorId: "manager-1", fromStatus: "PENDING", toStatus: "RESOLVED", note: "Completed", createdAt: new Date("2026-08-02T10:00:00.000Z") }],
  attachments: [{ id: "attachment-1", name: "photo.png", mimeType: "image/png", url: "https://res.cloudinary.com/demo/image/upload/photo.png", kind: "REPORT_PHOTO", createdAt: new Date("2026-08-01T11:00:00.000Z"), workOrderId: null }],
  workOrders: [],
}

function storage(): ArchiveDocumentStorage & { documents: Map<string, Uint8Array>; removed: string[] } {
  const documents = new Map<string, Uint8Array>()
  const removed: string[] = []
  return {
    provider: "fake-cloudinary",
    documents,
    removed,
    async upload({ bytes, publicId }) { const url = `https://archive.example/${publicId}.json`; documents.set(url, bytes); return { publicId, secureUrl: url } },
    async read(url) { const bytes = documents.get(url); if (!bytes) throw new Error("missing"); return bytes },
    async remove(publicId) { removed.push(publicId); for (const [url] of documents) if (url.includes(publicId)) documents.delete(url) },
  }
}

function repository(overrides: Partial<ArchiveRepository> = {}): ArchiveRepository {
  return {
    async findReportForArchive() { return resolvedReport },
    async findArchiveByReportId() { return null },
    async findArchive() { return null },
    async listArchives() { return { records: [], total: 0 } },
    async listEligibleReports() { return [] },
    async createArchive(input) {
      return { id: input.id, ecmRecordNumber: input.ecmRecordNumber, reportId: input.reportId, reportTitle: input.reportTitle, districtName: input.districtName, manifest: input.manifest, storageKey: input.storageKey, documentUrl: input.documentUrl, checksum: input.checksum, provider: input.provider, status: "ARCHIVED", archivedAt: input.archivedAt, retentionUntil: input.retentionUntil, archivedById: input.archivedById, createdAt: input.archivedAt }
    },
    async addAuditEvent() {},
    ...overrides,
  }
}

describe("ECM canonical package and compensation", () => {
  it("creates stable key ordering and a deterministic SHA-256 digest", () => {
    const first = canonicalJson({ z: [3, { b: true, a: null }], a: "value" })
    const second = canonicalJson({ a: "value", z: [3, { a: null, b: true }] })
    expect(first).toBe(second)
    expect(sha256Hex(new TextEncoder().encode(first))).toMatch(/^[a-f0-9]{64}$/)
  })

  it("removes an uploaded document when database persistence fails", async () => {
    const fakeStorage = storage()
    const service = createArchiveService(repository({ createArchive: vi.fn(async () => { throw new Error("database failure") }) }), fakeStorage, { generateId: (() => { let value = 0; return () => `id-${++value}` })(), now: () => new Date("2026-08-03T12:00:00.000Z") })
    await expect(service.archiveReport(manager, resolvedReport.id)).rejects.toEqual(expect.any(ArchiveServiceError))
    expect(fakeStorage.removed).toHaveLength(1)
    expect(fakeStorage.documents.size).toBe(0)
  })

  it("does not create a database archive when document upload fails", async () => {
    const createArchive = vi.fn()
    const failingStorage: ArchiveDocumentStorage = { provider: "fake", upload: async () => { throw new Error("upload failure") }, read: async () => new Uint8Array(), remove: async () => undefined }
    const service = createArchiveService(repository({ createArchive }), failingStorage)
    await expect(service.archiveReport(manager, resolvedReport.id)).rejects.toEqual(expect.any(ArchiveServiceError))
    expect(createArchive).not.toHaveBeenCalled()
  })
})
