import "dotenv/config"

import { randomBytes } from "node:crypto"

import { PrismaNeon } from "@prisma/adapter-neon"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { PrismaClient, UserRole } from "../generated/prisma/client"
import type { ApiAuthorizationResult, AuthenticatedMunicipalUser } from "../lib/auth/authorization-core"
import { deriveExistingUserAuthEmail } from "../lib/auth/identifiers"
import { requireSafeTestDatabaseUrl } from "../lib/db/test-database-url"
import { createReportImageHttpHandlers } from "../lib/report-images/http"
import { createPrismaReportImageRepository } from "../lib/report-images/repository"
import { createReportImageService } from "../lib/report-images/service"
import type { ReportImageStorage } from "../lib/report-images/storage"
import { createReportHttpHandlers, type ReportHttpAuthorization } from "../lib/reports/http"
import { createPrismaReportRepository } from "../lib/reports/repository"
import { createReportService } from "../lib/reports/service"
import { createSuggestionHttpHandlers } from "../lib/suggestions/http"
import { createPrismaSuggestionRepository } from "../lib/suggestions/repository"
import { createSuggestionService } from "../lib/suggestions/service"

const RUN_ID = randomBytes(6).toString("hex")
const PREFIX = `phase3b-${RUN_ID}-`
const ORIGIN = "https://municipal.example.test"
const IDS = {
  district: `${PREFIX}district`,
  citizenOne: `${PREFIX}citizen-one`,
  citizenTwo: `${PREFIX}citizen-two`,
  manager: `${PREFIX}manager`,
  report: `${PREFIX}report`,
}

let database: PrismaClient
let reportImageHandlers: ReturnType<typeof createReportImageHttpHandlers>
let reportHandlers: ReturnType<typeof createReportHttpHandlers>
let suggestionHandlers: ReturnType<typeof createSuggestionHttpHandlers>
let generated = 0
const uploadedPublicIds: string[] = []
const removedPublicIds: string[] = []

function nextId(): string {
  generated += 1
  return `${PREFIX}generated-${generated}`
}

async function liveUser(headers: Headers): Promise<AuthenticatedMunicipalUser | null> {
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
  return user?.isActive ? { ...user, isActive: true } : null
}

function denied(status: 401 | 403): ApiAuthorizationResult {
  return {
    response: Response.json(
      { error: status === 401 ? "Authentication required" : "Access denied" },
      { status },
    ),
  }
}

const authorization: ReportHttpAuthorization = {
  async requireRole(role, headers) {
    const user = await liveUser(headers)
    if (!user) return denied(401)
    return user.role === role ? { user } : denied(403)
  },
  async requireAnyRole(roles, headers) {
    const user = await liveUser(headers)
    if (!user) return denied(401)
    return roles.includes(user.role) ? { user } : denied(403)
  },
}

function jsonRequest(path: string, userId: string | undefined, method = "GET", body?: unknown, origin = ORIGIN) {
  const headers = new Headers()
  if (userId) headers.set("x-test-user-id", userId)
  if (method === "POST") headers.set("origin", origin)
  if (body !== undefined) headers.set("content-type", "application/json")
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

function imageRequest(userId?: string, file = new File([pngBytes], "street.png", { type: "image/png" }), origin = ORIGIN) {
  const form = new FormData()
  form.set("image", file)
  const headers = new Headers({ origin })
  if (userId) headers.set("x-test-user-id", userId)
  return new Request(`${ORIGIN}/api/reports/${IDS.report}/image`, { method: "POST", headers, body: form })
}

async function cleanup(): Promise<void> {
  requireSafeTestDatabaseUrl()
  if (!database) return
  await database.suggestion.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await database.report.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await database.user.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await database.district.deleteMany({ where: { id: { startsWith: PREFIX } } })
}

describe("Phase 3B guarded database integration", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    const testConnectionString = requireSafeTestDatabaseUrl()
    database = new PrismaClient({ adapter: new PrismaNeon({ connectionString: testConnectionString }) })
    await cleanup()
    await database.district.create({
      data: { id: IDS.district, name: `Phase 3B ${RUN_ID}`, arabicName: "حي اختبار المرحلة الثالثة" },
    })
    await database.user.createMany({ data: [
      { id: IDS.citizenOne, name: "Citizen One", authEmail: deriveExistingUserAuthEmail(IDS.citizenOne), role: UserRole.Citizen, districtId: IDS.district },
      { id: IDS.citizenTwo, name: "Citizen Two", authEmail: deriveExistingUserAuthEmail(IDS.citizenTwo), role: UserRole.Citizen, districtId: IDS.district },
      { id: IDS.manager, name: "Manager", authEmail: deriveExistingUserAuthEmail(IDS.manager), role: UserRole.Manager },
    ] })
    await database.report.create({
      data: {
        id: IDS.report,
        authorId: IDS.citizenOne,
        districtId: IDS.district,
        title: "Report with image",
        description: "A report image integration fixture.",
        category: "pothole",
        latitude: 21.55,
        longitude: 39.18,
      },
    })

    const fakeStorage: ReportImageStorage = {
      async upload({ publicId }) {
        uploadedPublicIds.push(publicId)
        return {
          publicId: `smart-municipal-assistant/reports/${IDS.report}/${publicId}`,
          secureUrl: `https://res.cloudinary.com/demo/image/upload/${publicId}.png`,
        }
      },
      async remove(publicId) {
        removedPublicIds.push(publicId)
      },
    }
    reportImageHandlers = createReportImageHttpHandlers({
      authorization,
      service: createReportImageService(createPrismaReportImageRepository(database), fakeStorage, nextId),
      trustedOrigins: [ORIGIN],
    })
    reportHandlers = createReportHttpHandlers({
      authorization,
      service: createReportService(createPrismaReportRepository(database), nextId),
      trustedOrigins: [ORIGIN],
    })
    suggestionHandlers = createSuggestionHttpHandlers({
      authorization,
      service: createSuggestionService(createPrismaSuggestionRepository(database), nextId),
      trustedOrigins: [ORIGIN],
    })
  })

  afterAll(async () => {
    await cleanup()
    await database?.$disconnect()
  })

  it("rejects unauthenticated, wrong-owner, invalid, oversized, and untrusted image uploads", async () => {
    const before = await database.attachment.count({ where: { reportId: IDS.report } })
    const anonymous = await reportImageHandlers.uploadPOST(imageRequest(), { params: Promise.resolve({ id: IDS.report }) })
    const wrongOwner = await reportImageHandlers.uploadPOST(imageRequest(IDS.citizenTwo), { params: Promise.resolve({ id: IDS.report }) })
    const invalid = await reportImageHandlers.uploadPOST(
      imageRequest(IDS.citizenOne, new File(["plain text"], "fake.png", { type: "image/png" })),
      { params: Promise.resolve({ id: IDS.report }) },
    )
    const oversized = await reportImageHandlers.uploadPOST(
      imageRequest(IDS.citizenOne, new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })),
      { params: Promise.resolve({ id: IDS.report }) },
    )
    const untrusted = await reportImageHandlers.uploadPOST(
      imageRequest(IDS.citizenOne, undefined, "https://evil.test"),
      { params: Promise.resolve({ id: IDS.report }) },
    )
    expect([anonymous.status, wrongOwner.status, invalid.status, oversized.status, untrusted.status])
      .toEqual([401, 404, 400, 413, 403])
    expect(await database.attachment.count({ where: { reportId: IDS.report } })).toBe(before)
    expect(uploadedPublicIds).toHaveLength(0)
  })

  it("uploads one image, stores its attachment, and returns it on report refresh", async () => {
    const uploaded = await reportImageHandlers.uploadPOST(
      imageRequest(IDS.citizenOne),
      { params: Promise.resolve({ id: IDS.report }) },
    )
    expect(uploaded.status).toBe(201)
    const attachment = await uploaded.json() as { id: string; url: string; kind: string }
    expect(attachment).toMatchObject({ kind: "report-photo" })
    expect(attachment.url).toMatch(/^https:\/\//)
    expect(await database.attachment.count({ where: { reportId: IDS.report } })).toBe(1)

    const detail = await reportHandlers.detailGET(
      jsonRequest(`/api/reports/${IDS.report}`, IDS.citizenOne),
      { params: Promise.resolve({ id: IDS.report }) },
    )
    expect(detail.status).toBe(200)
    await expect(detail.json()).resolves.toMatchObject({
      id: IDS.report,
      attachments: [{ id: attachment.id, url: attachment.url, kind: "report-photo" }],
    })

    const duplicate = await reportImageHandlers.uploadPOST(
      imageRequest(IDS.citizenOne),
      { params: Promise.resolve({ id: IDS.report }) },
    )
    expect(duplicate.status).toBe(409)
    expect(await database.attachment.count({ where: { reportId: IDS.report } })).toBe(1)
    expect(removedPublicIds).toHaveLength(1)
  })

  it("persists suggestions across reads and keeps voting personalized and idempotent", async () => {
    const createBody = {
      title: "Shade Structure",
      category: "shade",
      description: "Add shade beside the community walkway.",
      districtId: IDS.district,
      location: { lat: 21.56, lng: 39.19 },
    }
    const rejected = await suggestionHandlers.collectionPOST(
      jsonRequest("/api/suggestions", IDS.citizenOne, "POST", createBody, "https://evil.test"),
    )
    expect(rejected.status).toBe(403)
    expect(await database.suggestion.count({ where: { id: { startsWith: PREFIX } } })).toBe(0)

    const created = await suggestionHandlers.collectionPOST(
      jsonRequest("/api/suggestions", IDS.citizenOne, "POST", createBody),
    )
    expect(created.status).toBe(201)
    const createdDto = await created.json() as { id: string; hasVoted: boolean }
    expect(createdDto.hasVoted).toBe(false)

    const firstRefresh = await suggestionHandlers.collectionGET(jsonRequest("/api/suggestions", IDS.citizenOne))
    const refreshed = await firstRefresh.json() as { suggestions: Array<{ id: string; hasVoted: boolean; votes: number }> }
    expect(refreshed.suggestions.find((item) => item.id === createdDto.id)).toMatchObject({ votes: 0, hasVoted: false })

    const vote = () => suggestionHandlers.votePOST(
      jsonRequest(`/api/suggestions/${createdDto.id}/vote`, IDS.citizenOne, "POST", {}),
      { params: Promise.resolve({ id: createdDto.id }) },
    )
    const [firstVote, duplicateVote] = await Promise.all([vote(), vote()])
    expect([firstVote.status, duplicateVote.status]).toEqual([200, 200])
    expect(await database.suggestionVote.count({ where: { suggestionId: createdDto.id } })).toBe(1)

    const ownerList = await suggestionHandlers.collectionGET(jsonRequest("/api/suggestions", IDS.citizenOne))
    const otherList = await suggestionHandlers.collectionGET(jsonRequest("/api/suggestions", IDS.citizenTwo))
    const ownerBody = await ownerList.json() as { suggestions: Array<{ id: string; hasVoted: boolean; votes: number }> }
    const otherBody = await otherList.json() as { suggestions: Array<{ id: string; hasVoted: boolean; votes: number }> }
    expect(ownerBody.suggestions.find((item) => item.id === createdDto.id)).toMatchObject({ votes: 1, hasVoted: true })
    expect(otherBody.suggestions.find((item) => item.id === createdDto.id)).toMatchObject({ votes: 1, hasVoted: false })
  })
})
