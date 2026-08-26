import { hasTrustedRequestOrigin } from "../auth/http-handlers"
import type { ApiAuthorizationResult, AuthenticatedMunicipalUser } from "../auth/authorization-core"

import { reportAssistanceRequestSchema } from "./contracts"

export interface ReportAssistanceAuthorization {
  requireRole(role: "Citizen", headers: Headers): Promise<ApiAuthorizationResult>
}

export interface ReportAssistanceService {
  assist(user: AuthenticatedMunicipalUser, request: unknown): Promise<unknown>
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } })
}

function supportedJson(contentType: string | null): boolean {
  if (!contentType || contentType.length > 256 || contentType.includes(",")) return false
  const parts = contentType.split(";")
  return parts.length <= 2
    && parts[0]?.trim().toLowerCase() === "application/json"
    && (parts.length === 1 || /^charset\s*=\s*(?:utf-8|"utf-8")$/i.test(parts[1]?.trim() ?? ""))
}

export function createReportAssistanceHttpHandlers(dependencies: {
  authorization: ReportAssistanceAuthorization
  service: ReportAssistanceService
  trustedOrigins: readonly string[]
}) {
  return {
    async post(request: Request): Promise<Response> {
      if (!hasTrustedRequestOrigin(request, dependencies.trustedOrigins)) return json({ error: "Access denied" }, 403)
      const authorized = await dependencies.authorization.requireRole("Citizen", request.headers)
      if (authorized.response) return authorized.response
      if (!supportedJson(request.headers.get("content-type"))) return json({ error: "Invalid request" }, 400)
      try {
        const parsed = reportAssistanceRequestSchema.safeParse(await request.json())
        if (!parsed.success) return json({ error: "Invalid request" }, 400)
        return json(await dependencies.service.assist(authorized.user!, parsed.data))
      } catch {
        return json({ error: "Assistance is unavailable" }, 503)
      }
    },
  }
}
