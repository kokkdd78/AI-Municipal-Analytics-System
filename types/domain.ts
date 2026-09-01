import type { District } from "@/constants/districts"

export const USER_ROLES = ["Citizen", "Manager", "Crew"] as const
export type UserRole = (typeof USER_ROLES)[number]

export const REPORT_STATUSES = ["pending", "in-progress", "resolved"] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

export const REPORT_SEVERITIES = ["low", "medium", "high"] as const
export type ReportSeverity = (typeof REPORT_SEVERITIES)[number]

export const ATTACHMENT_KINDS = ["report-photo", "completion-evidence", "avatar"] as const
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number]

export const SUGGESTION_STATUSES = ["Under Review", "Approved", "Rejected"] as const
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number]

export const WORK_ORDER_STATUSES = ["pending", "active", "completed"] as const
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number]

export const WORK_ORDER_PRIORITIES = ["Low", "Medium", "High"] as const
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number]

export interface Coordinates {
  lat: number
  lng: number
}

export interface Attachment {
  id: string
  name: string
  mimeType: string
  url: string
  kind: AttachmentKind
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
  status?: ReportStatus
  location: Coordinates
  votes: number
  attachments?: Attachment[]
}
