import type { MapReport, ReportStatus } from "@/types/domain"

export interface ManagerDashboardMapSource {
  id: string
  title: string
  description: string
  status: ReportStatus
  location: { lat: number; lng: number }
  votes: number
}

export type ManagerDashboardMapReport = MapReport & { status: ReportStatus }

export function toManagerDashboardMapReports(
  reports: readonly ManagerDashboardMapSource[],
): ManagerDashboardMapReport[] {
  return reports.map(({ id, title, description, status, location, votes }) => ({
    id,
    title,
    description,
    status,
    location,
    votes,
  }))
}
