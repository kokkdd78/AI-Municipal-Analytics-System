import { z } from "zod"

export const DEFAULT_ARCHIVE_PAGE_SIZE = 20
export const MAX_ARCHIVE_PAGE_SIZE = 50

export const archiveIdSchema = z.string().trim().min(1).max(191).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
export const archiveReportRequestSchema = z.object({ reportId: archiveIdSchema }).strict()

const querySchema = z.object({
  q: z.string().trim().min(1).max(120).refine((value) => !/[\u0000-\u001f\u007f]/.test(value)).optional(),
  page: z.number().int().min(1).max(100_000).default(1),
  pageSize: z.number().int().min(1).max(MAX_ARCHIVE_PAGE_SIZE).default(DEFAULT_ARCHIVE_PAGE_SIZE),
}).strict()

export type ArchiveListQuery = z.infer<typeof querySchema>

export function parseArchiveListQuery(searchParams: URLSearchParams): ArchiveListQuery | null {
  const allowed = new Set(["q", "page", "pageSize"])
  for (const key of searchParams.keys()) {
    if (!allowed.has(key) || searchParams.getAll(key).length !== 1) return null
  }
  const rawPage = searchParams.get("page")
  const rawPageSize = searchParams.get("pageSize")
  if (rawPage !== null && !/^[1-9]\d*$/.test(rawPage)) return null
  if (rawPageSize !== null && !/^[1-9]\d*$/.test(rawPageSize)) return null
  const parsed = querySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    page: rawPage === null ? undefined : Number(rawPage),
    pageSize: rawPageSize === null ? undefined : Number(rawPageSize),
  })
  return parsed.success ? parsed.data : null
}
