import { describe, expect, it } from "vitest"

import {
  CATEGORY_CHART_FILL,
  GENERAL_DASHBOARD_COLOR,
  getDashboardKpiColor,
  getDashboardKpiLabel,
  getReportStatusColor,
} from "../lib/operations/dashboard-colors"

describe("Manager dashboard semantic colors", () => {
  it("uses the approved report-status palette consistently", () => {
    expect(getReportStatusColor("pending")).toMatchObject({
      chartFill: "#F59E0B",
      cardClass: "border-amber-200 bg-amber-50",
      badgeClass: "border-amber-200 bg-amber-100 text-amber-800",
    })
    expect(getReportStatusColor("in-progress")).toMatchObject({
      chartFill: "#F97316",
      cardClass: "border-orange-200 bg-orange-50",
      badgeClass: "border-orange-200 bg-orange-100 text-orange-800",
    })
    expect(getReportStatusColor("resolved")).toMatchObject({
      chartFill: "#22C55E",
      cardClass: "border-green-200 bg-green-50",
      badgeClass: "border-green-200 bg-green-100 text-green-800",
    })
  })

  it("shares status semantics with the matching KPI cards", () => {
    expect(getDashboardKpiColor("pending")).toBe(getReportStatusColor("pending"))
    expect(getDashboardKpiColor("inProgress")).toBe(getReportStatusColor("in-progress"))
    expect(getDashboardKpiColor("resolved")).toBe(getReportStatusColor("resolved"))
    expect(getDashboardKpiColor("activeWorkOrders")).toBe(getReportStatusColor("in-progress"))
    expect(getDashboardKpiColor("completedWorkOrders")).toBe(getReportStatusColor("resolved"))
  })

  it("keeps total reports and categories neutral blue", () => {
    expect(getDashboardKpiColor("totalReports")).toBe(GENERAL_DASHBOARD_COLOR)
    expect(CATEGORY_CHART_FILL).toBe("#2563EB")
    expect(CATEGORY_CHART_FILL).not.toBe(getReportStatusColor("pending").chartFill)
    expect(CATEGORY_CHART_FILL).not.toBe(getReportStatusColor("in-progress").chartFill)
    expect(CATEGORY_CHART_FILL).not.toBe(getReportStatusColor("resolved").chartFill)
  })

  it("presents readable KPI labels without renaming canonical keys", () => {
    expect([
      "totalReports",
      "pending",
      "inProgress",
      "resolved",
      "activeWorkOrders",
      "completedWorkOrders",
    ].map(getDashboardKpiLabel)).toEqual([
      "Total Reports",
      "Pending",
      "In Progress",
      "Resolved",
      "Active Work Orders",
      "Completed Work Orders",
    ])
  })
})
