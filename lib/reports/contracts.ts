import { z } from "zod"

import { REPORT_SEVERITIES } from "../../types/domain"
import { hasNonblankReportTitle } from "./category"

export const DEFAULT_REPORT_PAGE_SIZE = 20
export const MAX_REPORT_PAGE_SIZE = 50

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)

const boundedText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))

export const reportIdSchema = identifier

export const createReportRequestSchema = z
  .object({
    category: boundedText(80)
      .refine((value) => !/[\r\n\t]/.test(value))
      .refine(hasNonblankReportTitle),
    description: boundedText(2_000),
    districtId: identifier,
    location: z
      .object({
        lat: z.number().finite().min(-90).max(90),
        lng: z.number().finite().min(-180).max(180),
      })
      .strict(),
    severity: z.enum(REPORT_SEVERITIES).optional(),
  })
  .strict()

export const reportVoteRequestSchema = z.object({}).strict()

export const reportListScopeSchema = z.enum(["mine", "community"])

const reportListQuerySchema = z
  .object({
    scope: reportListScopeSchema,
    cursor: identifier.optional(),
    limit: z.number().int().min(1).max(MAX_REPORT_PAGE_SIZE).default(DEFAULT_REPORT_PAGE_SIZE),
  })
  .strict()

export type CreateReportRequest = z.infer<typeof createReportRequestSchema>
export type ReportListScope = z.infer<typeof reportListScopeSchema>
export type ReportListQuery = z.infer<typeof reportListQuerySchema>

export function parseReportListQuery(searchParams: URLSearchParams): ReportListQuery | null {
  const allowedKeys = new Set(["scope", "cursor", "limit"])

  for (const key of searchParams.keys()) {
    if (!allowedKeys.has(key) || searchParams.getAll(key).length !== 1) return null
  }

  const scope = searchParams.get("scope")
  const cursor = searchParams.get("cursor") ?? undefined
  const rawLimit = searchParams.get("limit")
  if (rawLimit !== null && !/^[1-9]\d*$/.test(rawLimit)) return null

  const parsed = reportListQuerySchema.safeParse({
    scope,
    cursor,
    limit: rawLimit === null ? undefined : Number(rawLimit),
  })

  return parsed.success ? parsed.data : null
}

export function hasSupportedJsonMediaType(contentType: string | null): boolean {
  if (!contentType || contentType.length > 256 || contentType.includes(",")) return false

  const parts = contentType.split(";")
  if (parts.length > 2 || parts[0]?.trim().toLowerCase() !== "application/json") return false
  if (parts.length === 1) return true

  return /^charset\s*=\s*(?:utf-8|"utf-8")$/i.test(parts[1]?.trim() ?? "")
}
