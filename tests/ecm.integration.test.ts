import "dotenv/config"

import { randomBytes } from "node:crypto"

import { PrismaNeon } from "@prisma/adapter-neon"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { PrismaClient, ReportStatus, UserRole, WorkOrderPriority, WorkOrderStatus } from "../generated/prisma/client"
import type { ApiAuthorizationResult, AuthenticatedMunicipalUser } from "../lib/auth/authorization-core"
import { createArchiveHttpHandlers, type ArchiveHttpAuthorization } from "../lib/ecm/http"
import { createPrismaArchiveRepository } from "../lib/ecm/repository"
import { createArchiveService } from "../lib/ecm/service"
import type { ArchiveDocumentStorage } from "../lib/ecm/storage"
import { deriveExistingUserAuthEmail } from "../lib/auth/identifiers"
import { requireSafeTestDatabaseUrl } from "../lib/db/test-database-url"

const RUN_ID = randomBytes(6).toString("hex")
const PREFIX = `ecm-${RUN_ID}-`
const ORIGIN = "https://municipal.example.test"
const IDS = {
  district: `${PREFIX}district`, manager: `${PREFIX}manager`, citizen: `${PREFIX}citizen`, crew: `${PREFIX}crew`, secondCrew: `${PREFIX}second-crew`, inactiveCrew: `${PREFIX}inactive-crew`,
  open: `${PREFIX}open`, resolved: `${PREFIX}resolved`, storageFailure: `${PREFIX}storage-failure`, databaseFailure: `${PREFIX}database-failure`, workOrder: `${PREFIX}work-order`, assignment: `${PREFIX}assignment`,
}

let database: PrismaClient
let handlers: ReturnType<typeof createArchiveHttpHandlers>
let documents: Map<string, Uint8Array>
let removed: string[]
let generated = 0

function nextId(): string { generated += 1; return `${PREFIX}generated-${generated}` }

function request(path: string, options: { method?: "GET" | "POST"; body?: unknown; userId?: string; origin?: string | null } = {}): Request {
  const method = options.method ?? "GET"
  const headers = new Headers()
  if (options.userId) headers.set("x-test-user-id", options.userId)
  if (method === "POST" && options.origin !== null) headers.set("origin", options.origin ?? ORIGIN)
  if (options.body !== undefined) headers.set("content-type", "application/json")
  return new Request(`${ORIGIN}${path}`, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) })
}

function context(id: string) { return { params: Promise.resolve({ id }) } }

async function liveUser(headers: Headers): Promise<AuthenticatedMunicipalUser | null> {
  const id = headers.get("x-test-user-id")
  if (!id) return null
  const user = await database.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, isActive: true, avatarUrl: true, districtId: true, departmentId: true } })
  return user?.isActive ? { ...user, isActive: true } : null
}

function denied(status: 401 | 403): ApiAuthorizationResult { return { response: Response.json({ error: status === 401 ? "Authentication required" : "Access denied" }, { status }) } }
const authorization: ArchiveHttpAuthorization = {
  async requireManager(headers) { const user = await liveUser(headers); if (!user) return denied(401); return user.role === "Manager" ? { user } : denied(403) },
}

function fakeStorage(): ArchiveDocumentStorage {
  documents = new Map()
  removed = []
  return {
    provider: "fake-cloudinary",
    async upload({ bytes, publicId }) { const secureUrl = `https://archive.example/${publicId}.json`; documents.set(secureUrl, new Uint8Array(bytes)); return { publicId, secureUrl } },
    async read(secureUrl) { const bytes = documents.get(secureUrl); if (!bytes) throw new Error("missing archive document"); return new Uint8Array(bytes) },
    async remove(publicId) { removed.push(publicId); for (const [url] of documents) if (url.includes(publicId)) documents.delete(url) },
  }
}

async function cleanup(): Promise<void> {
  requireSafeTestDatabaseUrl()
  if (!database) return
  await database.archiveRecord.deleteMany({ where: { reportId: { startsWith: PREFIX } } })
  await database.workOrder.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await database.report.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await database.user.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await database.district.deleteMany({ where: { id: IDS.district } })
}

describe("ECM guarded archive integration", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    const connectionString = requireSafeTestDatabaseUrl()
    database = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) })
    await cleanup()
    await database.district.create({ data: { id: IDS.district, name: `ECM ${RUN_ID}`, arabicName: "أرشيف اختبار" } })
    await database.user.createMany({ data: [
      { id: IDS.manager, name: "Archive Manager", authEmail: deriveExistingUserAuthEmail(IDS.manager), role: UserRole.Manager },
      { id: IDS.citizen, name: "Citizen", authEmail: deriveExistingUserAuthEmail(IDS.citizen), role: UserRole.Citizen, districtId: IDS.district },
      { id: IDS.crew, name: "Crew One", authEmail: deriveExistingUserAuthEmail(IDS.crew), role: UserRole.Crew },
      { id: IDS.secondCrew, name: "Crew Two", authEmail: deriveExistingUserAuthEmail(IDS.secondCrew), role: UserRole.Crew },
      { id: IDS.inactiveCrew, name: "Inactive Crew", authEmail: deriveExistingUserAuthEmail(IDS.inactiveCrew), role: UserRole.Crew, isActive: false },
    ] })
    await database.report.createMany({ data: [
      { id: IDS.open, authorId: IDS.citizen, districtId: IDS.district, title: "Open report", description: "This remains open.", category: "pothole", status: ReportStatus.PENDING, latitude: 21.5, longitude: 39.1 },
      { id: IDS.resolved, authorId: IDS.citizen, districtId: IDS.district, title: "Resolved report", description: "This report has completion evidence.", category: "lighting", status: ReportStatus.RESOLVED, latitude: 21.6, longitude: 39.2, importedVoteBaseline: 2 },
      { id: IDS.storageFailure, authorId: IDS.citizen, districtId: IDS.district, title: "Storage failure", description: "Storage fails.", category: "water", status: ReportStatus.RESOLVED, latitude: 21.7, longitude: 39.3 },
      { id: IDS.databaseFailure, authorId: IDS.citizen, districtId: IDS.district, title: "Database failure", description: "Database fails.", category: "roads", status: ReportStatus.RESOLVED, latitude: 21.8, longitude: 39.4 },
    ] })
    await database.statusHistory.createMany({ data: [
      { id: `${PREFIX}history-pending`, reportId: IDS.resolved, actorId: IDS.citizen, fromStatus: null, toStatus: ReportStatus.PENDING, note: "Report submitted", createdAt: new Date("2026-08-01T10:00:00.000Z") },
      { id: `${PREFIX}history-resolved`, reportId: IDS.resolved, actorId: IDS.manager, fromStatus: ReportStatus.IN_PROGRESS, toStatus: ReportStatus.RESOLVED, note: "Work completed", createdAt: new Date("2026-08-02T10:00:00.000Z") },
    ] })
    await database.vote.create({ data: { id: `${PREFIX}vote`, reportId: IDS.resolved, userId: IDS.citizen } })
    await database.attachment.create({ data: { id: `${PREFIX}report-photo`, reportId: IDS.resolved, uploadedById: IDS.citizen, name: "before.png", mimeType: "image/png", url: "https://res.cloudinary.com/demo/image/upload/before.png", kind: "REPORT_PHOTO" } })
    await database.workOrder.create({ data: { id: IDS.workOrder, reportId: IDS.resolved, createdById: IDS.manager, title: "Repair lighting", description: "Repair the fixture", priority: WorkOrderPriority.HIGH, status: WorkOrderStatus.COMPLETED, startedAt: new Date("2026-08-01T12:00:00.000Z"), completedAt: new Date("2026-08-02T09:00:00.000Z"), crewAssignments: { create: { id: IDS.assignment, crewUserId: IDS.crew, assignedById: IDS.manager } }, statusHistory: { create: { id: `${PREFIX}work-history`, actorId: IDS.crew, fromStatus: WorkOrderStatus.ACTIVE, toStatus: WorkOrderStatus.COMPLETED, note: "Fixture repaired" } } } })
    await database.attachment.create({ data: { id: `${PREFIX}completion`, reportId: IDS.resolved, workOrderId: IDS.workOrder, workOrderReportId: IDS.resolved, uploadedById: IDS.crew, name: "completion.png", mimeType: "image/png", url: "https://res.cloudinary.com/demo/image/upload/completion.png", kind: "COMPLETION_EVIDENCE" } })
    handlers = createArchiveHttpHandlers({ authorization, service: createArchiveService(createPrismaArchiveRepository(database), fakeStorage(), { generateId: nextId, now: () => new Date("2026-08-05T12:00:00.000Z") }), trustedOrigins: [ORIGIN] })
  })

  afterAll(async () => { await cleanup(); await database?.$disconnect() })

  it("enforces live Manager access and rejects an untrusted origin before mutation", async () => {
    expect((await handlers.listGET(request("/api/manager/archives"))).status).toBe(401)
    expect((await handlers.listGET(request("/api/manager/archives", { userId: IDS.citizen }))).status).toBe(403)
    expect((await handlers.archivePOST(request("/api/manager/archives", { method: "POST", userId: IDS.citizen, body: { reportId: IDS.resolved } }))).status).toBe(403)
    expect((await handlers.archivePOST(request("/api/manager/archives", { method: "POST", userId: IDS.manager, origin: "https://attacker.example", body: { reportId: IDS.resolved } }))).status).toBe(403)
    expect(await database.archiveRecord.count({ where: { reportId: IDS.resolved } })).toBe(0)
  })

  it("rejects an open report without creating a record", async () => {
    const response = await handlers.archivePOST(request("/api/manager/archives", { method: "POST", userId: IDS.manager, body: { reportId: IDS.open } }))
    expect(response.status).toBe(409)
    expect(await database.archiveRecord.count({ where: { reportId: IDS.open } })).toBe(0)
  })

  it("archives a resolved report once with its real timeline, votes, attachments, work order and Crew assignment", async () => {
    const response = await handlers.archivePOST(request("/api/manager/archives", { method: "POST", userId: IDS.manager, body: { reportId: IDS.resolved } }))
    expect(response.status).toBe(201)
    const created = await response.json() as { id: string; ecmRecordNumber: string; checksum: string }
    expect(created.ecmRecordNumber).toMatch(/^ECM-2026-/)
    expect(created.checksum).toMatch(/^[a-f0-9]{64}$/)
    const record = await database.archiveRecord.findUniqueOrThrow({ where: { reportId: IDS.resolved }, include: { auditEvents: true } })
    expect(record.auditEvents).toHaveLength(1)
    const manifest = record.manifest as { report: { voteCount: number; title: string }; statusHistory: unknown[]; attachments: { kind: string }[]; workOrders: { assignments: { crewUser: { id: string } }[]; attachments: { kind: string }[] }[] }
    expect(manifest.report).toEqual(expect.objectContaining({ title: "Resolved report", voteCount: 3 }))
    expect(manifest.statusHistory).toHaveLength(2)
    expect(manifest.attachments).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "REPORT_PHOTO" }), expect.objectContaining({ kind: "COMPLETION_EVIDENCE" })]))
    expect(manifest.workOrders[0]?.assignments[0]?.crewUser.id).toBe(IDS.crew)
    expect(manifest.workOrders[0]?.attachments).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "COMPLETION_EVIDENCE" })]))

    const repeated = await handlers.archivePOST(request("/api/manager/archives", { method: "POST", userId: IDS.manager, body: { reportId: IDS.resolved } }))
    expect(repeated.status).toBe(201)
    expect((await repeated.json() as { id: string }).id).toBe(created.id)
    expect(await database.archiveRecord.count({ where: { reportId: IDS.resolved } })).toBe(1)
  })

  it("keeps the archived manifest immutable after operational changes and verifies then detects changed stored bytes", async () => {
    const archive = await database.archiveRecord.findUniqueOrThrow({ where: { reportId: IDS.resolved } })
    await database.report.update({ where: { id: IDS.resolved }, data: { title: "Changed operational title", description: "Changed after archive" } })
    const detailResponse = await handlers.detailGET(request(`/api/manager/archives/${archive.id}`, { userId: IDS.manager }), context(archive.id))
    expect(detailResponse.status).toBe(200)
    const detail = await detailResponse.json() as { manifest: { report: { title: string; description: string } } }
    expect(detail.manifest.report).toMatchObject({ title: "Resolved report", description: "This report has completion evidence." })

    const valid = await handlers.verifyPOST(request(`/api/manager/archives/${archive.id}/verify`, { method: "POST", userId: IDS.manager, body: {} }), context(archive.id))
    expect(await valid.json()).toMatchObject({ valid: true })
    documents.set(archive.documentUrl, new TextEncoder().encode("altered"))
    const invalid = await handlers.verifyPOST(request(`/api/manager/archives/${archive.id}/verify`, { method: "POST", userId: IDS.manager, body: {} }), context(archive.id))
    expect(await invalid.json()).toMatchObject({ valid: false })
    expect(await database.archiveAuditEvent.count({ where: { archiveRecordId: archive.id, type: "INTEGRITY_FAILED" } })).toBe(1)
  })

  it("lists, searches, opens details, and exposes the secured package URL", async () => {
    const archive = await database.archiveRecord.findUniqueOrThrow({ where: { reportId: IDS.resolved } })
    const list = await handlers.listGET(request(`/api/manager/archives?q=${encodeURIComponent(archive.ecmRecordNumber)}&page=1&pageSize=1`, { userId: IDS.manager }))
    expect(list.status).toBe(200)
    expect(await list.json()).toMatchObject({ total: 1, archives: [expect.objectContaining({ id: archive.id })] })
    const document = await handlers.documentGET(request(`/api/manager/archives/${archive.id}/document`, { userId: IDS.manager }), context(archive.id))
    expect(document.status).toBe(200)
    expect(await document.json()).toEqual({ documentUrl: archive.documentUrl })
  })
})
