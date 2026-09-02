import type { MapReport, ReportStatus } from "@/types/domain"

export interface ManagerDashboardMapSource {
  id: string
  title: string
  description: string
  status: ReportStatus
  district: { id: string; name: string }
  location: { lat: number; lng: number }
  votes: number
}

export type ManagerDashboardMapReport = MapReport & { status: ReportStatus }

export function toManagerDashboardMapReports(
  reports: readonly ManagerDashboardMapSource[],
): ManagerDashboardMapReport[] {
  return reports.map(({ id, title, description, status, district, location, votes }) => ({
    id,
    title,
    description,
    status,
    districtLabel: district.name,
    location,
    votes,
  }))
}
