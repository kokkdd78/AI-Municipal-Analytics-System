// @vitest-environment jsdom

import L from "leaflet"
import { createElement } from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { MapContainer, useMap } from "react-leaflet"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import MapReportMarkers from "../components/map-report-markers"
import { toManagerDashboardMapReports } from "../lib/operations/dashboard-map"
import type { MapReport, ReportStatus } from "../types/domain"

describe("Manager dashboard map report status", () => {
  const roots: ReturnType<typeof createRoot>[] = []
  let leafletMap: L.Map | null = null

  function CaptureLeafletMap() {
    leafletMap = useMap()
    return null
  }

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
    leafletMap = null
    document.body.replaceChildren()
  })

  function reports(status: ReportStatus) {
    return toManagerDashboardMapReports([
      {
        id: "274e2bd6-5380-4849-a3bf-49e1d4ca5d21",
        title: "Pothole",
        description: "Road surface needs attention",
        status,
        district: { id: "al-andalus", name: "Al-Andalus" },
        location: { lat: 21.5, lng: 39.2 },
        votes: 4,
      },
    ])
  }

  function mapWithReports(mapReports: MapReport[]) {
    return createElement(
      MapContainer,
      { center: [21.5, 39.2], zoom: 13 },
      createElement(CaptureLeafletMap),
      createElement(MapReportMarkers, {
        reports: mapReports,
        markerIcon: () => L.divIcon({ className: "test-report-marker" }),
        pendingReports: new Set<string>(),
        showReportStatus: true,
        votedReports: new Set<string>(),
      }),
    )
  }

  function map(status: ReportStatus) {
    return mapWithReports(reports(status))
  }

  async function openPopup(container: HTMLElement) {
    const marker = container.querySelector<HTMLElement>(".test-report-marker")
    expect(marker).not.toBeNull()
    await act(async () => marker?.dispatchEvent(new MouseEvent("click", { bubbles: true })))
  }

  function reportMarkerLayers(): L.Marker[] {
    const markers: L.Marker[] = []
    leafletMap?.eachLayer((layer) => {
      if (layer instanceof L.Marker) markers.push(layer)
    })
    return markers
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
    const [pendingMarker] = reportMarkerLayers()
    expect(pendingMarker).toBeDefined()
    expect(reportMarkerLayers()).toHaveLength(1)
    await openPopup(container)
    expect(container.textContent).toContain("Status: Pending")

    await act(async () => root.render(map("resolved")))
    const [resolvedMarker] = reportMarkerLayers()
    expect(reportMarkerLayers()).toHaveLength(1)
    expect(resolvedMarker).not.toBe(pendingMarker)
    expect(leafletMap?.hasLayer(pendingMarker)).toBe(false)
    await openPopup(container)
    expect(container.textContent).toContain("Status: Resolved")
    expect(container.textContent).not.toContain("Status: Pending")
  })

  it("uses one unambiguous popup for reports at the same physical location", async () => {
    const container = document.createElement("div")
    Object.defineProperties(container, {
      clientHeight: { value: 500 },
      clientWidth: { value: 500 },
    })
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)

    const coincidentReports = toManagerDashboardMapReports([
      {
        id: "63e44ed5-6d96-4b07-a3cc-a455e34d3438",
        title: "Pothole",
        description: "Pending report at the same map point",
        status: "pending",
        district: { id: "al-salehiyah", name: "Al-Salehiyah" },
        location: { lat: 21.5433, lng: 39.1728 },
        votes: 0,
      },
      {
        id: "274e2bd6-5380-4849-a3bf-49e1d4ca5d21",
        title: "Pothole",
        description: "Resolved Al-Andalus report",
        status: "resolved",
        district: { id: "al-andalus", name: "Al-Andalus" },
        location: { lat: 21.5433, lng: 39.1728 },
        votes: 0,
      },
    ])

    await act(async () => root.render(mapWithReports(coincidentReports)))
    expect(reportMarkerLayers()).toHaveLength(1)
    await openPopup(container)
    expect(container.textContent).toContain("Pending report at the same map point")
    expect(container.textContent).toContain("Status: Pending")
    expect(container.textContent).toContain("Resolved Al-Andalus report")
    expect(container.textContent).toContain("Al-Andalus")
    expect(container.textContent).toContain("Status: Resolved")
  })
})
