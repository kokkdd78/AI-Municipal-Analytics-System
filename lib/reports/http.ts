import type { UserRole } from "../../generated/prisma/client"
import type { ApiAuthorizationResult } from "../auth/authorization-core"
import { hasTrustedRequestOrigin } from "../auth/http-handlers"
import {
  createReportRequestSchema,
  hasSupportedJsonMediaType,
  parseReportListQuery,
  reportIdSchema,
  reportVoteRequestSchema,
} from "./contracts"
import { ReportServiceError } from "./errors"
import type { ReportService } from "./service"

const MUNICIPAL_ROLES = ["Citizen", "Manager", "Crew"] as const

export interface ReportHttpAuthorization {
  requireRole(role: UserRole, headers: Headers): Promise<ApiAuthorizationResult>
  requireAnyRole(roles: readonly UserRole[], headers: Headers): Promise<ApiAuthorizationResult>
}

export interface ReportRouteContext {
  params: Promise<{ id: string }>
}

interface ReportHttpDependencies {
  authorization: ReportHttpAuthorization
  service: ReportService
  trustedOrigins: readonly string[]
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } })
}

function invalidRequest(): Response {
  return json({ error: "Invalid request" }, 400)
}

function invalidOrigin(): Response {
  return json({ error: "Access denied" }, 403)
}

function errorResponse(error: unknown): Response {
  if (error instanceof ReportServiceError) {
    if (error.code === "forbidden") return json({ error: "Access denied" }, 403)
    if (error.code === "not-found") return json({ error: "Report not found" }, 404)
    return invalidRequest()
  }
  return json({ error: "Internal server error" }, 500)
}

async function readJson(request: Request): Promise<unknown> {
  if (!hasSupportedJsonMediaType(request.headers.get("content-type"))) {
    throw new ReportServiceError("invalid-request")
  }
  try {
    return await request.json()
  } catch {
    throw new ReportServiceError("invalid-request")
  }
}

async function readReportId(context: ReportRouteContext): Promise<string> {
  const parsed = reportIdSchema.safeParse((await context.params).id)
  if (!parsed.success) throw new ReportServiceError("invalid-request")
  return parsed.data
}

export function createReportHttpHandlers({ authorization, service, trustedOrigins }: ReportHttpDependencies) {
  return {
    async collectionPOST(request: Request): Promise<Response> {
      try {
        if (!hasTrustedRequestOrigin(request, trustedOrigins)) return invalidOrigin()
        const authorized = await authorization.requireRole("Citizen", request.headers)
        if (authorized.response) return authorized.response

        const parsed = createReportRequestSchema.safeParse(await readJson(request))
        if (!parsed.success) return invalidRequest()
        return json(await service.createReport(authorized.user, parsed.data), 201)
      } catch (error) {
        return errorResponse(error)
      }
    },

    async collectionGET(request: Request): Promise<Response> {
      try {
        const authorized = await authorization.requireAnyRole(MUNICIPAL_ROLES, request.headers)
        if (authorized.response) return authorized.response

        const query = parseReportListQuery(new URL(request.url).searchParams)
        if (!query) return invalidRequest()
        return json(await service.listReports(authorized.user, query))
      } catch (error) {
        return errorResponse(error)
      }
    },

    async detailGET(request: Request, context: ReportRouteContext): Promise<Response> {
      try {
        const authorized = await authorization.requireAnyRole(MUNICIPAL_ROLES, request.headers)
        if (authorized.response) return authorized.response
        return json(await service.getReport(authorized.user, await readReportId(context)))
      } catch (error) {
        return errorResponse(error)
      }
    },

    async votePOST(request: Request, context: ReportRouteContext): Promise<Response> {
      try {
        if (!hasTrustedRequestOrigin(request, trustedOrigins)) return invalidOrigin()
        const authorized = await authorization.requireRole("Citizen", request.headers)
        if (authorized.response) return authorized.response

        if (request.body !== null) {
          const parsed = reportVoteRequestSchema.safeParse(await readJson(request))
          if (!parsed.success) return invalidRequest()
        }
        return json(await service.voteForReport(authorized.user, await readReportId(context)))
      } catch (error) {
        return errorResponse(error)
      }
    },

    async statusGET(request: Request, context: ReportRouteContext): Promise<Response> {
      try {
        const authorized = await authorization.requireAnyRole(MUNICIPAL_ROLES, request.headers)
        if (authorized.response) return authorized.response
        return json(await service.getReportStatus(authorized.user, await readReportId(context)))
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
