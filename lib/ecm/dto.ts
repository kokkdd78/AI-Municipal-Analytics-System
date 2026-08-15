import type { ArchiveAuditEventType, ArchiveStatus } from "../../generated/prisma/client"
import type { ArchiveDetailRecord, ArchiveRecordRecord, ArchiveSourceReport, EligibleArchiveReportRecord } from "./repository"

export interface ArchiveManifest {
  version: "1.0"
  ecmRecordNumber: string
  archivedAt: string
  retentionUntil: string
  archivedById: string
  report: {
    id: string
    title: string
    category: string
    description: string
    severity: string | null
    status: "resolved"
    district: { id: string; name: string }
    coordinates: { latitude: number; longitude: number }
    createdAt: string
    updatedAt: string
    voteCount: number
  }
  statusHistory: { id: string; actorId: string | null; fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }[]
  attachments: { id: string; name: string; mimeType: string; url: string; kind: string; createdAt: string; workOrderId: string | null }[]
  workOrders: {
    id: string
    title: string
    description: string
    priority: string
    status: string
    locationText: string | null
    startedAt: string | null
    completedAt: string | null
    createdAt: string
    updatedAt: string
    assignments: { id: string; crewUser: { id: string; name: string }; assignedById: string | null; assignedAt: string }[]
    statusHistory: { id: string; actorId: string | null; fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }[]
    attachments: { id: string; name: string; mimeType: string; url: string; kind: string; createdAt: string }[]
  }[]
}

export interface ArchiveListDto {
  id: string
  ecmRecordNumber: string
  reportId: string
  reportTitle: string
  districtName: string
  status: "archived"
  checksum: string
  provider: string
  archivedAt: string
  retentionUntil: string
}

export interface ArchiveDetailDto extends ArchiveListDto {
  documentUrl: string
  manifest: ArchiveManifest
  auditEvents: { id: string; actorId: string | null; type: string; details?: unknown; createdAt: string }[]
}

export interface EligibleArchiveReportDto {
  id: string
  title: string
  category: string
  district: { id: string; name: string }
  resolvedAt: string | null
  updatedAt: string
}

const ARCHIVE_STATUS: Record<ArchiveStatus, "archived"> = { ARCHIVED: "archived" }
const EVENT_TYPE: Record<ArchiveAuditEventType, string> = {
  ARCHIVED: "archived",
  VIEWED: "viewed",
  INTEGRITY_VERIFIED: "integrity-verified",
  INTEGRITY_FAILED: "integrity-failed",
}

export function createArchiveManifest(
  report: ArchiveSourceReport,
  metadata: { ecmRecordNumber: string; archivedAt: Date; retentionUntil: Date; archivedById: string },
): ArchiveManifest {
  return {
    version: "1.0",
    ecmRecordNumber: metadata.ecmRecordNumber,
    archivedAt: metadata.archivedAt.toISOString(),
    retentionUntil: metadata.retentionUntil.toISOString(),
    archivedById: metadata.archivedById,
    report: {
      id: report.id,
      title: report.title,
      category: report.category,
      description: report.description,
      severity: report.severity,
      status: "resolved",
      district: report.district,
      coordinates: { latitude: report.latitude, longitude: report.longitude },
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
      voteCount: report.importedVoteBaseline + report.voteCount,
    },
    statusHistory: report.statusHistory.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
    attachments: report.attachments.map((attachment) => ({ ...attachment, createdAt: attachment.createdAt.toISOString() })),
    workOrders: report.workOrders.map((workOrder) => ({
      id: workOrder.id,
      title: workOrder.title,
      description: workOrder.description,
      priority: workOrder.priority,
      status: workOrder.status,
      locationText: workOrder.locationText,
      startedAt: workOrder.startedAt?.toISOString() ?? null,
      completedAt: workOrder.completedAt?.toISOString() ?? null,
      createdAt: workOrder.createdAt.toISOString(),
      updatedAt: workOrder.updatedAt.toISOString(),
      assignments: workOrder.crewAssignments.map((assignment) => ({ ...assignment, assignedAt: assignment.assignedAt.toISOString() })),
      statusHistory: workOrder.statusHistory.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
      attachments: workOrder.attachments.map((attachment) => ({ ...attachment, createdAt: attachment.createdAt.toISOString() })),
    })),
  }
}

function toArchiveListDto(record: ArchiveRecordRecord): ArchiveListDto {
  return {
    id: record.id,
    ecmRecordNumber: record.ecmRecordNumber,
    reportId: record.reportId,
    reportTitle: record.reportTitle,
    districtName: record.districtName,
    status: ARCHIVE_STATUS[record.status],
    checksum: record.checksum,
    provider: record.provider,
    archivedAt: record.archivedAt.toISOString(),
    retentionUntil: record.retentionUntil.toISOString(),
  }
}

export function toArchiveDetailDto(record: ArchiveDetailRecord): ArchiveDetailDto {
  return {
    ...toArchiveListDto(record),
    documentUrl: record.documentUrl,
    manifest: record.manifest as ArchiveManifest,
    auditEvents: record.auditEvents.map((event) => ({
      id: event.id,
      actorId: event.actorId,
      type: EVENT_TYPE[event.type],
      details: event.details,
      createdAt: event.createdAt.toISOString(),
    })),
  }
}

export function toArchiveListRecordDto(record: ArchiveRecordRecord): ArchiveListDto {
  return toArchiveListDto(record)
}

export function toEligibleArchiveReportDto(record: EligibleArchiveReportRecord): EligibleArchiveReportDto {
  return {
    id: record.id,
    title: record.title,
    category: record.category,
    district: record.district,
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
  }
}
