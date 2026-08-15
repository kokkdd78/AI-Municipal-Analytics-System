import type { AppStorageState } from "../client-storage"
import type {
  CommunityReportDto,
  OwnedReportDto,
  ReportDetailDto,
  ReportStatusDto,
} from "./dto"
import type { Report, UserRole } from "../../types/domain"
import { reportStatusStep } from "../report-utils"

export type CitizenReportSource = "legacy" | "server"

export interface CitizenReportView extends Report {
  source: CitizenReportSource
  hasVoted: boolean
}

export const ATTACHMENT_UPLOAD_UNAVAILABLE_MESSAGE =
  "رفع الصور الآمن غير متاح حالياً. أزل الصورة لإرسال البلاغ بدون مرفق."

export const AI_REPORT_UNAVAILABLE_MESSAGE =
  "رفع الصور والتحليل الذكي غير متاحين حالياً. استخدم البلاغ التفصيلي بدون صورة."

export function manualReportAttachmentError(selectedPhoto: string | null): string | null {
  return selectedPhoto ? ATTACHMENT_UPLOAD_UNAVAILABLE_MESSAGE : null
}

export function aiReportSubmissionError(): string {
  return AI_REPORT_UNAVAILABLE_MESSAGE
}

export function serverReportToView(report: CommunityReportDto | OwnedReportDto): CitizenReportView {
  return {
    id: report.id,
    title: report.title,
    description: report.description,
    category: report.category,
    status: report.status,
    ...(report.severity ? { severity: report.severity } : {}),
    location: report.location,
    district: report.district.name,
    createdAt: report.createdAt,
    votes: report.votes,
    ...("authorId" in report ? { authorId: report.authorId } : {}),
    attachments: [],
    source: "server",
    hasVoted: report.hasVoted,
  }
}

export function ownedLegacyReportViews(
  reports: readonly Report[],
  votedReportIds: readonly string[],
  authenticatedUser: { id: string; role: UserRole } | null,
): CitizenReportView[] {
  if (!authenticatedUser || authenticatedUser.role !== "Citizen") return []
  const voted = new Set(votedReportIds)
  return reports
    .filter((report) => report.authorId === authenticatedUser.id)
    .map((report) => ({
      ...report,
      source: "legacy" as const,
      hasVoted: voted.has(report.id),
    }))
}

export function mergeCitizenReportViews(
  serverReports: readonly CitizenReportView[],
  legacyReports: readonly CitizenReportView[],
): CitizenReportView[] {
  const merged = new Map(legacyReports.map((report) => [report.id, report]))
  for (const report of serverReports) merged.set(report.id, report)
  return [...merged.values()].toSorted((first, second) =>
    second.createdAt.localeCompare(first.createdAt) || second.id.localeCompare(first.id),
  )
}

export interface ServerReportCollections {
  community: CommunityReportDto[]
  mine: OwnedReportDto[]
}

function communityProjectionFromDetail(report: ReportDetailDto): CommunityReportDto {
  return {
    id: report.id,
    title: report.title,
    description: report.description,
    category: report.category,
    status: report.status,
    severity: report.severity,
    location: report.location,
    district: report.district,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    votes: report.votes,
    hasVoted: report.hasVoted,
  }
}

function prependByReportId<T extends { id: string }>(reports: readonly T[], report: T): T[] {
  return [report, ...reports.filter((existing) => existing.id !== report.id)]
}

export function mergeCreatedServerReport(
  collections: ServerReportCollections,
  report: ReportDetailDto,
  userId: string,
): ServerReportCollections {
  const community = communityProjectionFromDetail(report)
  return {
    community: prependByReportId(collections.community, community),
    mine: prependByReportId(collections.mine, { ...community, authorId: userId }),
  }
}

function updateVote<T extends CommunityReportDto>(reports: readonly T[], id: string, votes: number): T[] {
  return reports.map((report) =>
    report.id === id ? { ...report, votes, hasVoted: true } : report,
  )
}

export function mergeCompletedServerVote(
  collections: ServerReportCollections,
  id: string,
  votes: number,
): ServerReportCollections {
  return {
    community: updateVote(collections.community, id, votes),
    mine: updateVote(collections.mine, id, votes),
  }
}

export function mayDisplayServerReports(
  stateUserId: string | null,
  authenticatedUser: { id: string; role: UserRole } | null,
): boolean {
  return Boolean(
    stateUserId
    && authenticatedUser?.role === "Citizen"
    && stateUserId === authenticatedUser.id,
  )
}

export function applyLegacyReportVote(state: AppStorageState, id: string): AppStorageState {
  if (state.votedReportIds.includes(id)) return state
  const target = state.reports.find((report) => report.id === id)
  if (!target) return state
  return {
    ...state,
    reports: state.reports.map((report) =>
      report.id === id ? { ...report, votes: report.votes + 1 } : report,
    ),
    votedReportIds: [...state.votedReportIds, id],
  }
}

export interface LegacyReportTrackingView extends ReportStatusDto {
  locallyStored: true
}

export function legacyReportTrackingView(report: CitizenReportView): LegacyReportTrackingView {
  const createdTime = new Date(report.createdAt).toISOString()
  return {
    id: report.id,
    type: report.title,
    title: report.title,
    category: report.category,
    status: report.status,
    createdAt: report.createdAt,
    district: report.district,
    severity: report.severity
      ? `${report.severity.charAt(0).toUpperCase()}${report.severity.slice(1)}` as "Low" | "Medium" | "High"
      : "Unclassified",
    location: report.location,
    currentStatus: reportStatusStep(report.status),
    timeline: [{ time: createdTime, text: "Locally stored report submitted" }],
    history: [],
    workOrders: [],
    locallyStored: true,
  }
}

export interface LatestReportRequestToken {
  readonly id: number
  readonly userId: string
  readonly signal: AbortSignal
}

export interface LatestReportRequestGate {
  begin(userId: string): LatestReportRequestToken
  invalidate(): void
  isCurrent(token: LatestReportRequestToken, userId: string | null): boolean
}

export type CurrentReportRequestResult<T> =
  | { current: true; value: T }
  | { current: false }

export function forwardReportAbortSignal(
  source: AbortSignal | undefined,
  target: AbortController,
): () => void {
  if (!source) return () => undefined
  const abort = () => target.abort()
  if (source.aborted) abort()
  else source.addEventListener("abort", abort, { once: true })
  return () => source.removeEventListener("abort", abort)
}

export async function awaitCurrentReportList<T>(
  operation: Promise<T>,
  gate: LatestReportRequestGate,
  token: LatestReportRequestToken,
  currentUserId: () => string | null,
): Promise<CurrentReportRequestResult<T>> {
  const value = await operation
  return gate.isCurrent(token, currentUserId()) ? { current: true, value } : { current: false }
}

export async function awaitCurrentReportMutation<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  expectedUserId: string,
  currentUserId: () => string | null,
): Promise<CurrentReportRequestResult<T>> {
  const value = await operation
  return !signal.aborted && currentUserId() === expectedUserId
    ? { current: true, value }
    : { current: false }
}

export function createLatestReportRequestGate(): LatestReportRequestGate {
  let nextId = 1
  let current: { token: LatestReportRequestToken; controller: AbortController } | null = null

  return {
    begin(userId) {
      current?.controller.abort()
      const controller = new AbortController()
      const token = Object.freeze({ id: nextId++, userId, signal: controller.signal })
      current = { token, controller }
      return token
    },
    invalidate() {
      current?.controller.abort()
      current = null
    },
    isCurrent(token, userId) {
      return current?.token.id === token.id && token.userId === userId && !token.signal.aborted
    },
  }
}
