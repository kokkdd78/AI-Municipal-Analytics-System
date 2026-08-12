import type { District } from "@/constants/districts"

export const USER_ROLES = ["Citizen", "Manager", "Crew"] as const
export type UserRole = (typeof USER_ROLES)[number]

export const REPORT_STATUSES = ["pending", "in-progress", "resolved"] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

export const REPORT_SEVERITIES = ["low", "medium", "high"] as const
export type ReportSeverity = (typeof REPORT_SEVERITIES)[number]

export interface Coordinates {
  lat: number
  lng: number
}

export interface Attachment {
  id: string
  name: string
  mimeType: string
  url: string
  kind: "report-photo" | "completion-evidence" | "avatar"
}

export interface MunicipalUser {
  id: string
  name: string
  phone?: string
  district: string
  avatar: string
  role: UserRole | null
}

export interface Report {
  id: string
  title: string
  description: string
  category: string
  status: ReportStatus
  severity?: ReportSeverity
  location: Coordinates
  district: string
  createdAt: string
  votes: number
  authorId?: string
  attachments: Attachment[]
}

export interface Suggestion {
  id: string
  title: string
  category: string
  location: Coordinates
  description: string
  district: District
  createdAt: string
  votes: number
}

export interface MapReport {
  id: string
  title: string
  description?: string
  location: Coordinates
  votes: number
  attachments?: Attachment[]
}

