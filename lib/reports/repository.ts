import type {
  PrismaClient,
  ReportSeverity,
  ReportStatus,
  WorkOrderPriority,
  WorkOrderStatus,
} from "../../generated/prisma/client"

export interface ReportProjectionRecord {
  id: string
  authorId: string | null
  title: string
  description: string
  category: string
  status: ReportStatus
  severity: ReportSeverity | null
  latitude: number
  longitude: number
  importedVoteBaseline: number
  createdAt: Date
  updatedAt: Date
  district: { id: string; name: string }
  voteCount: number
}

export interface ReportHistoryRecord {
  id: string
  fromStatus: ReportStatus | null
  toStatus: ReportStatus
  note: string | null
  createdAt: Date
}

export interface WorkOrderProgressRecord {
  id: string
  title: string
  status: WorkOrderStatus
  priority: WorkOrderPriority
  startedAt: Date | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
  assignedToViewer: boolean
}

export interface ReportDetailRecord extends ReportProjectionRecord {
  viewerHasVoted: boolean
  statusHistory: ReportHistoryRecord[]
  workOrders: WorkOrderProgressRecord[]
}

export interface CreateReportRecordInput {
  id: string
  authorId: string
  districtId: string
  title: string
  description: string
  category: string
  severity: ReportSeverity | null
  latitude: number
  longitude: number
  historyId: string
}

export interface ListReportsInput {
  authorId?: string
  cursor?: string
  take: number
}

export interface ListReportsRecordResult {
  records: ReportProjectionRecord[]
  cursorValid: boolean
}

export interface ReportRepository {
  districtExists(id: string): Promise<boolean>
  createReport(input: CreateReportRecordInput): Promise<ReportDetailRecord>
  listReports(input: ListReportsInput): Promise<ListReportsRecordResult>
  findReportDetail(id: string, viewerId: string): Promise<ReportDetailRecord | null>
  addVote(input: { reportId: string; userId: string; voteId: string }): Promise<number | null>
}

const reportProjectionSelect = {
  id: true,
  authorId: true,
  title: true,
  description: true,
  category: true,
  status: true,
  severity: true,
  latitude: true,
  longitude: true,
  importedVoteBaseline: true,
  createdAt: true,
  updatedAt: true,
  district: { select: { id: true, name: true } },
  _count: { select: { votes: true } },
} as const

type ProjectionQueryRecord = Omit<ReportProjectionRecord, "voteCount">
  & { _count: { votes: number } }

function projection(record: ProjectionQueryRecord): ReportProjectionRecord {
  const { _count, ...report } = record
  return { ...report, voteCount: _count.votes }
}

export function createPrismaReportRepository(database: PrismaClient): ReportRepository {
  return {
    async districtExists(id) {
      return (await database.district.count({ where: { id } })) === 1
    },

    async createReport(input) {
      return database.$transaction(async (transaction) => {
        const created = await transaction.report.create({
          data: {
            id: input.id,
            authorId: input.authorId,
            districtId: input.districtId,
            title: input.title,
            description: input.description,
            category: input.category,
            status: "PENDING",
            severity: input.severity,
            latitude: input.latitude,
            longitude: input.longitude,
            importedVoteBaseline: 0,
          },
          select: reportProjectionSelect,
        })
        const history = await transaction.statusHistory.create({
          data: {
            id: input.historyId,
            reportId: input.id,
            actorId: input.authorId,
            fromStatus: null,
            toStatus: "PENDING",
            note: "Report submitted",
          },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            note: true,
            createdAt: true,
          },
        })

        return {
          ...projection(created),
          viewerHasVoted: false,
          statusHistory: [history],
          workOrders: [],
        }
      })
    },

    async listReports(input) {
      const where = input.authorId ? { authorId: input.authorId } : {}
      if (input.cursor) {
        const cursor = await database.report.findFirst({
          where: { ...where, id: input.cursor },
          select: { id: true },
        })
        if (!cursor) return { records: [], cursorValid: false }
      }

      const records = await database.report.findMany({
        where,
        select: reportProjectionSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.take,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      })

      return { records: records.map(projection), cursorValid: true }
    },

    async findReportDetail(id, viewerId) {
      const record = await database.report.findUnique({
        where: { id },
        select: {
          ...reportProjectionSelect,
          votes: { where: { userId: viewerId }, select: { id: true }, take: 1 },
          statusHistory: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              fromStatus: true,
              toStatus: true,
              note: true,
              createdAt: true,
            },
          },
          workOrders: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              startedAt: true,
              completedAt: true,
              createdAt: true,
              updatedAt: true,
              crewAssignments: {
                where: { crewUserId: viewerId },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      })
      if (!record) return null

      const { _count, votes, statusHistory, workOrders, ...report } = record
      return {
        ...report,
        voteCount: _count.votes,
        viewerHasVoted: votes.length > 0,
        statusHistory,
        workOrders: workOrders.map(({ crewAssignments, ...workOrder }) => ({
          ...workOrder,
          assignedToViewer: crewAssignments.length > 0,
        })),
      }
    },

    async addVote(input) {
      return database.$transaction(async (transaction) => {
        const report = await transaction.report.findUnique({
          where: { id: input.reportId },
          select: { importedVoteBaseline: true },
        })
        if (!report) return null

        await transaction.vote.createMany({
          data: [{ id: input.voteId, reportId: input.reportId, userId: input.userId }],
          skipDuplicates: true,
        })
        const persistedVotes = await transaction.vote.count({ where: { reportId: input.reportId } })
        return report.importedVoteBaseline + persistedVotes
      })
    },
  }
}
