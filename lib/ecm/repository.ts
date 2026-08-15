import type {
  ArchiveAuditEventType,
  ArchiveStatus,
  Prisma,
  PrismaClient,
  ReportStatus,
} from "../../generated/prisma/client"

export interface ArchiveSourceReport {
  id: string
  title: string
  description: string
  category: string
  severity: string | null
  status: ReportStatus
  latitude: number
  longitude: number
  createdAt: Date
  updatedAt: Date
  district: { id: string; name: string }
  importedVoteBaseline: number
  voteCount: number
  statusHistory: { id: string; actorId: string | null; fromStatus: string | null; toStatus: string; note: string | null; createdAt: Date }[]
  attachments: { id: string; name: string; mimeType: string; url: string; kind: string; createdAt: Date; workOrderId: string | null }[]
  workOrders: {
    id: string
    title: string
    description: string
    priority: string
    status: string
    locationText: string | null
    startedAt: Date | null
    completedAt: Date | null
    createdAt: Date
    updatedAt: Date
    crewAssignments: { id: string; crewUser: { id: string; name: string }; assignedById: string | null; assignedAt: Date }[]
    statusHistory: { id: string; actorId: string | null; fromStatus: string | null; toStatus: string; note: string | null; createdAt: Date }[]
    attachments: { id: string; name: string; mimeType: string; url: string; kind: string; createdAt: Date }[]
  }[]
}

export interface ArchiveRecordRecord {
  id: string
  ecmRecordNumber: string
  reportId: string
  reportTitle: string
  districtName: string
  manifest: unknown
  storageKey: string
  documentUrl: string
  checksum: string
  provider: string
  status: ArchiveStatus
  archivedAt: Date
  retentionUntil: Date
  archivedById: string
  createdAt: Date
}

export interface ArchiveAuditEventRecord {
  id: string
  actorId: string | null
  type: ArchiveAuditEventType
  details: unknown
  createdAt: Date
}

export interface ArchiveDetailRecord extends ArchiveRecordRecord {
  auditEvents: ArchiveAuditEventRecord[]
}

export interface EligibleArchiveReportRecord {
  id: string
  title: string
  category: string
  district: { id: string; name: string }
  resolvedAt: Date | null
  updatedAt: Date
}

export interface ArchiveRepository {
  findReportForArchive(reportId: string): Promise<ArchiveSourceReport | null>
  findArchiveByReportId(reportId: string): Promise<ArchiveRecordRecord | null>
  findArchive(id: string): Promise<ArchiveDetailRecord | null>
  listArchives(query: { q?: string; page: number; pageSize: number }): Promise<{ records: ArchiveRecordRecord[]; total: number }>
  listEligibleReports(): Promise<EligibleArchiveReportRecord[]>
  createArchive(input: {
    id: string
    ecmRecordNumber: string
    reportId: string
    reportTitle: string
    districtName: string
    manifest: unknown
    storageKey: string
    documentUrl: string
    checksum: string
    provider: string
    archivedAt: Date
    retentionUntil: Date
    archivedById: string
    eventId: string
  }): Promise<ArchiveRecordRecord>
  addAuditEvent(input: {
    id: string
    archiveRecordId: string
    actorId: string
    type: ArchiveAuditEventType
    details?: unknown
    createdAt: Date
  }): Promise<void>
}

const archiveSelect = {
  id: true,
  ecmRecordNumber: true,
  reportId: true,
  reportTitle: true,
  districtName: true,
  manifest: true,
  storageKey: true,
  documentUrl: true,
  checksum: true,
  provider: true,
  status: true,
  archivedAt: true,
  retentionUntil: true,
  archivedById: true,
  createdAt: true,
} satisfies Prisma.ArchiveRecordSelect

function projectArchive(record: ArchiveRecordRecord): ArchiveRecordRecord {
  return record
}

export function createPrismaArchiveRepository(database: PrismaClient): ArchiveRepository {
  return {
    async findReportForArchive(reportId) {
      const report = await database.report.findUnique({
        where: { id: reportId },
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          severity: true,
          status: true,
          latitude: true,
          longitude: true,
          createdAt: true,
          updatedAt: true,
          district: { select: { id: true, name: true } },
          importedVoteBaseline: true,
          _count: { select: { votes: true } },
          statusHistory: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, actorId: true, fromStatus: true, toStatus: true, note: true, createdAt: true },
          },
          attachments: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, name: true, mimeType: true, url: true, kind: true, createdAt: true, workOrderId: true },
          },
          workOrders: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              title: true,
              description: true,
              priority: true,
              status: true,
              locationText: true,
              startedAt: true,
              completedAt: true,
              createdAt: true,
              updatedAt: true,
              crewAssignments: {
                orderBy: [{ assignedAt: "asc" }, { id: "asc" }],
                select: { id: true, assignedById: true, assignedAt: true, crewUser: { select: { id: true, name: true } } },
              },
              statusHistory: {
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: { id: true, actorId: true, fromStatus: true, toStatus: true, note: true, createdAt: true },
              },
              attachments: {
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: { id: true, name: true, mimeType: true, url: true, kind: true, createdAt: true },
              },
            },
          },
        },
      })
      if (!report) return null
      const { _count, ...rest } = report
      return { ...rest, severity: report.severity, importedVoteBaseline: report.importedVoteBaseline, voteCount: _count.votes }
    },

    async findArchiveByReportId(reportId) {
      const record = await database.archiveRecord.findUnique({ where: { reportId }, select: archiveSelect })
      return record ? projectArchive(record) : null
    },

    async findArchive(id) {
      const record = await database.archiveRecord.findUnique({
        where: { id },
        select: {
          ...archiveSelect,
          auditEvents: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, actorId: true, type: true, details: true, createdAt: true },
          },
        },
      })
      return record ? { ...projectArchive(record), auditEvents: record.auditEvents } : null
    },

    async listArchives(query) {
      const where: Prisma.ArchiveRecordWhereInput = query.q
        ? {
            OR: [
              { ecmRecordNumber: { contains: query.q, mode: "insensitive" } },
              { reportId: { contains: query.q, mode: "insensitive" } },
              { reportTitle: { contains: query.q, mode: "insensitive" } },
              { districtName: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}
      const [records, total] = await Promise.all([
        database.archiveRecord.findMany({
          where,
          select: archiveSelect,
          orderBy: [{ archivedAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        database.archiveRecord.count({ where }),
      ])
      return { records: records.map(projectArchive), total }
    },

    async listEligibleReports() {
      const reports = await database.report.findMany({
        where: { status: "RESOLVED", archiveRecord: { is: null } },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          title: true,
          category: true,
          district: { select: { id: true, name: true } },
          updatedAt: true,
          statusHistory: {
            where: { toStatus: "RESOLVED" },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { createdAt: true },
            take: 1,
          },
        },
      })
      return reports.map(({ statusHistory, ...report }) => ({ ...report, resolvedAt: statusHistory[0]?.createdAt ?? null }))
    },

    async createArchive(input) {
      const record = await database.$transaction(async (transaction) => transaction.archiveRecord.create({
        data: {
          id: input.id,
          ecmRecordNumber: input.ecmRecordNumber,
          reportId: input.reportId,
          reportTitle: input.reportTitle,
          districtName: input.districtName,
          manifest: input.manifest as Prisma.InputJsonValue,
          storageKey: input.storageKey,
          documentUrl: input.documentUrl,
          checksum: input.checksum,
          provider: input.provider,
          status: "ARCHIVED",
          archivedAt: input.archivedAt,
          retentionUntil: input.retentionUntil,
          archivedById: input.archivedById,
          auditEvents: {
            create: {
              id: input.eventId,
              actorId: input.archivedById,
              type: "ARCHIVED",
              details: { checksum: input.checksum, provider: input.provider },
              createdAt: input.archivedAt,
            },
          },
        },
        select: archiveSelect,
      }))
      return projectArchive(record)
    },

    async addAuditEvent(input) {
      await database.archiveAuditEvent.create({
        data: {
          id: input.id,
          archiveRecordId: input.archiveRecordId,
          actorId: input.actorId,
          type: input.type,
          details: input.details as Prisma.InputJsonValue | undefined,
          createdAt: input.createdAt,
        },
      })
    },
  }
}
