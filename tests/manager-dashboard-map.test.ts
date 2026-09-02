// @vitest-environment jsdom

import L from "leaflet"
import { createElement } from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { MapContainer } from "react-leaflet"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import MapReportMarkers from "../components/map-report-markers"
import { toManagerDashboardMapReports } from "../lib/operations/dashboard-map"
import type { ReportStatus } from "../types/domain"

describe("Manager dashboard map report status", () => {
  const roots: ReturnType<typeof createRoot>[] = []

  beforeAll(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  })

  afterAll(() => {
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  afterEach(async () => {
    await act(async () => {
      roots.splice(0).forEach((root) => root.unmount())
    })
    document.body.replaceChildren()
  })

  function reports(status: ReportStatus) {
    return toManagerDashboardMapReports([
      {
        id: "274e2bd6-5380-4849-a3bf-49e1d4ca5d21",
        title: "Pothole",
        description: "Road surface needs attention",
        status,
        location: { lat: 21.5, lng: 39.2 },
        votes: 4,
      },
    ])
  }

  function map(status: ReportStatus) {
    return createElement(
      MapContainer,
      { center: [21.5, 39.2], zoom: 13 },
      createElement(MapReportMarkers, {
        reports: reports(status),
        markerIcon: () => L.divIcon({ className: "test-report-marker" }),
        pendingReports: new Set<string>(),
        showReportStatus: true,
        votedReports: new Set<string>(),
      }),
    )
  }

  async function openPopup(container: HTMLElement) {
    const marker = container.querySelector<HTMLElement>(".test-report-marker")
    expect(marker).not.toBeNull()
    await act(async () => marker?.dispatchEvent(new MouseEvent("click", { bubbles: true })))
  }

  it("updates an existing report marker popup from Pending to Resolved", async () => {
    const container = document.createElement("div")
    Object.defineProperties(container, {
      clientHeight: { value: 500 },
      clientWidth: { value: 500 },
    })
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)

    await act(async () => root.render(map("pending")))
    await openPopup(container)
    expect(container.textContent).toContain("Status: Pending")

    await act(async () => root.render(map("resolved")))
    await openPopup(container)
    expect(container.textContent).toContain("Status: Resolved")
    expect(container.textContent).not.toContain("Status: Pending")
  })
})
