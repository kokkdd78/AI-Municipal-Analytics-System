import { z } from "zod"

import type { CreateReportRequest, ReportListScope } from "./contracts"
import type {
  CommunityReportDto,
  OwnedReportDto,
  ReportDetailDto,
  ReportStatusDto,
} from "./dto"
import type { ReportVoteDto } from "./service"

export type ReportClientErrorKind =
  | "aborted"
  | "authentication"
  | "conflict"
  | "forbidden"
  | "malformed-response"
  | "network"
  | "not-found"
  | "rate-limit"
  | "server"
  | "validation"

export class ReportClientError extends Error {
  readonly kind: ReportClientErrorKind
  readonly status: number | null

  constructor(kind: ReportClientErrorKind, status: number | null) {
    super("The report request could not be completed")
    this.name = "ReportClientError"
    this.kind = kind
    this.status = status
  }
}

const reportIdSchema = z.string().min(1).max(191).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
const isoDateSchema = z.string().datetime()
const statusSchema = z.enum(["pending", "in-progress", "resolved"])
const severitySchema = z.enum(["low", "medium", "high"])
const locationSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
  })
  .strict()
const districtSchema = z.object({ id: reportIdSchema, name: z.string().min(1).max(191) }).strict()

const communityReportShape = {
  id: reportIdSchema,
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(2_000),
  category: z.string().min(1).max(80),
  status: statusSchema,
  severity: severitySchema.nullable(),
  location: locationSchema,
  district: districtSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  votes: z.number().int().nonnegative(),
  hasVoted: z.boolean(),
} as const

export const communityReportDtoSchema: z.ZodType<CommunityReportDto> = z
  .object(communityReportShape)
  .strict()

export const ownedReportDtoSchema: z.ZodType<OwnedReportDto> = z
  .object({ ...communityReportShape, authorId: reportIdSchema })
  .strict()

const statusHistorySchema = z
  .object({
    id: reportIdSchema,
    fromStatus: statusSchema.nullable(),
    toStatus: statusSchema,
    note: z.string().nullable(),
    createdAt: isoDateSchema,
  })
  .strict()

export const reportDetailDtoSchema: z.ZodType<ReportDetailDto> = z
  .object({
    ...communityReportShape,
    authorId: reportIdSchema.nullable(),
    statusHistory: z.array(statusHistorySchema),
  })
  .strict()

const workOrderSchema = z
  .object({
    id: reportIdSchema,
    title: z.string().min(1),
    status: z.enum(["pending", "active", "completed"]),
    priority: z.enum(["Low", "Medium", "High"]),
    startedAt: isoDateSchema.nullable(),
    completedAt: isoDateSchema.nullable(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
  })
  .strict()

export const reportStatusDtoSchema: z.ZodType<ReportStatusDto> = z
  .object({
    id: reportIdSchema,
    type: z.string().min(1),
    title: z.string().min(1),
    category: z.string().min(1),
    status: statusSchema,
    createdAt: isoDateSchema,
    district: z.string().min(1),
    severity: z.enum(["Low", "Medium", "High", "Unclassified"]),
    location: locationSchema,
    currentStatus: z.number().int().min(0).max(3),
    timeline: z.array(z.object({ time: z.string().min(1), text: z.string().min(1) }).strict()),
    history: z.array(statusHistorySchema),
    workOrders: z.array(workOrderSchema),
  })
  .strict()

const reportVoteDtoSchema: z.ZodType<ReportVoteDto> = z
  .object({ reportId: reportIdSchema, voted: z.literal(true), votes: z.number().int().nonnegative() })
  .strict()

const communityListSchema = z
  .object({
    scope: z.literal("community"),
    reports: z.array(communityReportDtoSchema),
    nextCursor: reportIdSchema.nullable(),
  })
  .strict()

const ownedListSchema = z
  .object({
    scope: z.literal("mine"),
    reports: z.array(ownedReportDtoSchema),
    nextCursor: reportIdSchema.nullable(),
  })
  .strict()

type CommunityReportPage = z.infer<typeof communityListSchema>
type OwnedReportPage = z.infer<typeof ownedListSchema>

export interface ReportRequestOptions {
  signal?: AbortSignal
}

const SAFE_MESSAGES: Record<Exclude<ReportClientErrorKind, "aborted">, string> = {
  authentication: "Your session has expired. Please sign in again.",
  conflict: "That report operation conflicts with its current state. Refresh and try again.",
  forbidden: "You are not authorized to complete that report operation.",
  "malformed-response": "The report service returned an unexpected response. Please try again.",
  network: "Unable to reach the report service. Check your connection and try again.",
  "not-found": "The requested report could not be found.",
  "rate-limit": "Too many report requests. Please wait and try again.",
  server: "The report service is temporarily unavailable. Please try again.",
  validation: "Please check the report information and try again.",
}

export function reportClientErrorMessage(error: unknown): string {
  if (!(error instanceof ReportClientError) || error.kind === "aborted") {
    return SAFE_MESSAGES.server
  }
  return SAFE_MESSAGES[error.kind]
}

function responseError(status: number): ReportClientError {
  if (status === 400) return new ReportClientError("validation", status)
  if (status === 401) return new ReportClientError("authentication", status)
  if (status === 403) return new ReportClientError("forbidden", status)
  if (status === 404) return new ReportClientError("not-found", status)
  if (status === 409) return new ReportClientError("conflict", status)
  if (status === 429) return new ReportClientError("rate-limit", status)
  return new ReportClientError("server", status)
}

function requestFailure(error: unknown, signal?: AbortSignal): ReportClientError {
  if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
    return new ReportClientError("aborted", null)
  }
  return error instanceof ReportClientError ? error : new ReportClientError("network", null)
}

async function requestJson<T>(
  input: RequestInfo | URL,
  schema: z.ZodType<T>,
  init: RequestInit,
): Promise<T> {
  try {
    const response = await fetch(input, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json", ...init.headers },
    })
    if (!response.ok) throw responseError(response.status)

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new ReportClientError("malformed-response", response.status)
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) throw new ReportClientError("malformed-response", response.status)
    return parsed.data
  } catch (error) {
    throw requestFailure(error, init.signal ?? undefined)
  }
}

export function listReportPage(
  scope: "community",
  cursor?: string,
  options?: ReportRequestOptions,
): Promise<z.infer<typeof communityListSchema>>
export function listReportPage(
  scope: "mine",
  cursor?: string,
  options?: ReportRequestOptions,
): Promise<z.infer<typeof ownedListSchema>>
export function listReportPage(
  scope: ReportListScope,
  cursor?: string,
  options: ReportRequestOptions = {},
): Promise<CommunityReportPage | OwnedReportPage> {
  const query = new URLSearchParams({ scope, limit: "50" })
  if (cursor) query.set("cursor", cursor)
  if (scope === "mine") {
    return requestJson(`/api/reports?${query}`, ownedListSchema, { method: "GET", signal: options.signal })
  }
  return requestJson(`/api/reports?${query}`, communityListSchema, { method: "GET", signal: options.signal })
}

export async function listAllReports(
  scope: "community",
  options?: ReportRequestOptions,
): Promise<CommunityReportDto[]>
export async function listAllReports(
  scope: "mine",
  options?: ReportRequestOptions,
): Promise<OwnedReportDto[]>
export async function listAllReports(
  scope: ReportListScope,
  options: ReportRequestOptions = {},
): Promise<Array<CommunityReportDto | OwnedReportDto>> {
  const reports = new Map<string, CommunityReportDto | OwnedReportDto>()
  const cursors = new Set<string>()
  let cursor: string | undefined

  for (let page = 0; page < 1_000; page += 1) {
    const result = scope === "mine"
      ? await listReportPage("mine", cursor, options)
      : await listReportPage("community", cursor, options)
    for (const report of result.reports) reports.set(report.id, report)
    if (result.nextCursor === null) return [...reports.values()]
    if (cursors.has(result.nextCursor) || result.nextCursor === cursor) {
      throw new ReportClientError("malformed-response", 200)
    }
    cursors.add(result.nextCursor)
    cursor = result.nextCursor
  }

  throw new ReportClientError("malformed-response", 200)
}

export function createReport(
  input: CreateReportRequest,
  options: ReportRequestOptions = {},
): Promise<ReportDetailDto> {
  return requestJson("/api/reports", reportDetailDtoSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: options.signal,
  })
}

export function getReportDetail(id: string, options: ReportRequestOptions = {}): Promise<ReportDetailDto> {
  return requestJson(`/api/reports/${encodeURIComponent(id)}`, reportDetailDtoSchema, {
    method: "GET",
    signal: options.signal,
  })
}

export function getReportStatus(id: string, options: ReportRequestOptions = {}): Promise<ReportStatusDto> {
  return requestJson(`/api/report-status/${encodeURIComponent(id)}`, reportStatusDtoSchema, {
    method: "GET",
    signal: options.signal,
  })
}

export function voteForReport(id: string, options: ReportRequestOptions = {}): Promise<ReportVoteDto> {
  return requestJson(`/api/reports/${encodeURIComponent(id)}/vote`, reportVoteDtoSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    signal: options.signal,
  })
}
