import { z } from "zod"
import { WorkOrderPriority, WorkOrderStatus } from "@/generated/prisma/client"
import { requireApiRole } from "@/lib/auth/authorization"
import { auth } from "@/lib/auth/server"
import { hasTrustedRequestOrigin } from "@/lib/auth/http-handlers"
import { hasSupportedJsonMediaType, reportIdSchema } from "@/lib/reports/contracts"
import { cloudinaryReportImageStorage } from "@/lib/report-images/cloudinary"
import { hasSupportedReportImageMediaType, validateReportImageForm } from "@/lib/report-images/contracts"
import { createOperationsService, OperationsError } from "./service"
import { prisma } from "@/lib/db/prisma"

const service = createOperationsService(prisma)
const trustedOrigins = Array.isArray(auth.options.trustedOrigins) ? auth.options.trustedOrigins.filter((value): value is string => typeof value === "string") : []
const id = reportIdSchema
const text = (limit: number) => z.string().trim().min(1).max(limit)
const priority = z.enum(["low", "medium", "high"])
const crewIds = z.array(id).min(1).max(20).refine((ids) => new Set(ids).size === ids.length)
const workOrderCreateSchema = z.object({ reportId: id, title: text(160), description: text(2_000), priority, crewIds }).strict()
const workOrderUpdateSchema = z.object({ priority: priority.optional(), crewIds: crewIds.optional() }).strict().refine((value) => value.priority !== undefined || value.crewIds !== undefined)
const crewUpdateSchema = z.object({ status: z.enum(["active", "completed"]), note: z.string().trim().max(2_000).optional() }).strict()
const closeSchema = z.object({ note: z.string().trim().max(2_000).optional() }).strict()

function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { "cache-control": "no-store" } }) }
function error(error: unknown) {
  if (error instanceof OperationsError) {
    if (error.code === "forbidden") return json({ error: "Access denied" }, 403)
    if (error.code === "not-found") return json({ error: "Not found" }, 404)
    if (error.code === "conflict") return json({ error: "Operation cannot be completed" }, 409)
    return json({ error: "Invalid request" }, 400)
  }
  return json({ error: "Municipal service unavailable" }, 500)
}
async function body(request: Request) {
  if (!hasSupportedJsonMediaType(request.headers.get("content-type"))) throw new OperationsError("invalid")
  try { return await request.json() } catch { throw new OperationsError("invalid") }
}
async function manager(request: Request) { const result = await requireApiRole("Manager", request.headers); if (result.response) return result; return result }
async function crew(request: Request) { const result = await requireApiRole("Crew", request.headers); if (result.response) return result; return result }
function trusted(request: Request) { return hasTrustedRequestOrigin(request, trustedOrigins) }
function date(value: string | null, end = false): Date | undefined { if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined; const parsed = new Date(`${value}${end ? "T23:59:59.999Z" : "T00:00:00.000Z"}`); return Number.isNaN(parsed.getTime()) ? undefined : parsed }

export async function dashboardGET(request: Request) {
  try {
    const authorized = await manager(request); if (authorized.response) return authorized.response
    const url = new URL(request.url); const page = Number(url.searchParams.get("page") ?? "1"); const pageSize = Number(url.searchParams.get("pageSize") ?? "20")
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return json({ error: "Invalid request" }, 400)
    const rawStatus = url.searchParams.get("status"); const status = rawStatus === null ? undefined : ({ pending: "PENDING", "in-progress": "IN_PROGRESS", resolved: "RESOLVED" } as const)[rawStatus as "pending" | "in-progress" | "resolved"]
    if (rawStatus !== null && !status) return json({ error: "Invalid request" }, 400)
    const fromRaw = url.searchParams.get("from"), toRaw = url.searchParams.get("to"); const from = date(fromRaw), to = date(toRaw, true)
    if ((fromRaw && !from) || (toRaw && !to) || (from && to && from > to)) return json({ error: "Invalid request" }, 400)
    return json(await service.dashboard(authorized.user, { page, pageSize, status, from, to, districtId: url.searchParams.get("district") ?? undefined, category: url.searchParams.get("category") ?? undefined }))
  } catch (caught) { return error(caught) }
}

export async function managerWorkOrdersGET(request: Request) { try { const authorized = await manager(request); if (authorized.response) return authorized.response; return json(await service.managerWorkOrders(authorized.user)) } catch (caught) { return error(caught) } }
export async function managerWorkOrdersPOST(request: Request) {
  try { if (!trusted(request)) return json({ error: "Access denied" }, 403); const authorized = await manager(request); if (authorized.response) return authorized.response; const parsed = workOrderCreateSchema.safeParse(await body(request)); if (!parsed.success) return json({ error: "Invalid request" }, 400); return json(await service.createWorkOrder(authorized.user, { ...parsed.data, priority: parsed.data.priority.toUpperCase() as WorkOrderPriority }), 201) } catch (caught) { return error(caught) }
}
export async function managerWorkOrderPATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { if (!trusted(request)) return json({ error: "Access denied" }, 403); const authorized = await manager(request); if (authorized.response) return authorized.response; const orderId = id.safeParse((await context.params).id); const parsed = workOrderUpdateSchema.safeParse(await body(request)); if (!orderId.success || !parsed.success) return json({ error: "Invalid request" }, 400); return json(await service.updateWorkOrder(authorized.user, orderId.data, { ...parsed.data, priority: parsed.data.priority?.toUpperCase() as WorkOrderPriority | undefined })) } catch (caught) { return error(caught) }
}
export async function managerClosePOST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { if (!trusted(request)) return json({ error: "Access denied" }, 403); const authorized = await manager(request); if (authorized.response) return authorized.response; const reportId = id.safeParse((await context.params).id); const parsed = closeSchema.safeParse(await body(request)); if (!reportId.success || !parsed.success) return json({ error: "Invalid request" }, 400); return json(await service.approveClosure(authorized.user, reportId.data, parsed.data.note)) } catch (caught) { return error(caught) }
}
export async function crewWorkOrdersGET(request: Request) { try { const authorized = await crew(request); if (authorized.response) return authorized.response; return json(await service.crewWorkOrders(authorized.user)) } catch (caught) { return error(caught) } }
export async function crewWorkOrderPATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { if (!trusted(request)) return json({ error: "Access denied" }, 403); const authorized = await crew(request); if (authorized.response) return authorized.response; const orderId = id.safeParse((await context.params).id); const parsed = crewUpdateSchema.safeParse(await body(request)); if (!orderId.success || !parsed.success) return json({ error: "Invalid request" }, 400); return json(await service.crewUpdate(authorized.user, orderId.data, { ...parsed.data, status: parsed.data.status.toUpperCase() as WorkOrderStatus })) } catch (caught) { return error(caught) }
}
export async function crewEvidencePOST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!trusted(request)) return json({ error: "Access denied" }, 403)
    const authorized = await crew(request); if (authorized.response) return authorized.response
    const orderId = id.safeParse((await context.params).id); if (!orderId.success) return json({ error: "Invalid request" }, 400)
    if (!hasSupportedReportImageMediaType(request.headers.get("content-type"))) return json({ error: "Unsupported media type" }, 415)
    const parsed = await validateReportImageForm(await request.formData())
    if (!parsed.ok) return json({ error: parsed.reason === "too-large" ? "Image is too large" : "Invalid image" }, parsed.reason === "too-large" ? 413 : 400)
    let stored: { publicId: string; secureUrl: string } | null = null
    try {
      stored = await cloudinaryReportImageStorage.upload({ bytes: parsed.image.bytes, folder: `smart-municipal-assistant/work-orders/${orderId.data}`, publicId: crypto.randomUUID() })
      return json(await service.addCompletionEvidence(authorized.user, orderId.data, { name: parsed.image.name, mimeType: parsed.image.mimeType, url: stored.secureUrl }), 201)
    } catch (caught) {
      if (stored) await cloudinaryReportImageStorage.remove(stored.publicId).catch(() => undefined)
      return error(caught)
    }
  } catch (caught) { return error(caught) }
}
