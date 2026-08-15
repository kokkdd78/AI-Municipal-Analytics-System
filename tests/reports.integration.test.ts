import "dotenv/config"

import { randomBytes } from "node:crypto"

import { PrismaNeon } from "@prisma/adapter-neon"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  PrismaClient,
  ReportSeverity,
  ReportStatus,
  UserRole,
  WorkOrderPriority,
  WorkOrderStatus,
} from "../generated/prisma/client"
import type {
  ApiAuthorizationResult,
  AuthenticatedMunicipalUser,
} from "../lib/auth/authorization-core"
import { deriveExistingUserAuthEmail } from "../lib/auth/identifiers"
import { requireSafeTestDatabaseUrl } from "../lib/db/test-database-url"
import { createReportHttpHandlers, type ReportHttpAuthorization } from "../lib/reports/http"
import { createPrismaReportRepository, type ReportRepository } from "../lib/reports/repository"
import { createReportService } from "../lib/reports/service"

const RUN_ID = randomBytes(6).toString("hex")
const PREFIX = `phase3a1-${RUN_ID}-`
const APP_ORIGIN = "https://municipal.example.test"
const IDS = {
  district: `${PREFIX}district`,
  citizenOne: `${PREFIX}citizen-one`,
  citizenTwo: `${PREFIX}citizen-two`,
  manager: `${PREFIX}manager`,
  crew: `${PREFIX}crew`,
  unassignedCrew: `${PREFIX}unassigned-crew`,
  inactiveCitizen: `${PREFIX}inactive-citizen`,
  citizenOneReport: `${PREFIX}citizen-one-report`,
  citizenTwoReport: `${PREFIX}citizen-two-report`,
  assignedReport: `${PREFIX}assigned-report`,
  voteReport: `${PREFIX}vote-report`,
  concurrentVoteReport: `${PREFIX}concurrent-vote-report`,
  workOrder: `${PREFIX}work-order`,
  assignment: `${PREFIX}assignment`,
  pendingHistory: `${PREFIX}pending-history`,
  progressHistory: `${PREFIX}progress-history`,
  personalizedVote: `${PREFIX}personalized-vote`,
}

let database: PrismaClient
let handlers: ReturnType<typeof createReportHttpHandlers>
let repository: ReportRepository
let generatedId = 0

function userHeader(userId?: string): HeadersInit | undefined {
  return userId ? { "x-test-user-id": userId } : undefined
}

function request(
  path: string,
  options: { method?: string; body?: unknown; userId?: string; origin?: string | null } = {},
): Request {
  const headers = new Headers(userHeader(options.userId))
  const method = options.method ?? "GET"
  if (options.body !== undefined) headers.set("content-type", "application/json")
  if (options.origin !== null && (method === "POST" || options.origin !== undefined)) {
    headers.set("origin", options.origin ?? APP_ORIGIN)
  }
  return new Request(`https://municipal.example.test${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
}

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

function validCreateBody(overrides: Record<string, unknown> = {}) {
  return {
    category: "pothole",
    description: "A test-branch pothole is blocking the right lane.",
    districtId: IDS.district,
    location: { lat: 21.5433, lng: 39.1728 },
    severity: "high",
    ...overrides,
  }
}

async function cleanup(): Promise<void> {
  requireSafeTestDatabaseUrl()
  if (!database) return

  await database.workOrder.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await database.report.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await database.user.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await database.district.deleteMany({ where: { id: { startsWith: PREFIX } } })
}

async function liveTestUser(headers: Headers): Promise<AuthenticatedMunicipalUser | null> {
  const id = headers.get("x-test-user-id")
  if (!id) return null
  const user = await database.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      role: true,
      isActive: true,
      avatarUrl: true,
      districtId: true,
      departmentId: true,
    },
  })
  if (!user?.isActive) return null
  return { ...user, isActive: true }
}

function authorizationResponse(status: 401 | 403): ApiAuthorizationResult {
  return {
    response: Response.json(
      { error: status === 401 ? "Authentication required" : "Access denied" },
      { status },
    ),
  }
}

const authorization: ReportHttpAuthorization = {
  async requireRole(role, headers) {
    const user = await liveTestUser(headers)
    if (!user) return authorizationResponse(401)
    return user.role === role ? { user } : authorizationResponse(403)
  },
  async requireAnyRole(roles, headers) {
    const user = await liveTestUser(headers)
    if (!user) return authorizationResponse(401)
    return roles.includes(user.role) ? { user } : authorizationResponse(403)
  },
}

async function municipalCounts(): Promise<{ reports: number; histories: number; votes: number }> {
  const [reports, histories, votes] = await Promise.all([
    database.report.count({ where: { id: { startsWith: PREFIX } } }),
    database.statusHistory.count({ where: { reportId: { startsWith: PREFIX } } }),
    database.vote.count({ where: { reportId: { startsWith: PREFIX } } }),
  ])
  return { reports, histories, votes }
}

describe("Phase 3A1 guarded report API integration", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    const testConnectionString = requireSafeTestDatabaseUrl()
    database = new PrismaClient({ adapter: new PrismaNeon({ connectionString: testConnectionString }) })
    await cleanup()

    await database.district.create({
      data: { id: IDS.district, name: `Phase 3A1 ${RUN_ID}`, arabicName: "حي اختبار التقارير" },
    })
    await database.user.createMany({
      data: [
        { id: IDS.citizenOne, name: "Citizen One", authEmail: deriveExistingUserAuthEmail(IDS.citizenOne), role: UserRole.Citizen, districtId: IDS.district },
        { id: IDS.citizenTwo, name: "Citizen Two", authEmail: deriveExistingUserAuthEmail(IDS.citizenTwo), role: UserRole.Citizen, districtId: IDS.district },
        { id: IDS.manager, name: "Manager", authEmail: deriveExistingUserAuthEmail(IDS.manager), role: UserRole.Manager },
        { id: IDS.crew, name: "Assigned Crew", authEmail: deriveExistingUserAuthEmail(IDS.crew), role: UserRole.Crew },
        { id: IDS.unassignedCrew, name: "Unassigned Crew", authEmail: deriveExistingUserAuthEmail(IDS.unassignedCrew), role: UserRole.Crew },
        { id: IDS.inactiveCitizen, name: "Inactive Citizen", authEmail: deriveExistingUserAuthEmail(IDS.inactiveCitizen), role: UserRole.Citizen, isActive: false },
      ],
    })
    await database.report.createMany({
      data: [
        { id: IDS.citizenOneReport, authorId: IDS.citizenOne, districtId: IDS.district, title: "Citizen one report", description: "Owned only by citizen one", category: "trash", status: ReportStatus.PENDING, severity: ReportSeverity.LOW, latitude: 21.51, longitude: 39.11 },
        { id: IDS.citizenTwoReport, authorId: IDS.citizenTwo, districtId: IDS.district, title: "Citizen two report", description: "Owned only by citizen two", category: "lighting", status: ReportStatus.PENDING, severity: ReportSeverity.MEDIUM, latitude: 21.52, longitude: 39.12 },
        { id: IDS.assignedReport, authorId: IDS.citizenOne, districtId: IDS.district, title: "Assigned report", description: "Assigned to the test crew", category: "water", status: ReportStatus.IN_PROGRESS, severity: ReportSeverity.HIGH, latitude: 21.53, longitude: 39.13 },
        { id: IDS.voteReport, authorId: IDS.citizenTwo, districtId: IDS.district, title: "Vote report", description: "Carries an imported vote baseline", category: "trees", importedVoteBaseline: 2, latitude: 21.54, longitude: 39.14 },
        { id: IDS.concurrentVoteReport, authorId: IDS.citizenTwo, districtId: IDS.district, title: "Concurrent vote report", description: "Receives concurrent duplicate votes", category: "pothole", latitude: 21.55, longitude: 39.15 },
      ],
    })
    await database.statusHistory.createMany({
      data: [
        { id: IDS.pendingHistory, reportId: IDS.assignedReport, actorId: IDS.manager, fromStatus: null, toStatus: ReportStatus.PENDING, note: "Report submitted", createdAt: new Date("2026-08-15T10:00:00.000Z") },
        { id: IDS.progressHistory, reportId: IDS.assignedReport, actorId: IDS.manager, fromStatus: ReportStatus.PENDING, toStatus: ReportStatus.IN_PROGRESS, note: "Crew dispatched", createdAt: new Date("2026-08-15T10:01:00.000Z") },
      ],
    })
    await database.vote.create({
      data: { id: IDS.personalizedVote, reportId: IDS.citizenOneReport, userId: IDS.citizenTwo },
    })
    await database.workOrder.create({
      data: {
        id: IDS.workOrder,
        reportId: IDS.assignedReport,
        createdById: IDS.manager,
        title: "Repair water issue",
        description: "Inspect and repair the reported issue",
        priority: WorkOrderPriority.HIGH,
        status: WorkOrderStatus.ACTIVE,
        crewAssignments: {
          create: { id: IDS.assignment, crewUserId: IDS.crew, assignedById: IDS.manager },
        },
      },
    })

    repository = createPrismaReportRepository(database)
    const service = createReportService(repository, () => `${PREFIX}generated-${++generatedId}`)
    handlers = createReportHttpHandlers({ authorization, service, trustedOrigins: [APP_ORIGIN] })
  }, 60_000)

  afterAll(async () => {
    if (!database) return
    await cleanup()
    await database.$disconnect()
  }, 60_000)

  it("creates a Citizen-owned report and initial history atomically", async () => {
    const response = await handlers.collectionPOST(
      request("/api/reports", { method: "POST", body: validCreateBody(), userId: IDS.citizenOne }),
    )
    expect(response.status).toBe(201)
    const body = (await response.json()) as { id: string; title: string; authorId: string; status: string; votes: number }
    expect(body).toMatchObject({ title: "Pothole", authorId: IDS.citizenOne, status: "pending", votes: 0 })

    const stored = await database.report.findUniqueOrThrow({
      where: { id: body.id },
      include: { statusHistory: true, attachments: true },
    })
    expect(stored).toMatchObject({
      authorId: IDS.citizenOne,
      title: "Pothole",
      status: ReportStatus.PENDING,
      importedVoteBaseline: 0,
    })
    expect(stored.statusHistory).toHaveLength(1)
    expect(stored.statusHistory[0]).toMatchObject({
      actorId: IDS.citizenOne,
      fromStatus: null,
      toStatus: ReportStatus.PENDING,
      note: "Report submitted",
    })
    expect(stored.attachments).toHaveLength(0)
  })

  it("rolls back report creation when its initial history cannot be created", async () => {
    const reportId = `${PREFIX}atomic-rollback-report`
    await expect(
      repository.createReport({
        id: reportId,
        historyId: IDS.pendingHistory,
        authorId: IDS.citizenOne,
        districtId: IDS.district,
        title: "Atomic rollback",
        description: "The duplicate history identifier must roll back this report.",
        category: "other",
        severity: null,
        latitude: 21.56,
        longitude: 39.16,
      }),
    ).rejects.toThrow()
    await expect(database.report.findUnique({ where: { id: reportId } })).resolves.toBeNull()
  })

  it("rejects forged and invalid creation data without mutating municipal records", async () => {
    const before = await municipalCounts()
    const invalidBodies = [
      validCreateBody({ authorId: IDS.citizenTwo }),
      validCreateBody({ id: "forged-id" }),
      validCreateBody({ status: "resolved" }),
      validCreateBody({ votes: 500 }),
      validCreateBody({ createdAt: new Date().toISOString() }),
      validCreateBody({ severity: "critical" }),
      validCreateBody({ location: { lat: 91, lng: 39.2 } }),
      validCreateBody({ districtId: `${PREFIX}missing-district` }),
      validCreateBody({ attachments: [{ url: "data:image/png;base64,forged" }] }),
      ...["_", "___", "-", "---", "_-_ -__"].map((category) => validCreateBody({ category })),
    ]

    for (const body of invalidBodies) {
      const response = await handlers.collectionPOST(
        request("/api/reports", { method: "POST", body, userId: IDS.citizenOne }),
      )
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: "Invalid request" })
    }
    expect(await municipalCounts()).toEqual(before)
  })

  it("rejects untrusted or ambiguous origins before report and vote mutations", async () => {
    const before = await municipalCounts()
    const rejectedOrigins = [
      "https://attacker.example.test",
      "https://evil.test",
      null,
      "null",
      "not-an-origin",
      `${APP_ORIGIN}, https://evil.test`,
      `${APP_ORIGIN}, ${APP_ORIGIN}`,
      "http://municipal.example.test",
      "https://municipal.example.test.evil.test",
      "https://municipal.example.test:444",
    ] as const

    for (const origin of rejectedOrigins) {
      const creation = await handlers.collectionPOST(
        request("/api/reports", {
          method: "POST",
          body: validCreateBody(),
          userId: IDS.citizenOne,
          origin,
        }),
      )
      const vote = await handlers.votePOST(
        request(`/api/reports/${IDS.citizenOneReport}/vote`, {
          method: "POST",
          userId: IDS.citizenTwo,
          origin,
        }),
        context(IDS.citizenOneReport),
      )

      expect(creation.status, String(origin)).toBe(403)
      expect(vote.status, String(origin)).toBe(403)
      await expect(creation.json()).resolves.toEqual({ error: "Access denied" })
      await expect(vote.json()).resolves.toEqual({ error: "Access denied" })
    }

    expect(await municipalCounts()).toEqual(before)
  })

  it("rejects unauthenticated, inactive, and non-Citizen mutations", async () => {
    const before = await municipalCounts()
    const unauthenticated = await handlers.collectionPOST(
      request("/api/reports", { method: "POST", body: validCreateBody() }),
    )
    const inactive = await handlers.collectionPOST(
      request("/api/reports", { method: "POST", body: validCreateBody(), userId: IDS.inactiveCitizen }),
    )
    const manager = await handlers.collectionPOST(
      request("/api/reports", { method: "POST", body: validCreateBody(), userId: IDS.manager }),
    )

    expect(unauthenticated.status).toBe(401)
    expect(inactive.status).toBe(401)
    expect(manager.status).toBe(403)
    expect(await municipalCounts()).toEqual(before)
  })

  it("lists mine by exact stable user ID and keeps community projections private", async () => {
    const mineResponse = await handlers.collectionGET(
      request("/api/reports?scope=mine&limit=50", { userId: IDS.citizenOne }),
    )
    expect(mineResponse.status).toBe(200)
    const mine = (await mineResponse.json()) as { reports: Array<{ authorId: string; hasVoted: boolean }> }
    expect(mine.reports.length).toBeGreaterThan(0)
    expect(mine.reports.every((report) => report.authorId === IDS.citizenOne)).toBe(true)
    expect(mine.reports.find((report) => report.authorId === IDS.citizenOne)?.hasVoted).toBe(false)

    const communityResponse = await handlers.collectionGET(
      request("/api/reports?scope=community&limit=50", { userId: IDS.citizenTwo }),
    )
    const community = (await communityResponse.json()) as { reports: Array<Record<string, unknown>> }
    expect(community.reports).toContainEqual(expect.objectContaining({
      id: IDS.citizenOneReport,
      hasVoted: true,
    }))
    for (const report of community.reports) {
      expect(Object.keys(report)).toEqual([
        "id", "title", "description", "category", "status", "severity", "location",
        "district", "createdAt", "updatedAt", "votes", "hasVoted", "attachments",
      ])
      expect(JSON.stringify(report)).not.toMatch(/phone|authEmail|authUsername|employeeId|account|session|authorId|voterId/i)
    }
  })

  it("strictly validates list pagination and produces deterministic cursor pages", async () => {
    for (const query of [
      "scope=mine&limit=0",
      "scope=mine&limit=51",
      "scope=unknown",
      "scope=mine&unknown=true",
      "scope=mine&scope=community",
      `scope=mine&cursor=${PREFIX}missing-report`,
    ]) {
      const response = await handlers.collectionGET(request(`/api/reports?${query}`, { userId: IDS.citizenOne }))
      expect(response.status).toBe(400)
    }

    const firstResponse = await handlers.collectionGET(
      request("/api/reports?scope=community&limit=2", { userId: IDS.citizenOne }),
    )
    const first = (await firstResponse.json()) as { reports: Array<{ id: string }>; nextCursor: string }
    expect(first.reports).toHaveLength(2)
    expect(first.nextCursor).toBe(first.reports[1]?.id)
    const secondResponse = await handlers.collectionGET(
      request(`/api/reports?scope=community&limit=2&cursor=${first.nextCursor}`, { userId: IDS.citizenOne }),
    )
    const second = (await secondResponse.json()) as { reports: Array<{ id: string }> }
    const firstIds = first.reports.map((report) => report.id)
    const secondIds = second.reports.map((report) => report.id)
    expect(secondIds.filter((id) => firstIds.includes(id))).toEqual([])
    const expected = await database.report.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 4,
      select: { id: true },
    })
    expect([...firstIds, ...secondIds]).toEqual(expected.map((report) => report.id))
  })

  it("hides cross-Citizen details and status while allowing Manager access", async () => {
    const crossDetail = await handlers.detailGET(
      request(`/api/reports/${IDS.citizenOneReport}`, { userId: IDS.citizenTwo }),
      context(IDS.citizenOneReport),
    )
    const missingDetail = await handlers.detailGET(
      request(`/api/reports/${PREFIX}missing`, { userId: IDS.citizenTwo }),
      context(`${PREFIX}missing`),
    )
    const crossStatus = await handlers.statusGET(
      request(`/api/report-status/${IDS.citizenOneReport}`, { userId: IDS.citizenTwo }),
      context(IDS.citizenOneReport),
    )
    expect(crossDetail.status).toBe(404)
    expect(missingDetail.status).toBe(404)
    expect(await crossDetail.clone().json()).toEqual(await missingDetail.clone().json())
    expect(crossStatus.status).toBe(404)

    const managerDetail = await handlers.detailGET(
      request(`/api/reports/${IDS.citizenOneReport}`, { userId: IDS.manager }),
      context(IDS.citizenOneReport),
    )
    const managerStatus = await handlers.statusGET(
      request(`/api/report-status/${IDS.assignedReport}`, { userId: IDS.manager }),
      context(IDS.assignedReport),
    )
    expect(managerDetail.status).toBe(200)
    expect(managerStatus.status).toBe(200)
    const status = (await managerStatus.json()) as {
      status: string
      timeline: Array<{ text: string }>
      workOrders: Array<{ id: string }>
    }
    expect(status.status).toBe("in-progress")
    expect(status.timeline.map((entry) => entry.text)).toEqual(["Report submitted", "Crew dispatched"])
    expect(status.workOrders).toEqual([expect.objectContaining({ id: IDS.workOrder })])
  })

  it("allows assigned Crew and hides the report from unassigned Crew", async () => {
    const assignedDetail = await handlers.detailGET(
      request(`/api/reports/${IDS.assignedReport}`, { userId: IDS.crew }),
      context(IDS.assignedReport),
    )
    const assignedStatus = await handlers.statusGET(
      request(`/api/report-status/${IDS.assignedReport}`, { userId: IDS.crew }),
      context(IDS.assignedReport),
    )
    const unassignedDetail = await handlers.detailGET(
      request(`/api/reports/${IDS.assignedReport}`, { userId: IDS.unassignedCrew }),
      context(IDS.assignedReport),
    )
    const unassignedStatus = await handlers.statusGET(
      request(`/api/report-status/${IDS.assignedReport}`, { userId: IDS.unassignedCrew }),
      context(IDS.assignedReport),
    )

    expect(assignedDetail.status).toBe(200)
    expect(assignedStatus.status).toBe(200)
    const status = (await assignedStatus.json()) as { workOrders: Array<{ id: string }> }
    expect(status.workOrders).toEqual([expect.objectContaining({ id: IDS.workOrder })])
    expect(unassignedDetail.status).toBe(404)
    expect(unassignedStatus.status).toBe(404)
  })

  it("persists one idempotent Citizen vote and returns baseline plus vote records", async () => {
    const first = await handlers.votePOST(
      request(`/api/reports/${IDS.voteReport}/vote`, { method: "POST", userId: IDS.citizenOne }),
      context(IDS.voteReport),
    )
    const duplicate = await handlers.votePOST(
      request(`/api/reports/${IDS.voteReport}/vote`, { method: "POST", userId: IDS.citizenOne }),
      context(IDS.voteReport),
    )
    expect(first.status).toBe(200)
    expect(duplicate.status).toBe(200)
    await expect(first.json()).resolves.toEqual({ reportId: IDS.voteReport, voted: true, votes: 3 })
    await expect(duplicate.json()).resolves.toEqual({ reportId: IDS.voteReport, voted: true, votes: 3 })
    expect(await database.vote.count({ where: { reportId: IDS.voteReport, userId: IDS.citizenOne } })).toBe(1)
  })

  it("keeps concurrent duplicate vote attempts idempotent", async () => {
    const vote = () => handlers.votePOST(
      request(`/api/reports/${IDS.concurrentVoteReport}/vote`, { method: "POST", userId: IDS.citizenOne }),
      context(IDS.concurrentVoteReport),
    )
    const responses = await Promise.all([vote(), vote()])
    expect(responses.map((response) => response.status)).toEqual([200, 200])
    const bodies = await Promise.all(responses.map((response) => response.json()))
    expect(bodies).toEqual([
      { reportId: IDS.concurrentVoteReport, voted: true, votes: 1 },
      { reportId: IDS.concurrentVoteReport, voted: true, votes: 1 },
    ])
    expect(await database.vote.count({ where: { reportId: IDS.concurrentVoteReport } })).toBe(1)
  })

  it("rejects forged votes and non-Citizen votes without side effects", async () => {
    const before = await municipalCounts()
    const forged = await handlers.votePOST(
      request(`/api/reports/${IDS.citizenOneReport}/vote`, {
        method: "POST",
        userId: IDS.citizenTwo,
        body: { userId: IDS.manager, votes: 100 },
      }),
      context(IDS.citizenOneReport),
    )
    const staff = await handlers.votePOST(
      request(`/api/reports/${IDS.citizenOneReport}/vote`, { method: "POST", userId: IDS.manager }),
      context(IDS.citizenOneReport),
    )
    expect(forged.status).toBe(400)
    expect(staff.status).toBe(403)
    expect(await municipalCounts()).toEqual(before)
  })

  it("returns real database status and no generated fallback for missing reports", async () => {
    const existing = await handlers.statusGET(
      request(`/api/report-status/${IDS.assignedReport}`, { userId: IDS.citizenOne }),
      context(IDS.assignedReport),
    )
    const missing = await handlers.statusGET(
      request(`/api/report-status/${PREFIX}does-not-exist`, { userId: IDS.manager }),
      context(`${PREFIX}does-not-exist`),
    )

    expect(existing.status).toBe(200)
    await expect(existing.json()).resolves.toMatchObject({
      id: IDS.assignedReport,
      type: "Assigned report",
      status: "in-progress",
      currentStatus: 2,
      location: { lat: 21.53, lng: 39.13 },
    })
    expect(missing.status).toBe(404)
    await expect(missing.json()).resolves.toEqual({ error: "Report not found" })
  })
})
