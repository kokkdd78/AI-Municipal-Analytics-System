import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createReport,
  getReportDetail,
  getReportStatus,
  listAllReports,
  listReportPage,
  ReportClientError,
  voteForReport,
} from "../lib/reports/client"

const communityReport = {
  id: "report-1",
  title: "Pothole",
  description: "A pothole blocks the lane.",
  category: "pothole",
  status: "pending",
  severity: "high",
  location: { lat: 21.5, lng: 39.2 },
  district: { id: "al-naeem", name: "Al-Naeem" },
  createdAt: "2026-08-15T10:00:00.000Z",
  updatedAt: "2026-08-15T10:00:00.000Z",
  votes: 2,
  hasVoted: false,
  attachments: [],
} as const

const ownedReport = { ...communityReport, authorId: "citizen-1" }
const detailReport = {
  ...communityReport,
  authorId: "citizen-1",
  statusHistory: [
    {
      id: "history-1",
      fromStatus: null,
      toStatus: "pending",
      note: "Report submitted",
      createdAt: "2026-08-15T10:00:00.000Z",
    },
  ],
} as const

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

async function expectKind(promise: Promise<unknown>, kind: ReportClientError["kind"], status: number | null) {
  await expect(promise).rejects.toMatchObject({ name: "ReportClientError", kind, status })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Phase 3A2 typed report client", () => {
  it("parses report responses and uses same-origin credentials without forging Origin", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ scope: "community", reports: [communityReport], nextCursor: null }))
      .mockResolvedValueOnce(json(detailReport, 201))
      .mockResolvedValueOnce(json(detailReport))
      .mockResolvedValueOnce(json({ reportId: "report-1", voted: true, votes: 3 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(listReportPage("community")).resolves.toEqual({
      scope: "community",
      reports: [communityReport],
      nextCursor: null,
    })
    await expect(createReport({
      category: "pothole",
      description: "A pothole blocks the lane.",
      districtId: "al-naeem",
      location: { lat: 21.5, lng: 39.2 },
    })).resolves.toEqual(detailReport)
    await expect(getReportDetail("report-1")).resolves.toEqual(detailReport)
    await expect(voteForReport("report-1")).resolves.toEqual({ reportId: "report-1", voted: true, votes: 3 })

    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.credentials).toBe("same-origin")
      expect(new Headers(init?.headers).has("origin")).toBe(false)
      expect(init?.cache).toBe("no-store")
    }
  })

  it.each([
    [400, "validation"],
    [401, "authentication"],
    [403, "forbidden"],
    [404, "not-found"],
    [409, "conflict"],
    [429, "rate-limit"],
    [500, "server"],
  ] as const)("maps HTTP %s to a safe %s failure", async (status, kind) => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(json({ private: "ignored" }, status)))
    await expectKind(getReportDetail("report-1"), kind, status)
  })

  it("maps network failures without exposing the original error", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("private network detail")))
    try {
      await getReportDetail("report-1")
      throw new Error("Expected the request to fail")
    } catch (error) {
      expect(error).toMatchObject({ kind: "network", status: null })
      expect(String(error)).not.toContain("private network detail")
    }
  })

  it("rejects malformed JSON and structurally unexpected success bodies", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(json({ ...detailReport, votes: "two" }))
    vi.stubGlobal("fetch", fetchMock)

    await expectKind(getReportDetail("report-1"), "malformed-response", 200)
    await expectKind(getReportDetail("report-1"), "malformed-response", 200)
  })

  it("honors AbortSignal and classifies aborted work separately", async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const request = getReportDetail("report-1", { signal: controller.signal })
    controller.abort()
    await expectKind(request, "aborted", null)
  })

  it("loads every cursor page and removes duplicate report IDs without truncation", async () => {
    const second = { ...communityReport, id: "report-2", title: "Lighting" }
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ scope: "community", reports: [communityReport], nextCursor: "report-1" }))
      .mockResolvedValueOnce(json({ scope: "community", reports: [communityReport, second], nextCursor: null }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(listAllReports("community")).resolves.toEqual([communityReport, second])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("cursor=report-1")
  })

  it("fails safely when pagination repeats a cursor instead of looping", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ scope: "mine", reports: [ownedReport], nextCursor: "report-1" }))
      .mockResolvedValueOnce(json({ scope: "mine", reports: [], nextCursor: "report-1" })))

    await expectKind(listAllReports("mine"), "malformed-response", 200)
  })

  it("validates real status history responses before returning them", async () => {
    const status = {
      id: "report-1",
      type: "Pothole",
      title: "Pothole",
      category: "pothole",
      status: "pending",
      createdAt: "2026-08-15T10:00:00.000Z",
      district: "Al-Naeem",
      severity: "High",
      location: { lat: 21.5, lng: 39.2 },
      currentStatus: 0,
      timeline: [{ time: "2026-08-15T10:00:00.000Z", text: "Report submitted" }],
      history: detailReport.statusHistory,
      workOrders: [],
      attachments: [],
    }
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(json(status)))
    await expect(getReportStatus("report-1")).resolves.toEqual(status)
  })
})
