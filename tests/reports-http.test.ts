import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AuthenticatedMunicipalUser } from "../lib/auth/authorization-core"
import { createReportHttpHandlers, type ReportHttpAuthorization } from "../lib/reports/http"
import type { ReportService } from "../lib/reports/service"

const TRUSTED_ORIGIN = "https://municipal.example.test"

const citizen: AuthenticatedMunicipalUser = {
  id: "citizen-1",
  name: "Citizen",
  role: "Citizen",
  isActive: true,
  avatarUrl: null,
  districtId: "al-naeem",
  departmentId: null,
}

const createdReport = {
  id: "server-report-1",
  title: "Pothole",
  description: "A pothole blocks the lane.",
  category: "pothole",
  status: "pending" as const,
  severity: "high" as const,
  location: { lat: 21.5, lng: 39.2 },
  district: { id: "al-naeem", name: "Al-Naeem" },
  createdAt: "2026-08-15T10:00:00.000Z",
  updatedAt: "2026-08-15T10:00:00.000Z",
  votes: 0,
  authorId: citizen.id,
  hasVoted: false,
  statusHistory: [],
}

function request(
  path: string,
  options: { method?: string; body?: unknown; origin?: string | null } = {},
): Request {
  const headers = new Headers()
  if (options.body !== undefined) headers.set("content-type", "application/json")
  if (options.origin !== null) headers.set("origin", options.origin ?? TRUSTED_ORIGIN)
  return new Request(`https://municipal.example.test${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
}

function context(id = "report-1") {
  return { params: Promise.resolve({ id }) }
}

describe("Phase 3A1 report HTTP boundary", () => {
  const service = {
    createReport: vi.fn(),
    listReports: vi.fn(),
    getReport: vi.fn(),
    getReportStatus: vi.fn(),
    voteForReport: vi.fn(),
  }
  const authorization: ReportHttpAuthorization = {
    requireRole: vi.fn(),
    requireAnyRole: vi.fn(),
  }
  const handlers = createReportHttpHandlers({
    authorization,
    service: service as unknown as ReportService,
    trustedOrigins: [TRUSTED_ORIGIN],
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authorization.requireRole).mockResolvedValue({ user: citizen })
    vi.mocked(authorization.requireAnyRole).mockResolvedValue({ user: citizen })
    service.createReport.mockResolvedValue(createdReport)
    service.listReports.mockResolvedValue({ scope: "mine", reports: [], nextCursor: null })
    service.getReport.mockResolvedValue(createdReport)
    service.getReportStatus.mockResolvedValue({ id: "report-1", status: "pending" })
    service.voteForReport.mockResolvedValue({ reportId: "report-1", voted: true, votes: 1 })
  })

  it("authorizes before validation and returns the authorization response unchanged", async () => {
    const denied = Response.json({ error: "Authentication required" }, { status: 401 })
    vi.mocked(authorization.requireRole).mockResolvedValueOnce({ response: denied })

    const response = await handlers.collectionPOST(request("/api/reports", { method: "POST", body: {} }))

    expect(response).toBe(denied)
    expect(service.createReport).not.toHaveBeenCalled()
  })

  it("accepts a strict Citizen report and passes only validated fields to the service", async () => {
    const body = {
      category: "pothole",
      description: "A pothole blocks the lane.",
      districtId: "al-naeem",
      location: { lat: 21.5, lng: 39.2 },
      severity: "high",
    }
    const response = await handlers.collectionPOST(request("/api/reports", { method: "POST", body }))

    expect(response.status).toBe(201)
    expect(service.createReport).toHaveBeenCalledWith(citizen, body)
    await expect(response.json()).resolves.toEqual(createdReport)
  })

  it("accepts canonical trusted scheme, hostname, and effective port forms for both mutations", async () => {
    const canonicalEquivalent = "HTTPS://MUNICIPAL.EXAMPLE.TEST:443"
    const createResponse = await handlers.collectionPOST(
      request("/api/reports", {
        method: "POST",
        origin: canonicalEquivalent,
        body: {
          category: "pothole",
          description: "A pothole blocks the lane.",
          districtId: "al-naeem",
          location: { lat: 21.5, lng: 39.2 },
        },
      }),
    )
    const voteResponse = await handlers.votePOST(
      request("/api/reports/report-1/vote", { method: "POST", origin: canonicalEquivalent }),
      context(),
    )

    expect(createResponse.status).toBe(201)
    expect(voteResponse.status).toBe(200)
    expect(service.createReport).toHaveBeenCalledOnce()
    expect(service.voteForReport).toHaveBeenCalledOnce()
  })

  it.each([
    ["same-site origin", "https://attacker.example.test"],
    ["cross-site origin", "https://evil.test"],
    ["missing Origin", null],
    ["null Origin", "null"],
    ["malformed Origin", "not-an-origin"],
    ["comma-combined origins", `${TRUSTED_ORIGIN}, https://evil.test`],
    ["duplicate origins", `${TRUSTED_ORIGIN}, ${TRUSTED_ORIGIN}`],
    ["scheme mismatch", "http://municipal.example.test"],
    ["hostname mismatch", "https://municipal.example.test.evil.test"],
    ["port mismatch", "https://municipal.example.test:444"],
  ])("rejects %s before authentication or either mutation", async (name, origin) => {
    const creation = await handlers.collectionPOST(
      request("/api/reports", {
        method: "POST",
        origin,
        body: {
          category: "pothole",
          description: "A pothole blocks the lane.",
          districtId: "al-naeem",
          location: { lat: 21.5, lng: 39.2 },
        },
      }),
    )
    const vote = await handlers.votePOST(
      request("/api/reports/report-1/vote", { method: "POST", origin }),
      context(),
    )

    expect(creation.status, name).toBe(403)
    expect(vote.status, name).toBe(403)
    await expect(creation.json()).resolves.toEqual({ error: "Access denied" })
    await expect(vote.json()).resolves.toEqual({ error: "Access denied" })
    expect(authorization.requireRole).not.toHaveBeenCalled()
    expect(service.createReport).not.toHaveBeenCalled()
    expect(service.voteForReport).not.toHaveBeenCalled()
  })

  it("leaves GET routes unaffected when Origin is absent", async () => {
    const list = await handlers.collectionGET(
      request("/api/reports?scope=mine", { origin: null }),
    )
    const detail = await handlers.detailGET(
      request("/api/reports/report-1", { origin: null }),
      context(),
    )
    const status = await handlers.statusGET(
      request("/api/report-status/report-1", { origin: null }),
      context(),
    )

    expect([list.status, detail.status, status.status]).toEqual([200, 200, 200])
  })

  it.each(["id", "authorId", "status", "votes", "createdAt", "updatedAt", "archivedAt", "attachments"])(
    "rejects forged %s without invoking a mutation",
    async (field) => {
      const response = await handlers.collectionPOST(
        request("/api/reports", {
          method: "POST",
          body: {
            category: "pothole",
            description: "A pothole blocks the lane.",
            districtId: "al-naeem",
            location: { lat: 21.5, lng: 39.2 },
            [field]: "forged",
          },
        }),
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: "Invalid request" })
      expect(service.createReport).not.toHaveBeenCalled()
    },
  )

  it.each(["_", "___", "-", "---", "_-_ -__"])(
    "rejects separator-only category %j before the database service",
    async (category) => {
      const response = await handlers.collectionPOST(
        request("/api/reports", {
          method: "POST",
          body: {
            category,
            description: "A pothole blocks the lane.",
            districtId: "al-naeem",
            location: { lat: 21.5, lng: 39.2 },
          },
        }),
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: "Invalid request" })
      expect(service.createReport).not.toHaveBeenCalled()
    },
  )

  it("rejects voter identity and totals without invoking the vote service", async () => {
    const response = await handlers.votePOST(
      request("/api/reports/report-1/vote", {
        method: "POST",
        body: { userId: "other-user", votes: 10 },
      }),
      context(),
    )

    expect(response.status).toBe(400)
    expect(service.voteForReport).not.toHaveBeenCalled()
  })

  it("keeps invalid pagination out of the service", async () => {
    const response = await handlers.collectionGET(
      request("/api/reports?scope=mine&scope=community"),
    )

    expect(response.status).toBe(400)
    expect(service.listReports).not.toHaveBeenCalled()
  })

  it("returns a neutral response for unexpected database failures", async () => {
    service.getReport.mockRejectedValueOnce(new Error("database-host-and-query-details"))

    const response = await handlers.detailGET(request("/api/reports/report-1"), context())

    expect(response.status).toBe(500)
    const rawBody = await response.text()
    expect(JSON.parse(rawBody)).toEqual({ error: "Internal server error" })
    expect(rawBody).not.toContain("database-host-and-query-details")
  })
})
