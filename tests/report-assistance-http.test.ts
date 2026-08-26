import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AuthenticatedMunicipalUser } from "../lib/auth/authorization-core"
import { MAX_ASSISTANCE_IMAGE_BYTES } from "../lib/report-assistance/contracts"
import { createReportAssistanceHttpHandlers, type ReportAssistanceAuthorization, type ReportAssistanceService } from "../lib/report-assistance/http"

const ORIGIN = "https://municipal.example.test"
const citizen: AuthenticatedMunicipalUser = { id: "citizen-1", name: "Citizen", role: "Citizen", isActive: true, avatarUrl: null, districtId: "al-naeem", departmentId: null }
const body = { description: "A pothole blocks the lane.", districtId: "al-naeem", location: { lat: 21.5, lng: 39.2 } }

function request(value: unknown, contentType = "application/json"): Request {
  return new Request("https://municipal.example.test/api/reports/assist", { method: "POST", headers: { origin: ORIGIN, "content-type": contentType }, body: JSON.stringify(value) })
}

describe("report assistance HTTP boundary", () => {
  const authorization: ReportAssistanceAuthorization = { requireRole: vi.fn() }
  const service: ReportAssistanceService = { assist: vi.fn() }
  const handlers = createReportAssistanceHttpHandlers({ authorization, service, trustedOrigins: [ORIGIN] })
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(authorization.requireRole).mockResolvedValue({ user: citizen }); vi.mocked(service.assist).mockResolvedValue({ available: false }) })

  it("requires a trusted Citizen before dispatching assistance", async () => {
    const response = await handlers.post(new Request("https://municipal.example.test/api/reports/assist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }))
    expect(response.status).toBe(403)
    expect(authorization.requireRole).not.toHaveBeenCalled()
    expect(service.assist).not.toHaveBeenCalled()
  })

  it("rejects malformed and oversized images before requesting assistance or creating reports", async () => {
    const malformed = await handlers.post(request({ ...body, image: { mimeType: "image/jpeg", dataUrl: "data:image/jpeg;base64,aGVsbG8=" } }))
    const oversized = await handlers.post(request({ ...body, image: { mimeType: "image/jpeg", dataUrl: `data:image/jpeg;base64,/9j/${"A".repeat(Math.ceil(MAX_ASSISTANCE_IMAGE_BYTES * 1.34) + 20)}` } }))
    expect([malformed.status, oversized.status]).toEqual([400, 400])
    expect(service.assist).not.toHaveBeenCalled()
  })

  it("rejects assistance without confirmed coordinates before provider dispatch", async () => {
    const response = await handlers.post(request({
      description: body.description,
      districtId: body.districtId,
    }))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "Invalid request" })
    expect(service.assist).not.toHaveBeenCalled()
  })

  it("returns assistance only and does not invoke report persistence", async () => {
    const response = await handlers.post(request(body))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ available: false })
    expect(service.assist).toHaveBeenCalledWith(citizen, body)
  })
})
