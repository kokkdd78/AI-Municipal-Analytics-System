import { describe, expect, it } from "vitest"

import { EMPTY_APP_STORAGE, type AppStorageState } from "../lib/client-storage"
import {
  AI_REPORT_UNAVAILABLE_MESSAGE,
  aiReportSubmissionError,
  applyLegacyReportVote,
  awaitCurrentReportList,
  ATTACHMENT_UPLOAD_UNAVAILABLE_MESSAGE,
  createLatestReportRequestGate,
  legacyReportTrackingView,
  mergeCompletedServerVote,
  mergeCreatedServerReport,
  manualReportAttachmentError,
  mayDisplayServerReports,
  mergeCitizenReportViews,
  ownedLegacyReportViews,
  serverReportToView,
} from "../lib/reports/client-state"
import type { Report } from "../types/domain"

const legacyReport: Report = {
  id: "report-1",
  title: "Legacy title",
  description: "Stored before database reports were enabled.",
  category: "trash",
  status: "pending",
  location: { lat: 21.5, lng: 39.2 },
  district: "Al-Naeem",
  createdAt: "2026-08-14T10:00:00.000Z",
  votes: 4,
  authorId: "citizen-1",
  attachments: [],
}

const serverReport = {
  id: "report-1",
  title: "Server title",
  description: "Authoritative database report.",
  category: "pothole",
  status: "in-progress" as const,
  severity: "high" as const,
  location: { lat: 21.6, lng: 39.3 },
  district: { id: "al-naeem", name: "Al-Naeem" },
  createdAt: "2026-08-15T10:00:00.000Z",
  updatedAt: "2026-08-15T11:00:00.000Z",
  votes: 8,
  hasVoted: true,
  attachments: [],
}

const createdReport = {
  ...serverReport,
  authorId: "citizen-1",
  statusHistory: [],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

function storageWithReports(reports: Report[]): AppStorageState {
  return { ...EMPTY_APP_STORAGE, reports }
}

describe("Phase 3A2 server and legacy report state", () => {
  it("shows legacy reports only to the exact stable-ID Citizen owner", () => {
    expect(ownedLegacyReportViews([legacyReport], [], { id: "citizen-1", role: "Citizen" })).toHaveLength(1)
    expect(ownedLegacyReportViews([legacyReport], [], { id: "citizen-2", role: "Citizen" })).toEqual([])
    expect(ownedLegacyReportViews([legacyReport], [], { id: "manager-1", role: "Manager" })).toEqual([])
    expect(ownedLegacyReportViews([legacyReport], [], { id: "crew-1", role: "Crew" })).toEqual([])
    expect(ownedLegacyReportViews([legacyReport], [], null)).toEqual([])
  })

  it("lets the server record win exact-ID deduplication", () => {
    const legacy = ownedLegacyReportViews([legacyReport], [], { id: "citizen-1", role: "Citizen" })
    const server = serverReportToView(serverReport)
    expect(mergeCitizenReportViews([server], legacy)).toEqual([server])
  })

  it("never writes or invents a local record for a server-only vote", () => {
    const state = storageWithReports([legacyReport])
    const result = applyLegacyReportVote(state, "server-only-report")
    expect(result).toBe(state)
    expect(result.reports).toEqual([legacyReport])
  })

  it("keeps legacy voting local and idempotent", () => {
    const state = storageWithReports([legacyReport])
    const voted = applyLegacyReportVote(state, legacyReport.id)
    expect(voted.reports[0]?.votes).toBe(5)
    expect(voted.votedReportIds).toEqual([legacyReport.id])
    expect(applyLegacyReportVote(voted, legacyReport.id)).toBe(voted)
  })

  it("hides previous in-memory server data immediately on Citizen switch, logout, or staff session", () => {
    expect(mayDisplayServerReports("citizen-1", { id: "citizen-1", role: "Citizen" })).toBe(true)
    expect(mayDisplayServerReports("citizen-1", { id: "citizen-2", role: "Citizen" })).toBe(false)
    expect(mayDisplayServerReports("citizen-1", null)).toBe(false)
    expect(mayDisplayServerReports("citizen-1", { id: "manager-1", role: "Manager" })).toBe(false)
  })

  it("invalidates stale loads and aborts an older request when a new refresh begins", () => {
    const gate = createLatestReportRequestGate()
    const first = gate.begin("citizen-1")
    const second = gate.begin("citizen-1")
    expect(first.signal.aborted).toBe(true)
    expect(gate.isCurrent(first, "citizen-1")).toBe(false)
    expect(gate.isCurrent(second, "citizen-1")).toBe(true)
    expect(gate.isCurrent(second, "citizen-2")).toBe(false)
    gate.invalidate()
    expect(second.signal.aborted).toBe(true)
  })

  it("does not let old community or mine lists remove a successfully created report", async () => {
    const gate = createLatestReportRequestGate()
    const oldList = deferred<[
      Array<typeof serverReport>,
      Array<typeof serverReport & { authorId: string }>,
    ]>()
    const token = gate.begin("citizen-1")
    const pending = awaitCurrentReportList(oldList.promise, gate, token, () => "citizen-1")
    gate.invalidate()

    let collections = mergeCreatedServerReport({ community: [], mine: [] }, createdReport, "citizen-1")
    oldList.resolve([[], []])
    const oldResult = await pending
    if (oldResult.current) {
      collections = { community: oldResult.value[0], mine: oldResult.value[1] }
    }

    expect(oldResult).toEqual({ current: false })
    expect(collections.community.map((report) => report.id)).toEqual([createdReport.id])
    expect(collections.mine.map((report) => report.id)).toEqual([createdReport.id])
  })

  it("does not let an old list revert a completed server vote", async () => {
    const gate = createLatestReportRequestGate()
    const staleReport = { ...serverReport, votes: 8, hasVoted: false }
    const oldList = deferred<[
      Array<typeof staleReport>,
      Array<typeof staleReport & { authorId: string }>,
    ]>()
    const token = gate.begin("citizen-1")
    const pending = awaitCurrentReportList(oldList.promise, gate, token, () => "citizen-1")
    gate.invalidate()

    let collections = mergeCompletedServerVote({
      community: [staleReport],
      mine: [{ ...staleReport, authorId: "citizen-1" }],
    }, staleReport.id, 9)
    oldList.resolve([[staleReport], [{ ...staleReport, authorId: "citizen-1" }]])
    const oldResult = await pending
    if (oldResult.current) {
      collections = { community: oldResult.value[0], mine: oldResult.value[1] }
    }

    expect(oldResult).toEqual({ current: false })
    expect(collections.community[0]).toMatchObject({ votes: 9, hasVoted: true })
    expect(collections.mine[0]).toMatchObject({ votes: 9, hasVoted: true })
  })

  it("allows a newer refresh to reconcile authoritative server state", async () => {
    const gate = createLatestReportRequestGate()
    const oldToken = gate.begin("citizen-1")
    gate.invalidate()
    const refreshed = { ...serverReport, votes: 10, hasVoted: true }
    const nextToken = gate.begin("citizen-1")

    expect(gate.isCurrent(oldToken, "citizen-1")).toBe(false)
    await expect(awaitCurrentReportList(
      Promise.resolve([[refreshed], [{ ...refreshed, authorId: "citizen-1" }]] as const),
      gate,
      nextToken,
      () => "citizen-1",
    )).resolves.toEqual({
      current: true,
      value: [[refreshed], [{ ...refreshed, authorId: "citizen-1" }]],
    })
  })

  it("rejects a late list after logout or a Citizen switch", async () => {
    const gate = createLatestReportRequestGate()
    const list = deferred<Array<typeof serverReport>>()
    const token = gate.begin("citizen-1")
    let currentUserId: string | null = "citizen-1"
    const pending = awaitCurrentReportList(list.promise, gate, token, () => currentUserId)

    currentUserId = "citizen-2"
    gate.invalidate()
    list.resolve([serverReport])
    await expect(pending).resolves.toEqual({ current: false })
    expect(mayDisplayServerReports("citizen-1", { id: "citizen-2", role: "Citizen" })).toBe(false)
    expect(mayDisplayServerReports("citizen-1", null)).toBe(false)
  })

  it("builds a visibly local tracking view without fabricated work history", () => {
    const view = legacyReportTrackingView({
      ...legacyReport,
      source: "legacy",
      hasVoted: false,
    })
    expect(view.locallyStored).toBe(true)
    expect(view.timeline).toEqual([
      { time: legacyReport.createdAt, text: "Locally stored report submitted" },
    ])
    expect(view.history).toEqual([])
    expect(view.workOrders).toEqual([])
  })

  it("provides honest attachment and AI deferral messages", () => {
    expect(ATTACHMENT_UPLOAD_UNAVAILABLE_MESSAGE).toMatch(/غير متاح/)
    expect(AI_REPORT_UNAVAILABLE_MESSAGE).toMatch(/غير متاح/)
    expect(manualReportAttachmentError("data:image/png;base64,selected")).toBe(
      ATTACHMENT_UPLOAD_UNAVAILABLE_MESSAGE,
    )
    expect(manualReportAttachmentError(null)).toBeNull()
    expect(aiReportSubmissionError()).toBe(AI_REPORT_UNAVAILABLE_MESSAGE)
  })
})
