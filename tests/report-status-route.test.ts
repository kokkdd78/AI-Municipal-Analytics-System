import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const authorizationState = vi.hoisted(() => ({
  result: {} as { response?: Response; user?: { id: string } },
}))

vi.mock("@/lib/auth/authorization", () => ({
  requireApiAnyRole: vi.fn(async () => authorizationState.result),
}))

import { GET } from "../app/api/report-status/[id]/route"

function callReportStatus() {
  return GET(new NextRequest("https://municipal.example.test/api/report-status/report-1"), {
    params: Promise.resolve({ id: "report-1" }),
  })
}

describe("authenticated report-status API", () => {
  beforeEach(() => {
    authorizationState.result = { user: { id: "active-user" } }
  })

  it.each([
    [401, { error: "Authentication required" }],
    [403, { error: "Access denied" }],
  ])("returns JSON %s before reading municipal data", async (status, body) => {
    authorizationState.result = { response: Response.json(body, { status }) }

    const response = await callReportStatus()

    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual(body)
  })

  it("preserves the existing authorized mock response", async () => {
    const response = await callReportStatus()
    const body = (await response.json()) as { id: string; location: unknown; timeline: unknown[] }

    expect(response.status).toBe(200)
    expect(body.id).toBe("report-1")
    expect(body.location).toBeDefined()
    expect(body.timeline.length).toBeGreaterThanOrEqual(2)
  })
})
