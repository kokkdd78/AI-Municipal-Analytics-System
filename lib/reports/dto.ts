import type {
  ReportSeverity as DatabaseReportSeverity,
  ReportStatus as DatabaseReportStatus,
  WorkOrderPriority as DatabaseWorkOrderPriority,
  WorkOrderStatus as DatabaseWorkOrderStatus,
} from "../../generated/prisma/client"
import type {
  ReportDetailRecord,
  ReportProjectionRecord,
  WorkOrderProgressRecord,
} from "./repository"
import type {
  ReportSeverity,
  ReportStatus,
  WorkOrderPriority,
  WorkOrderStatus,
} from "../../types/domain"

export interface ReportDistrictDto {
  id: string
  name: string
}

export interface CommunityReportDto {
  id: string
  title: string
  description: string
  category: string
  status: ReportStatus
  severity: ReportSeverity | null
  location: { lat: number; lng: number }
  district: ReportDistrictDto
  createdAt: string
  updatedAt: string
  votes: number
}

export interface OwnedReportDto extends CommunityReportDto {
  authorId: string
}

export interface ReportStatusHistoryDto {
  id: string
  fromStatus: ReportStatus | null
  toStatus: ReportStatus
  note: string | null
  createdAt: string
}

export interface ReportDetailDto extends CommunityReportDto {
  authorId: string | null
  hasVoted: boolean
  statusHistory: ReportStatusHistoryDto[]
}

export interface WorkOrderProgressDto {
  id: string
  title: string
  status: WorkOrderStatus
  priority: WorkOrderPriority
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ReportStatusDto {
  id: string
  type: string
  title: string
  category: string
  status: ReportStatus
  createdAt: string
  district: string
  severity: "Low" | "Medium" | "High" | "Unclassified"
  location: { lat: number; lng: number }
  currentStatus: number
  timeline: { time: string; text: string }[]
  history: ReportStatusHistoryDto[]
  workOrders: WorkOrderProgressDto[]
}

const REPORT_STATUS: Record<DatabaseReportStatus, ReportStatus> = {
  PENDING: "pending",
  IN_PROGRESS: "in-progress",
  RESOLVED: "resolved",
}

const REPORT_SEVERITY: Record<DatabaseReportSeverity, ReportSeverity> = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
}

const WORK_ORDER_STATUS: Record<DatabaseWorkOrderStatus, WorkOrderStatus> = {
  PENDING: "pending",
  ACTIVE: "active",
  COMPLETED: "completed",
}

const WORK_ORDER_PRIORITY: Record<DatabaseWorkOrderPriority, WorkOrderPriority> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
}

export function toDomainReportStatus(status: DatabaseReportStatus): ReportStatus {
  return REPORT_STATUS[status]
}

function toDomainReportSeverity(severity: DatabaseReportSeverity | null): ReportSeverity | null {
  return severity === null ? null : REPORT_SEVERITY[severity]
}

export function toCommunityReportDto(record: ReportProjectionRecord): CommunityReportDto {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    category: record.category,
    status: toDomainReportStatus(record.status),
    severity: toDomainReportSeverity(record.severity),
    location: { lat: record.latitude, lng: record.longitude },
    district: record.district,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    votes: record.importedVoteBaseline + record.voteCount,
  }
}

export function toOwnedReportDto(record: ReportProjectionRecord): OwnedReportDto {
  if (!record.authorId) throw new Error("An owned report must have an author")
  return { ...toCommunityReportDto(record), authorId: record.authorId }
}

function toStatusHistoryDto(record: ReportDetailRecord["statusHistory"][number]): ReportStatusHistoryDto {
  return {
    id: record.id,
    fromStatus: record.fromStatus === null ? null : toDomainReportStatus(record.fromStatus),
    toStatus: toDomainReportStatus(record.toStatus),
    note: record.note,
    createdAt: record.createdAt.toISOString(),
  }
}

export function toReportDetailDto(record: ReportDetailRecord): ReportDetailDto {
  return {
    ...toCommunityReportDto(record),
    authorId: record.authorId,
    hasVoted: record.viewerHasVoted,
    statusHistory: record.statusHistory.map(toStatusHistoryDto),
  }
}

function toWorkOrderProgressDto(record: WorkOrderProgressRecord): WorkOrderProgressDto {
  return {
    id: record.id,
    title: record.title,
    status: WORK_ORDER_STATUS[record.status],
    priority: WORK_ORDER_PRIORITY[record.priority],
    startedAt: record.startedAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

function reportStatusStep(status: ReportStatus): number {
  if (status === "resolved") return 3
  if (status === "in-progress") return 2
  return 0
}

function severityLabel(severity: ReportSeverity | null): ReportStatusDto["severity"] {
  if (!severity) return "Unclassified"
  return `${severity.charAt(0).toUpperCase()}${severity.slice(1)}` as ReportStatusDto["severity"]
}

export function toReportStatusDto(
  record: ReportDetailRecord,
  workOrders: WorkOrderProgressRecord[],
): ReportStatusDto {
  const report = toCommunityReportDto(record)
  const history = record.statusHistory.map(toStatusHistoryDto)

  return {
    id: report.id,
    type: report.title,
    title: report.title,
    category: report.category,
    status: report.status,
    createdAt: report.createdAt,
    district: report.district.name,
    severity: severityLabel(report.severity),
    location: report.location,
    currentStatus: reportStatusStep(report.status),
    timeline: history.map((entry) => ({
      time: entry.createdAt,
      text: entry.note ?? `Status changed to ${entry.toStatus}`,
    })),
    history,
    workOrders: workOrders.map(toWorkOrderProgressDto),
  }
}
