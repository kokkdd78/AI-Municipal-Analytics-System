import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import ReportMapStatus from "../components/report-map-status"
import { toManagerDashboardMapReports } from "../lib/operations/dashboard-map"
import type { ReportStatus } from "../types/domain"

describe("Manager dashboard map report status", () => {
  it.each([
    ["pending", "Pending"],
    ["in-progress", "In Progress"],
    ["resolved", "Resolved"],
  ] satisfies [ReportStatus, string][])('preserves and displays the canonical "%s" status', (status, label) => {
    const [mapReport] = toManagerDashboardMapReports([
      {
        id: "report-1",
        title: "Pothole",
        description: "Road surface needs attention",
        status,
        location: { lat: 21.5, lng: 39.2 },
        votes: 4,
      },
    ])

    expect(mapReport.status).toBe(status)
    expect(renderToStaticMarkup(createElement(ReportMapStatus, { status: mapReport.status }))).toContain(
      `Status: <span class="font-medium text-foreground">${label}</span>`,
    )
  })
})
