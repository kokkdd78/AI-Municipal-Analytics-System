import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

const statusGET = vi.hoisted(() => vi.fn())

vi.mock("@/lib/reports/server", () => ({
  reportHttpHandlers: { statusGET },
}))

import { GET } from "../app/api/report-status/[id]/route"

function callReportStatus() {
  return GET(new NextRequest("https://municipal.example.test/api/report-status/report-1"), {
    params: Promise.resolve({ id: "report-1" }),
  })
}

describe("authenticated report-status API", () => {
  it("delegates status lookup to the database-backed report handler", async () => {
    const expected = Response.json({ id: "report-1", status: "pending", history: [] })
    statusGET.mockResolvedValueOnce(expected)
    const response = await callReportStatus()

    expect(response).toBe(expected)
    expect(statusGET).toHaveBeenCalledOnce()
    expect(statusGET.mock.calls[0]?.[1]).toEqual({ params: expect.any(Promise) })
  })
})
