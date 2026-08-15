import type { ApiAuthorizationResult } from "../auth/authorization-core"
import { hasTrustedRequestOrigin } from "../auth/http-handlers"
import { hasSupportedJsonMediaType } from "../reports/contracts"
import { archiveIdSchema, archiveReportRequestSchema, parseArchiveListQuery } from "./contracts"
import { ArchiveServiceError, type ArchiveService } from "./service"

export interface ArchiveHttpAuthorization {
  requireManager(headers: Headers): Promise<ApiAuthorizationResult>
}

export interface ArchiveRouteContext {
  params: Promise<{ id: string }>
}

interface ArchiveHttpDependencies {
  authorization: ArchiveHttpAuthorization
  service: ArchiveService
  trustedOrigins: readonly string[]
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } })
}

function invalidRequest(): Response { return json({ error: "Invalid request" }, 400) }
function invalidOrigin(): Response { return json({ error: "Access denied" }, 403) }

function errorResponse(error: unknown): Response {
  if (error instanceof ArchiveServiceError) {
    if (error.code === "forbidden") return json({ error: "Access denied" }, 403)
    if (error.code === "not-found") return json({ error: "Archive record not found" }, 404)
    if (error.code === "conflict") return json({ error: "Report is not eligible for archiving" }, 409)
    if (error.code === "invalid-request") return invalidRequest()
  }
  return json({ error: "Internal server error" }, 500)
}

async function readJson(request: Request): Promise<unknown> {
  if (!hasSupportedJsonMediaType(request.headers.get("content-type"))) throw new ArchiveServiceError("invalid-request")
  try { return await request.json() } catch { throw new ArchiveServiceError("invalid-request") }
}

async function archiveId(context: ArchiveRouteContext): Promise<string | null> {
  const parsed = archiveIdSchema.safeParse((await context.params).id)
  return parsed.success ? parsed.data : null
}

export function createArchiveHttpHandlers({ authorization, service, trustedOrigins }: ArchiveHttpDependencies) {
  return {
    async listGET(request: Request): Promise<Response> {
      try {
        const authorized = await authorization.requireManager(request.headers)
        if (authorized.response) return authorized.response
        const query = parseArchiveListQuery(new URL(request.url).searchParams)
        if (!query) return invalidRequest()
        return json(await service.listArchives(authorized.user, query))
      } catch (error) { return errorResponse(error) }
    },

    async eligibleGET(request: Request): Promise<Response> {
      try {
        const authorized = await authorization.requireManager(request.headers)
        if (authorized.response) return authorized.response
        if ([...new URL(request.url).searchParams].length > 0) return invalidRequest()
        return json({ reports: await service.listEligibleReports(authorized.user) })
      } catch (error) { return errorResponse(error) }
    },

    async archivePOST(request: Request): Promise<Response> {
      try {
        if (!hasTrustedRequestOrigin(request, trustedOrigins)) return invalidOrigin()
        const authorized = await authorization.requireManager(request.headers)
        if (authorized.response) return authorized.response
        const parsed = archiveReportRequestSchema.safeParse(await readJson(request))
        if (!parsed.success) return invalidRequest()
        return json(await service.archiveReport(authorized.user, parsed.data.reportId), 201)
      } catch (error) { return errorResponse(error) }
    },

    async detailGET(request: Request, context: ArchiveRouteContext): Promise<Response> {
      try {
        const authorized = await authorization.requireManager(request.headers)
        if (authorized.response) return authorized.response
        const id = await archiveId(context)
        if (!id) return invalidRequest()
        return json(await service.getArchive(authorized.user, id))
      } catch (error) { return errorResponse(error) }
    },

    async verifyPOST(request: Request, context: ArchiveRouteContext): Promise<Response> {
      try {
        if (!hasTrustedRequestOrigin(request, trustedOrigins)) return invalidOrigin()
        const authorized = await authorization.requireManager(request.headers)
        if (authorized.response) return authorized.response
        const id = await archiveId(context)
        if (!id) return invalidRequest()
        if (request.body !== null) {
          const body = await readJson(request)
          if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0) return invalidRequest()
        }
        return json(await service.verifyIntegrity(authorized.user, id))
      } catch (error) { return errorResponse(error) }
    },

    async documentGET(request: Request, context: ArchiveRouteContext): Promise<Response> {
      try {
        const authorized = await authorization.requireManager(request.headers)
        if (authorized.response) return authorized.response
        const id = await archiveId(context)
        if (!id) return invalidRequest()
        return json(await service.openArchiveDocument(authorized.user, id))
      } catch (error) { return errorResponse(error) }
    },
  }
}
