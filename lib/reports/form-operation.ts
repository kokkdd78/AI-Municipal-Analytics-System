import type { CreateReportRequest } from "./contracts"

export interface ReportFormOperationToken {
  readonly id: number
  readonly signal: AbortSignal
}

export interface ReportFormOperationGate {
  begin(): ReportFormOperationToken | null
  canClose(): boolean
  commitNavigation(token: ReportFormOperationToken): boolean
  dispose(): void
  finish(token: ReportFormOperationToken): boolean
  isCurrent(token: ReportFormOperationToken): boolean
}

export function createReportFormOperationGate(): ReportFormOperationGate {
  let current: { token: ReportFormOperationToken; controller: AbortController } | null = null
  let navigationCommitted = false
  let nextId = 1

  const isCurrent = (token: ReportFormOperationToken) =>
    current?.token.id === token.id && !token.signal.aborted

  return {
    begin() {
      if (current || navigationCommitted) return null
      const controller = new AbortController()
      const token = Object.freeze({ id: nextId++, signal: controller.signal })
      current = { token, controller }
      return token
    },
    canClose() {
      return current === null && !navigationCommitted
    },
    commitNavigation(token) {
      if (!isCurrent(token) || navigationCommitted) return false
      navigationCommitted = true
      return true
    },
    dispose() {
      current?.controller.abort()
      current = null
    },
    finish(token) {
      if (!isCurrent(token)) return false
      current = null
      return true
    },
    isCurrent,
  }
}

export function reportSuccessPath(reportId: string): string {
  return `/report-success?reportId=${encodeURIComponent(reportId)}`
}

export const MAX_REPORT_DESCRIPTION_LENGTH = 2_000
const OTHER_DESCRIPTION_PREFIX = "Other issue: "

export function reportDescriptionForSubmission(
  category: string,
  otherDescription: string,
  description: string,
): string | null {
  const normalizedDescription = description.trim()
  if (!normalizedDescription) return null
  if (category !== "other") {
    return normalizedDescription.length <= MAX_REPORT_DESCRIPTION_LENGTH
      ? normalizedDescription
      : null
  }

  const normalizedOtherDescription = otherDescription.trim()
  if (!normalizedOtherDescription) return null
  const combined = `${OTHER_DESCRIPTION_PREFIX}${normalizedOtherDescription}\n\n${normalizedDescription}`
  return combined.length <= MAX_REPORT_DESCRIPTION_LENGTH ? combined : null
}

export interface ExplicitReportLocation {
  lat: number
  lng: number
  districtId: string
  districtName: string
  source: "browser" | "map"
}

export const INITIAL_EXPLICIT_REPORT_LOCATION: ExplicitReportLocation | null = null

export function hasValidReportCoordinates(
  location: Pick<ExplicitReportLocation, "lat" | "lng"> | null,
): location is Pick<ExplicitReportLocation, "lat" | "lng"> {
  return Boolean(
    location
    && Number.isFinite(location.lat)
    && location.lat >= -90
    && location.lat <= 90
    && Number.isFinite(location.lng)
    && location.lng >= -180
    && location.lng <= 180,
  )
}

export function reportRequestForExplicitLocation(
  category: string,
  description: string,
  location: ExplicitReportLocation | null,
): CreateReportRequest | null {
  const normalizedCategory = category.trim()
  const normalizedDescription = description.trim()
  if (
    !normalizedCategory
    || !normalizedDescription
    || !location
    || !hasValidReportCoordinates(location)
    || !location.districtId.trim()
  ) {
    return null
  }

  return {
    category: normalizedCategory,
    description: normalizedDescription,
    districtId: location.districtId,
    location: { lat: location.lat, lng: location.lng },
  }
}

interface BrowserGeolocation {
  getCurrentPosition(
    success: (position: GeolocationPosition) => void,
    error?: (error: GeolocationPositionError) => void,
    options?: PositionOptions,
  ): void
}

export function requestBrowserReportCoordinates(
  geolocation: BrowserGeolocation | null | undefined,
): Promise<{ lat: number; lng: number }> {
  if (!geolocation) return Promise.reject(new Error("Location unavailable"))

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => {
        const location = { lat: position.coords.latitude, lng: position.coords.longitude }
        if (!hasValidReportCoordinates(location)) {
          reject(new Error("Location unavailable"))
          return
        }
        resolve(location)
      },
      () => reject(new Error("Location unavailable")),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    )
  })
}
