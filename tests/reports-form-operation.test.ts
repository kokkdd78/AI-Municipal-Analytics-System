import { afterEach, describe, expect, it, vi } from "vitest"

import { createReport } from "../lib/reports/client"
import type { ReportDetailDto } from "../lib/reports/dto"
import {
  awaitCurrentReportMutation,
  forwardReportAbortSignal,
  serverReportToView,
} from "../lib/reports/client-state"
import {
  createReportFormOperationGate,
  confirmedMapReportLocation,
  INITIAL_EXPLICIT_REPORT_LOCATION,
  reportDescriptionForSubmission,
  reportRequestForExplicitLocation,
  reportSuccessPath,
  requestBrowserReportCoordinates,
  submitReportWithOptionalImage,
  type ExplicitReportLocation,
} from "../lib/reports/form-operation"

const mapLocation: ExplicitReportLocation = {
  lat: 21.612345,
  lng: 39.156789,
  districtId: "al-naeem",
  districtName: "Al-Naeem",
  source: "map",
}

const createdReport: ReportDetailDto = {
  id: "database-report-1",
  title: "Pothole",
  description: "A pothole blocks the lane.",
  category: "pothole",
  status: "pending",
  severity: null,
  location: { lat: mapLocation.lat, lng: mapLocation.lng },
  district: { id: mapLocation.districtId, name: mapLocation.districtName },
  createdAt: "2026-08-15T10:00:00.000Z",
  updatedAt: "2026-08-15T10:00:00.000Z",
  votes: 0,
  hasVoted: false,
  attachments: [],
  authorId: "citizen-1",
  statusHistory: [],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Phase 3A2 report form operation gate", () => {
  it("blocks rapid duplicate submissions synchronously and unlocks after failure", () => {
    const gate = createReportFormOperationGate()
    const first = gate.begin()
    const duplicate = gate.begin()
    expect(first).not.toBeNull()
    expect(duplicate).toBeNull()
    expect(gate.canClose()).toBe(false)
    expect(gate.finish(first!)).toBe(true)
    expect(gate.canClose()).toBe(true)
    expect(gate.begin()).not.toBeNull()
  })

  it("uses the returned database report ID and commits only one navigation", () => {
    const gate = createReportFormOperationGate()
    const operation = gate.begin()!
    const returnedDatabaseId = "database-report:123"
    let navigationCount = 0
    let destination = ""
    if (gate.commitNavigation(operation)) {
      navigationCount += 1
      destination = reportSuccessPath(returnedDatabaseId)
    }
    if (gate.commitNavigation(operation)) navigationCount += 1

    expect(destination).toBe("/report-success?reportId=database-report%3A123")
    expect(navigationCount).toBe(1)
  })

  it("prevents a disposed stale operation from navigating", () => {
    const gate = createReportFormOperationGate()
    const operation = gate.begin()!
    gate.dispose()
    expect(operation.signal.aborted).toBe(true)
    expect(gate.canClose()).toBe(true)
    expect(gate.isCurrent(operation)).toBe(false)
    expect(gate.commitNavigation(operation)).toBe(false)
  })

  it("requires one explicit confirmed location and submits its district and coordinates together", () => {
    expect(INITIAL_EXPLICIT_REPORT_LOCATION).toBeNull()
    expect(reportRequestForExplicitLocation(
      "pothole",
      "Road damage",
      INITIAL_EXPLICIT_REPORT_LOCATION,
    )).toBeNull()
    expect(reportRequestForExplicitLocation("pothole", "Road damage", mapLocation)).toEqual({
      category: "pothole",
      description: "Road damage",
      districtId: "al-naeem",
      location: { lat: 21.612345, lng: 39.156789 },
    })
    expect(reportRequestForExplicitLocation("pothole", "Road damage", {
      ...mapLocation,
      lat: Number.NaN,
    })).toBeNull()
    expect(reportRequestForExplicitLocation("pothole", "Road damage", {
      ...mapLocation,
      lng: 181,
    })).toBeNull()
  })

  it("creates a canonical map location atomically and never uses a profile district fallback", () => {
    const selected = confirmedMapReportLocation(21.612345, 39.156789, "Al-Naeem")
    expect(selected).toEqual(mapLocation)
    expect(reportRequestForExplicitLocation("pothole", "Road damage", selected)).toMatchObject({
      districtId: "al-naeem",
      location: { lat: 21.612345, lng: 39.156789 },
    })

    // A reverse-geocoding value outside the configured canonical districts is not
    // replaced by account/profile information and cannot become a report request.
    expect(confirmedMapReportLocation(21.5433, 39.1728, "Unknown Location")).toBeNull()
    expect(reportRequestForExplicitLocation("pothole", "Road damage", null)).toBeNull()
  })

  it("does not produce submission coordinates when browser geolocation is denied or invalid", async () => {
    const create = vi.fn()
    const denied = {
      getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) => failure({} as GeolocationPositionError),
    }
    const invalid = {
      getCurrentPosition: (success: PositionCallback) => success({ coords: { latitude: 91, longitude: 39 } } as GeolocationPosition),
    }

    let selectedLocation: ExplicitReportLocation | null = INITIAL_EXPLICIT_REPORT_LOCATION
    try {
      await requestBrowserReportCoordinates(denied)
    } catch {
      selectedLocation = null
    }
    const deniedRequest = reportRequestForExplicitLocation("pothole", "Road damage", selectedLocation)
    if (deniedRequest) create(deniedRequest)

    await expect(requestBrowserReportCoordinates(invalid)).rejects.toThrow("Location unavailable")
    expect(create).not.toHaveBeenCalled()
  })

  it("requires browser coordinates to be confirmed by the map instead of assigning a profile district", async () => {
    const geolocation = {
      getCurrentPosition: (success: PositionCallback) => success({
      coords: { latitude: 21.501234, longitude: 39.201234 },
      } as GeolocationPosition),
    }
    const coordinates = await requestBrowserReportCoordinates(geolocation)
    expect(coordinates).toEqual({
      lat: 21.501234,
      lng: 39.201234,
    })
    // GPS returns coordinates only. It has no district or profile input, so it
    // cannot be submitted until the map has resolved a canonical district.
    expect(reportRequestForExplicitLocation("trash", "Overflowing bin", null)).toBeNull()
    expect(confirmedMapReportLocation(coordinates.lat, coordinates.lng, "Unknown Location")).toBeNull()
  })

  it("unlocks the form gate after a real retryable request failure", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json(
      { error: "private server detail" },
      { status: 500 },
    )))
    const gate = createReportFormOperationGate()
    const operation = gate.begin()!
    const request = reportRequestForExplicitLocation("pothole", "Road damage", mapLocation)!

    await expect(createReport(request, { signal: operation.signal })).rejects.toMatchObject({ kind: "server" })
    expect(gate.finish(operation)).toBe(true)
    expect(gate.canClose()).toBe(true)
    expect(gate.begin()).not.toBeNull()
  })

  it("preserves a trimmed Other issue and the normal description in the loaded display", () => {
    const description = reportDescriptionForSubmission("other", "  Broken Bench  ", "  Seat is unsafe.  ")
    expect(description).toBe("Other issue: Broken Bench\n\nSeat is unsafe.")
    expect(reportDescriptionForSubmission("other", "   ", "Seat is unsafe.")).toBeNull()
    expect(reportDescriptionForSubmission("other", "Broken Bench", "x".repeat(2_000))).toBeNull()
    expect(serverReportToView({ ...createdReport, description: description! }).description).toBe(description)
  })

  it("aborts the actual fetch signal on dispose and ignores a response that resolves afterward", async () => {
    const response = deferred<Response>()
    let fetchSignal: AbortSignal | null = null
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      fetchSignal = init?.signal ?? null
      return response.promise
    }))

    const gate = createReportFormOperationGate()
    const operation = gate.begin()!
    const requestController = new AbortController()
    const stopForwarding = forwardReportAbortSignal(operation.signal, requestController)
    let currentUserId: string | null = "citizen-1"
    const request = reportRequestForExplicitLocation("pothole", "A pothole blocks the lane.", mapLocation)!
    const guardedCreation = awaitCurrentReportMutation(
      createReport(request, { signal: requestController.signal }),
      requestController.signal,
      "citizen-1",
      () => currentUserId,
    )

    gate.dispose()
    expect(fetchSignal).toBe(requestController.signal)
    expect(requestController.signal.aborted).toBe(true)
    response.resolve(Response.json(createdReport, { status: 201 }))
    await expect(guardedCreation).resolves.toEqual({ current: false })
    expect(gate.commitNavigation(operation)).toBe(false)
    stopForwarding()

    currentUserId = null
  })

  it("rejects a late creation after the authenticated Citizen changes", async () => {
    const response = deferred<typeof createdReport>()
    const controller = new AbortController()
    let currentUserId: string | null = "citizen-1"
    const guarded = awaitCurrentReportMutation(
      response.promise,
      controller.signal,
      "citizen-1",
      () => currentUserId,
    )
    currentUserId = "citizen-2"
    response.resolve(createdReport)
    await expect(guarded).resolves.toEqual({ current: false })
  })

  it("retries only image upload after a report was already created", async () => {
    const create = vi.fn().mockResolvedValue({ id: createdReport.id })
    const upload = vi.fn()
      .mockRejectedValueOnce(new Error("temporary image failure"))
      .mockResolvedValueOnce(undefined)
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "street.png", { type: "image/png" })
    const controller = new AbortController()
    const report = reportRequestForExplicitLocation("pothole", "Road damage", mapLocation)!

    const first = await submitReportWithOptionalImage({
      existingReportId: null,
      report,
      image: file,
      signal: controller.signal,
      createReport: (input, signal) => create(input, signal),
      uploadImage: (id, image, signal) => upload(id, image, signal),
    })
    expect(first).toEqual({ reportId: createdReport.id, image: "failed" })

    const retry = await submitReportWithOptionalImage({
      existingReportId: first.reportId,
      report,
      image: file,
      signal: controller.signal,
      createReport: (input, signal) => create(input, signal),
      uploadImage: (id, image, signal) => upload(id, image, signal),
    })
    expect(retry).toEqual({ reportId: createdReport.id, image: "uploaded" })
    expect(create).toHaveBeenCalledOnce()
    expect(upload).toHaveBeenCalledTimes(2)
  })
})
