import { randomUUID } from "node:crypto"

import { ReportSeverity, type UserRole } from "../../generated/prisma/client"
import type { AuthenticatedMunicipalUser } from "../auth/authorization-core"
import { reportTitleFromCategory } from "./category"
import type { CreateReportRequest, ReportListQuery } from "./contracts"
import {
  toCommunityReportDto,
  toOwnedReportDto,
  toReportDetailDto,
  toReportStatusDto,
  type CommunityReportDto,
  type OwnedReportDto,
  type ReportDetailDto,
  type ReportStatusDto,
} from "./dto"
import { ReportServiceError } from "./errors"
import type { ReportDetailRecord, ReportRepository } from "./repository"

export interface ReportListDto {
  scope: ReportListQuery["scope"]
  reports: Array<CommunityReportDto | OwnedReportDto>
  nextCursor: string | null
}

export interface ReportVoteDto {
  reportId: string
  voted: true
  votes: number
}

export interface ReportService {
  createReport(user: AuthenticatedMunicipalUser, input: CreateReportRequest): Promise<ReportDetailDto>
  listReports(user: AuthenticatedMunicipalUser, query: ReportListQuery): Promise<ReportListDto>
  getReport(user: AuthenticatedMunicipalUser, id: string): Promise<ReportDetailDto>
  getReportStatus(user: AuthenticatedMunicipalUser, id: string): Promise<ReportStatusDto>
  voteForReport(user: AuthenticatedMunicipalUser, id: string): Promise<ReportVoteDto>
}

const DATABASE_SEVERITY: Record<NonNullable<CreateReportRequest["severity"]>, ReportSeverity> = {
  low: ReportSeverity.LOW,
  medium: ReportSeverity.MEDIUM,
  high: ReportSeverity.HIGH,
}

function requireCitizen(role: UserRole): void {
  if (role !== "Citizen") throw new ReportServiceError("forbidden")
}

function canAccessReport(user: AuthenticatedMunicipalUser, report: ReportDetailRecord): boolean {
  if (user.role === "Manager") return true
  if (user.role === "Citizen") return report.authorId === user.id
  return report.workOrders.some((workOrder) => workOrder.assignedToViewer)
}

function requireAccessibleReport(
  user: AuthenticatedMunicipalUser,
  report: ReportDetailRecord | null,
): ReportDetailRecord {
  if (!report || !canAccessReport(user, report)) throw new ReportServiceError("not-found")
  return report
}

export function createReportService(
  repository: ReportRepository,
  generateId: () => string = randomUUID,
): ReportService {
  return {
    async createReport(user, input) {
      requireCitizen(user.role)
      if (!(await repository.districtExists(input.districtId))) {
        throw new ReportServiceError("invalid-request")
      }

      const report = await repository.createReport({
        id: generateId(),
        historyId: generateId(),
        authorId: user.id,
        districtId: input.districtId,
        title: reportTitleFromCategory(input.category),
        description: input.description,
        category: input.category,
        severity: input.severity ? DATABASE_SEVERITY[input.severity] : null,
        latitude: input.location.lat,
        longitude: input.location.lng,
      })
      return toReportDetailDto(report)
    },

    async listReports(user, query) {
      const result = await repository.listReports({
        viewerId: user.id,
        ...(query.scope === "mine" ? { authorId: user.id } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
        take: query.limit + 1,
      })
      if (!result.cursorValid) throw new ReportServiceError("invalid-request")

      const hasMore = result.records.length > query.limit
      const page = result.records.slice(0, query.limit)
      return {
        scope: query.scope,
        reports: query.scope === "mine" ? page.map(toOwnedReportDto) : page.map(toCommunityReportDto),
        nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
      }
    },

    async getReport(user, id) {
      return toReportDetailDto(
        requireAccessibleReport(user, await repository.findReportDetail(id, user.id)),
      )
    },

    async getReportStatus(user, id) {
      const report = requireAccessibleReport(user, await repository.findReportDetail(id, user.id))
      const visibleWorkOrders = user.role === "Crew"
        ? report.workOrders.filter((workOrder) => workOrder.assignedToViewer)
        : report.workOrders
      return toReportStatusDto(report, visibleWorkOrders)
    },

    async voteForReport(user, id) {
      requireCitizen(user.role)
      const votes = await repository.addVote({ reportId: id, userId: user.id, voteId: generateId() })
      if (votes === null) throw new ReportServiceError("not-found")
      return { reportId: id, voted: true, votes }
    },
  }
}
