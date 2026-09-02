import type { ReportStatus } from "../../types/domain"

export interface DashboardSemanticColor {
  chartFill: string
  cardClass: string
  labelClass: string
  valueClass: string
  badgeClass: string
}

export const GENERAL_DASHBOARD_COLOR: DashboardSemanticColor = {
  chartFill: "#2563EB",
  cardClass: "border-blue-200 bg-blue-50",
  labelClass: "text-blue-700",
  valueClass: "text-blue-950",
  badgeClass: "border-blue-200 bg-blue-100 text-blue-800",
}

export const REPORT_STATUS_COLORS = {
  pending: {
    chartFill: "#F59E0B",
    cardClass: "border-amber-200 bg-amber-50",
    labelClass: "text-amber-700",
    valueClass: "text-amber-950",
    badgeClass: "border-amber-200 bg-amber-100 text-amber-800",
  },
  "in-progress": {
    chartFill: "#F97316",
    cardClass: "border-orange-200 bg-orange-50",
    labelClass: "text-orange-700",
    valueClass: "text-orange-950",
    badgeClass: "border-orange-200 bg-orange-100 text-orange-800",
  },
  resolved: {
    chartFill: "#22C55E",
    cardClass: "border-green-200 bg-green-50",
    labelClass: "text-green-700",
    valueClass: "text-green-950",
    badgeClass: "border-green-200 bg-green-100 text-green-800",
  },
} satisfies Record<ReportStatus, DashboardSemanticColor>

const KPI_STATUS_COLORS: Record<string, DashboardSemanticColor> = {
  pending: REPORT_STATUS_COLORS.pending,
  inProgress: REPORT_STATUS_COLORS["in-progress"],
  resolved: REPORT_STATUS_COLORS.resolved,
  activeWorkOrders: REPORT_STATUS_COLORS["in-progress"],
  completedWorkOrders: REPORT_STATUS_COLORS.resolved,
}

const KPI_LABELS: Record<string, string> = {
  totalReports: "Total Reports",
  pending: "Pending",
  inProgress: "In Progress",
  resolved: "Resolved",
  activeWorkOrders: "Active Work Orders",
  completedWorkOrders: "Completed Work Orders",
}

export const CATEGORY_CHART_FILL = GENERAL_DASHBOARD_COLOR.chartFill

export function getReportStatusColor(status: ReportStatus): DashboardSemanticColor {
  return REPORT_STATUS_COLORS[status]
}

export function getDashboardKpiColor(name: string): DashboardSemanticColor {
  return KPI_STATUS_COLORS[name] ?? GENERAL_DASHBOARD_COLOR
}

export function getDashboardKpiLabel(name: string): string {
  return KPI_LABELS[name] ?? name
}
