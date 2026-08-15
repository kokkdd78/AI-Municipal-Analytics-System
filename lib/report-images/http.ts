import type { ApiAuthorizationResult } from "../auth/authorization-core"
import { hasTrustedRequestOrigin } from "../auth/http-handlers"
import type { ReportHttpAuthorization, ReportRouteContext } from "../reports/http"
import { reportIdSchema } from "../reports/contracts"
import {
  hasSupportedReportImageMediaType,
  validateReportImageForm,
} from "./contracts"
import { ReportImageServiceError, type ReportImageService } from "./service"

interface ReportImageHttpDependencies {
  authorization: Pick<ReportHttpAuthorization, "requireRole">
  service: ReportImageService
  trustedOrigins: readonly string[]
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } })
}

function serviceError(error: unknown): Response {
  if (error instanceof ReportImageServiceError) {
    if (error.code === "forbidden") return json({ error: "Access denied" }, 403)
    if (error.code === "not-found") return json({ error: "Report not found" }, 404)
    if (error.code === "conflict") return json({ error: "Report image already exists" }, 409)
  }
  return json({ error: "Image service unavailable" }, 500)
}

async function authorizeCitizen(
  authorization: Pick<ReportHttpAuthorization, "requireRole">,
  headers: Headers,
): Promise<ApiAuthorizationResult> {
  return authorization.requireRole("Citizen", headers)
}

export function createReportImageHttpHandlers({
  authorization,
  service,
  trustedOrigins,
}: ReportImageHttpDependencies) {
  return {
    async uploadPOST(request: Request, context: ReportRouteContext): Promise<Response> {
      if (!hasTrustedRequestOrigin(request, trustedOrigins)) return json({ error: "Access denied" }, 403)
      const authorized = await authorizeCitizen(authorization, request.headers)
      if (authorized.response) return authorized.response
      if (!hasSupportedReportImageMediaType(request.headers.get("content-type"))) {
        return json({ error: "Unsupported media type" }, 415)
      }

      const id = reportIdSchema.safeParse((await context.params).id)
      if (!id.success) return json({ error: "Invalid request" }, 400)

      try {
        const validation = await validateReportImageForm(await request.formData())
        if (!validation.ok) {
          return validation.reason === "too-large"
            ? json({ error: "Image is too large" }, 413)
            : json({ error: "Invalid image" }, 400)
        }
        return json(await service.upload(authorized.user, id.data, validation.image), 201)
      } catch (error) {
        return serviceError(error)
      }
    },
  }
}
