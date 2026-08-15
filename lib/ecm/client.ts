import { z } from "zod"

import type { ArchiveDetailDto, ArchiveListDto, EligibleArchiveReportDto } from "./dto"

const identifier = z.string().min(1)
const archiveSchema = z.object({
  id: identifier,
  ecmRecordNumber: identifier,
  reportId: identifier,
  reportTitle: identifier,
  districtName: identifier,
  status: z.literal("archived"),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  provider: identifier,
  archivedAt: z.string().datetime(),
  retentionUntil: z.string().datetime(),
}).strict()
const manifestSchema = z.object({
  version: z.literal("1.0"),
  ecmRecordNumber: identifier,
  archivedAt: z.string().datetime(),
  retentionUntil: z.string().datetime(),
  archivedById: identifier,
  report: z.object({
    id: identifier, title: identifier, category: identifier, description: z.string(), severity: z.string().nullable(), status: z.literal("resolved"),
    district: z.object({ id: identifier, name: identifier }).strict(),
    coordinates: z.object({ latitude: z.number().finite(), longitude: z.number().finite() }).strict(),
    createdAt: z.string().datetime(), updatedAt: z.string().datetime(), voteCount: z.number().int(),
  }).strict(),
  statusHistory: z.array(z.object({ id: identifier, actorId: z.string().nullable(), fromStatus: z.string().nullable(), toStatus: identifier, note: z.string().nullable(), createdAt: z.string().datetime() }).strict()),
  attachments: z.array(z.object({ id: identifier, name: identifier, mimeType: identifier, url: z.string().url(), kind: identifier, createdAt: z.string().datetime(), workOrderId: z.string().nullable() }).strict()),
  workOrders: z.array(z.object({
    id: identifier, title: identifier, description: z.string(), priority: identifier, status: identifier, locationText: z.string().nullable(), startedAt: z.string().datetime().nullable(), completedAt: z.string().datetime().nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
    assignments: z.array(z.object({ id: identifier, crewUser: z.object({ id: identifier, name: identifier }).strict(), assignedById: z.string().nullable(), assignedAt: z.string().datetime() }).strict()),
    statusHistory: z.array(z.object({ id: identifier, actorId: z.string().nullable(), fromStatus: z.string().nullable(), toStatus: identifier, note: z.string().nullable(), createdAt: z.string().datetime() }).strict()),
    attachments: z.array(z.object({ id: identifier, name: identifier, mimeType: identifier, url: z.string().url(), kind: identifier, createdAt: z.string().datetime() }).strict()),
  }).strict()),
}).strict()
const detailSchema = archiveSchema.extend({
  documentUrl: z.string().url().startsWith("https://"),
  manifest: manifestSchema,
  auditEvents: z.array(z.object({ id: identifier, actorId: z.string().nullable(), type: identifier, details: z.unknown(), createdAt: z.string().datetime() }).strict()),
}).strict()
const eligibleSchema = z.object({ id: identifier, title: identifier, category: identifier, district: z.object({ id: identifier, name: identifier }).strict(), resolvedAt: z.string().datetime().nullable(), updatedAt: z.string().datetime() }).strict()

export class ArchiveClientError extends Error {
  constructor(readonly status: number | null) { super("Archive request failed"); this.name = "ArchiveClientError" }
}

async function requestJson<T>(url: string, schema: z.ZodType<T>, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
      headers: options.body ? { "content-type": "application/json", ...options.headers } : options.headers,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new ArchiveClientError(null)
  }
  if (!response.ok) throw new ArchiveClientError(response.status)
  try { return schema.parse(await response.json()) } catch { throw new ArchiveClientError(response.status) }
}

export function archiveClientErrorMessage(error: unknown): string {
  if (!(error instanceof ArchiveClientError)) return "The archive service could not complete the request."
  if (error.status === 401) return "Your session has expired. Please sign in again."
  if (error.status === 403) return "You do not have permission to access archive records."
  if (error.status === 409) return "This report is not eligible for archiving."
  if (error.status === 400 || error.status === 415) return "The archive request was invalid."
  if (error.status === 429) return "Too many requests. Please wait and try again."
  return "The archive service could not complete the request."
}

export function getArchives(query: { q?: string; page?: number; pageSize?: number } = {}, signal?: AbortSignal) {
  const params = new URLSearchParams()
  if (query.q) params.set("q", query.q)
  if (query.page) params.set("page", String(query.page))
  if (query.pageSize) params.set("pageSize", String(query.pageSize))
  return requestJson(`/api/manager/archives?${params}`, z.object({ archives: z.array(archiveSchema), page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() }).strict(), { signal })
}

export function getEligibleArchiveReports(signal?: AbortSignal): Promise<EligibleArchiveReportDto[]> {
  return requestJson("/api/manager/archives/eligible", z.object({ reports: z.array(eligibleSchema) }).strict(), { signal }).then((result) => result.reports)
}

export function createArchive(reportId: string, signal?: AbortSignal): Promise<ArchiveListDto> {
  return requestJson("/api/manager/archives", archiveSchema, { method: "POST", body: JSON.stringify({ reportId }), signal })
}

export function getArchiveDetail(id: string, signal?: AbortSignal): Promise<ArchiveDetailDto> {
  return requestJson(`/api/manager/archives/${encodeURIComponent(id)}`, detailSchema, { signal })
}

export function verifyArchive(id: string, signal?: AbortSignal): Promise<{ valid: boolean; verifiedAt: string; checksum: string }> {
  return requestJson(`/api/manager/archives/${encodeURIComponent(id)}/verify`, z.object({ valid: z.boolean(), verifiedAt: z.string().datetime(), checksum: z.string().regex(/^[a-f0-9]{64}$/) }).strict(), { method: "POST", body: "{}", signal })
}

export function getArchiveDocument(id: string, signal?: AbortSignal): Promise<{ documentUrl: string }> {
  return requestJson(`/api/manager/archives/${encodeURIComponent(id)}/document`, z.object({ documentUrl: z.string().url().startsWith("https://") }).strict(), { signal })
}
