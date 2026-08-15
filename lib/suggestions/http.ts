import type { UserRole } from "../../generated/prisma/client"
import type { ApiAuthorizationResult } from "../auth/authorization-core"
import { hasTrustedRequestOrigin } from "../auth/http-handlers"
import { hasSupportedJsonMediaType } from "../reports/contracts"
import type { ReportHttpAuthorization, ReportRouteContext } from "../reports/http"
import {
  createSuggestionRequestSchema,
  suggestionIdSchema,
  suggestionVoteRequestSchema,
} from "./contracts"
import { SuggestionServiceError } from "./errors"
import type { SuggestionService } from "./service"

const MUNICIPAL_ROLES = ["Citizen", "Manager", "Crew"] as const satisfies readonly UserRole[]

interface SuggestionHttpDependencies {
  authorization: ReportHttpAuthorization
  service: SuggestionService
  trustedOrigins: readonly string[]
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } })
}

function errorResponse(error: unknown): Response {
  if (error instanceof SuggestionServiceError) {
    if (error.code === "forbidden") return json({ error: "Access denied" }, 403)
    if (error.code === "not-found") return json({ error: "Suggestion not found" }, 404)
    return json({ error: "Invalid request" }, 400)
  }
  return json({ error: "Internal server error" }, 500)
}

async function authorizedCitizen(
  authorization: ReportHttpAuthorization,
  headers: Headers,
): Promise<ApiAuthorizationResult> {
  return authorization.requireRole("Citizen", headers)
}

async function readStrictJson(request: Request): Promise<unknown> {
  if (!hasSupportedJsonMediaType(request.headers.get("content-type"))) {
    throw new SuggestionServiceError("invalid-request")
  }
  try {
    return await request.json()
  } catch {
    throw new SuggestionServiceError("invalid-request")
  }
}

export function createSuggestionHttpHandlers({ authorization, service, trustedOrigins }: SuggestionHttpDependencies) {
  return {
    async collectionGET(request: Request): Promise<Response> {
      try {
        if (new URL(request.url).searchParams.size !== 0) return json({ error: "Invalid request" }, 400)
        const authorized = await authorization.requireAnyRole(MUNICIPAL_ROLES, request.headers)
        if (authorized.response) return authorized.response
        return json({ suggestions: await service.list(authorized.user) })
      } catch (error) {
        return errorResponse(error)
      }
    },
    async collectionPOST(request: Request): Promise<Response> {
      try {
        if (!hasTrustedRequestOrigin(request, trustedOrigins)) return json({ error: "Access denied" }, 403)
        const authorized = await authorizedCitizen(authorization, request.headers)
        if (authorized.response) return authorized.response
        const parsed = createSuggestionRequestSchema.safeParse(await readStrictJson(request))
        if (!parsed.success) return json({ error: "Invalid request" }, 400)
        return json(await service.create(authorized.user, parsed.data), 201)
      } catch (error) {
        return errorResponse(error)
      }
    },
    async votePOST(request: Request, context: ReportRouteContext): Promise<Response> {
      try {
        if (!hasTrustedRequestOrigin(request, trustedOrigins)) return json({ error: "Access denied" }, 403)
        const authorized = await authorizedCitizen(authorization, request.headers)
        if (authorized.response) return authorized.response
        const id = suggestionIdSchema.safeParse((await context.params).id)
        if (!id.success) return json({ error: "Invalid request" }, 400)
        if (request.body !== null) {
          const body = suggestionVoteRequestSchema.safeParse(await readStrictJson(request))
          if (!body.success) return json({ error: "Invalid request" }, 400)
        }
        return json(await service.vote(authorized.user, id.data))
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
