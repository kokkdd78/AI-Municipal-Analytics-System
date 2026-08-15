import type { PrismaClient, UserRole } from "../../generated/prisma/client"
import { getCookies } from "better-auth/cookies"
import type { MunicipalAuth } from "./config"
import { deriveCitizenAuthIdentity, deriveStaffAuthIdentity } from "./identifiers"
import { toSafeAuthenticationDto, type SafeAuthenticationDto } from "./session-dto"
import {
  municipalAuthPostSchema,
  type MunicipalAuthPostOperation,
} from "./validation"

const AUTH_BASE_PATH = "/api/auth/"
const INTERNAL_SIGN_UP_PATH = "/sign-up/email"
const INTERNAL_SIGN_IN_PATH = "/sign-in/username"
const INTERNAL_SESSION_PATH = "/get-session"
const INTERNAL_SIGN_OUT_PATH = "/sign-out"

const MUNICIPAL_FACADE_SEGMENT = "municipal"

const SAFE_FORWARD_HEADERS = [
  "cache-control",
  "expires",
  "pragma",
  "retry-after",
  "vary",
  "www-authenticate",
] as const

const SAFE_USER_SELECT = {
  id: true,
  name: true,
  role: true,
  phone: true,
  isActive: true,
  authUsername: true,
  avatarUrl: true,
  departmentId: true,
  district: { select: { id: true, name: true } },
} as const

export interface AuthRouteContext {
  params: Promise<{ all?: string[] }>
}

interface MunicipalAuthHttpDependencies {
  auth: MunicipalAuth
  database: PrismaClient
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json(
    { message, code },
    { status, headers: { "cache-control": "no-store" } },
  )
}

function invalidRequest(): Response {
  return errorResponse(400, "INVALID_AUTH_REQUEST", "Invalid authentication request")
}

function registrationUnavailable(): Response {
  return errorResponse(400, "REGISTRATION_UNAVAILABLE", "Registration is unavailable")
}

function authenticationRequired(): Response {
  return errorResponse(401, "AUTHENTICATION_REQUIRED", "Authentication required")
}

function endpointNotFound(): Response {
  return errorResponse(404, "AUTH_ENDPOINT_NOT_FOUND", "Authentication endpoint not found")
}

function methodNotAllowed(): Response {
  return errorResponse(405, "METHOD_NOT_ALLOWED", "Method not allowed")
}

function unsupportedMediaType(): Response {
  return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Unsupported media type")
}

function serviceUnavailable(): Response {
  return errorResponse(500, "AUTHENTICATION_SERVICE_ERROR", "Authentication service unavailable")
}

function invalidOrigin(): Response {
  return errorResponse(403, "INVALID_ORIGIN", "Invalid origin")
}

export function hasTrustedRequestOrigin(request: Request, trustedOrigins: readonly string[]): boolean {
  const suppliedOrigin = request.headers.get("origin")
  if (
    !suppliedOrigin ||
    suppliedOrigin.length > 512 ||
    suppliedOrigin.includes(",") ||
    !/^[a-z][a-z\d+.-]*:\/\/[^/?#]+$/i.test(suppliedOrigin)
  ) {
    return false
  }

  try {
    const parsed = new URL(suppliedOrigin)
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      parsed.origin === "null"
    ) {
      return false
    }

    return trustedOrigins.some((trustedOrigin) => {
      try {
        const trusted = new URL(trustedOrigin)
        return trusted.origin === parsed.origin
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

export function isMunicipalAuthFacadeRoute(decodedSegments: readonly string[]): boolean {
  return decodedSegments.length === 1 && decodedSegments[0] === MUNICIPAL_FACADE_SEGMENT
}

export function hasSupportedMunicipalJsonMediaType(contentType: string | null): boolean {
  if (!contentType || contentType.length > 256 || contentType.includes(",")) return false

  const parts = contentType.split(";")
  if (parts.length > 2 || parts[0]?.trim().toLowerCase() !== "application/json") return false
  if (parts.length === 1) return true

  const parameter = parts[1]?.trim() ?? ""
  return /^charset\s*=\s*(?:utf-8|"utf-8")$/i.test(parameter)
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

interface InternalRequestOptions {
  body?: Record<string, unknown>
  cookie?: string
  method?: "GET" | "POST"
}

function internalRequest(
  request: Request,
  path: string,
  options: InternalRequestOptions = {},
): Request {
  const url = new URL(request.url)
  url.pathname = `${AUTH_BASE_PATH.slice(0, -1)}${path}`
  url.search = ""
  url.hash = ""

  const headers = new Headers(request.headers)
  headers.delete("content-length")
  if (options.cookie !== undefined) headers.set("cookie", options.cookie)
  if (options.body) headers.set("content-type", "application/json")

  return new Request(url, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
}

function copySafeHeaders(source: Response, target: Headers, includeCookies: boolean): void {
  for (const header of SAFE_FORWARD_HEADERS) {
    const value = source.headers.get(header)
    if (value !== null) target.set(header, value)
  }

  if (includeCookies) {
    for (const cookie of source.headers.getSetCookie()) target.append("set-cookie", cookie)
  }
}

function copyCompensationHeaders(source: Response, target: Headers): void {
  copySafeHeaders(source, target, false)
  for (const cookie of source.headers.getSetCookie()) {
    if (/Max-Age=0(?:;|$)/i.test(cookie)) target.append("set-cookie", cookie)
  }
}

function safeSuccessResponse(source: Response, body: SafeAuthenticationDto): Response {
  const headers = new Headers({ "cache-control": "no-store", "content-type": "application/json" })
  copySafeHeaders(source, headers, true)
  return new Response(JSON.stringify(body), { status: 200, headers })
}

async function responseCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.clone().json()) as { code?: unknown }
    return typeof body.code === "string" ? body.code : null
  } catch {
    return null
  }
}

async function safeAuthFailure(response: Response): Promise<Response> {
  if (response.status >= 500) return serviceUnavailable()
  return response
}

async function internalResponseUserId(response: Response): Promise<string | null> {
  try {
    const body = (await response.clone().json()) as { user?: { id?: unknown } }
    return typeof body.user?.id === "string" ? body.user.id : null
  } catch {
    return null
  }
}

interface IssuedSessionEvidence {
  cookiePair: string | null
  token: string | null
}

function issuedSessionCookie(response: Response, sessionCookieName: string): string | null {
  for (const header of response.headers.getSetCookie()) {
    const cookiePair = header.split(";", 1)[0]?.trim()
    if (cookiePair?.startsWith(`${sessionCookieName}=`)) return cookiePair
  }
  return null
}

async function credentialResponseData(response: Response): Promise<{
  token: string | null
  userId: string | null
}> {
  const body = (await response.clone().json()) as {
    token?: unknown
    user?: { id?: unknown }
  }
  return {
    token: typeof body.token === "string" && body.token.length > 0 ? body.token : null,
    userId: typeof body.user?.id === "string" && body.user.id.length > 0 ? body.user.id : null,
  }
}

function roleMatchesNamespace(role: UserRole, namespace: "citizen" | "staff"): boolean {
  return namespace === "citizen" ? role === "Citizen" : role === "Manager" || role === "Crew"
}

export function createMunicipalAuthHttpHandlers({ auth, database }: MunicipalAuthHttpDependencies) {
  const trustedOrigins = Array.isArray(auth.options.trustedOrigins)
    ? auth.options.trustedOrigins.filter((origin): origin is string => typeof origin === "string")
    : []
  const sessionCookieName = getCookies(auth.options).sessionToken.name

  async function findSafeUser(id: string) {
    return database.user.findUnique({ where: { id }, select: SAFE_USER_SELECT })
  }

  async function newlyIssuedSessionStillExists(
    request: Request,
    evidence: IssuedSessionEvidence,
  ): Promise<boolean> {
    if (evidence.token) {
      return Boolean(
        await database.authSession.findUnique({
          where: { token: evidence.token },
          select: { id: true },
        }),
      )
    }
    if (!evidence.cookiePair) return true

    const response = await auth.handler(
      internalRequest(request, INTERNAL_SESSION_PATH, {
        cookie: evidence.cookiePair,
        method: "GET",
      }),
    )
    if (!response.ok) return true
    return (await response.clone().json()) !== null
  }

  async function compensateNewlyIssuedSession(
    request: Request,
    evidence: IssuedSessionEvidence,
  ): Promise<Response | null> {
    let signOutResponse: Response | null = null

    if (evidence.cookiePair) {
      try {
        signOutResponse = await auth.handler(
          internalRequest(request, INTERNAL_SIGN_OUT_PATH, {
            body: {},
            cookie: evidence.cookiePair,
            method: "POST",
          }),
        )
      } catch {
        signOutResponse = null
      }
    }

    try {
      if (await newlyIssuedSessionStillExists(request, evidence)) {
        if (!evidence.token) return null
        await database.authSession.deleteMany({ where: { token: evidence.token } })
      }
      if (await newlyIssuedSessionStillExists(request, evidence)) return null
      return signOutResponse
    } catch {
      return null
    }
  }

  async function postAuthenticationFailure(
    request: Request,
    evidence: IssuedSessionEvidence,
  ): Promise<Response> {
    const cleanupResponse = await compensateNewlyIssuedSession(request, evidence)
    const failure = serviceUnavailable()
    if (cleanupResponse) copyCompensationHeaders(cleanupResponse, failure.headers)
    return failure
  }

  async function finishCredentialResponse(
    request: Request,
    response: Response,
    expectedUsername: string,
    namespace: "citizen" | "staff",
  ): Promise<Response> {
    if (!response.ok) return safeAuthFailure(response)

    const evidence: IssuedSessionEvidence = {
      cookiePair: issuedSessionCookie(response, sessionCookieName),
      token: null,
    }

    try {
      const responseData = await credentialResponseData(response)
      evidence.token = responseData.token
      if (!evidence.cookiePair && !evidence.token) throw new Error("Missing issued session evidence")
      if (!responseData.userId) throw new Error("Missing authenticated user")

      const user = await findSafeUser(responseData.userId)
      if (
        !user?.isActive ||
        user.authUsername !== expectedUsername ||
        !roleMatchesNamespace(user.role, namespace)
      ) {
        throw new Error("Post-authentication validation failed")
      }

      return safeSuccessResponse(response, toSafeAuthenticationDto(user))
    } catch {
      return postAuthenticationFailure(request, evidence)
    }
  }

  async function registerCitizen(
    request: Request,
    data: Extract<MunicipalAuthPostOperation, { operation: "citizen-register" }>,
  ): Promise<Response> {
    let identity
    try {
      identity = deriveCitizenAuthIdentity(data.phone)
    } catch {
      return invalidRequest()
    }

    const district = await database.district.findUnique({
      where: { id: data.districtId },
      select: { id: true },
    })
    if (!district) return invalidRequest()

    const response = await auth.handler(
      internalRequest(request, INTERNAL_SIGN_UP_PATH, {
        body: {
          name: data.name,
          phone: identity.normalizedIdentifier,
          districtId: district.id,
          password: data.password,
          email: identity.internalEmail,
          username: identity.username,
          displayUsername: identity.displayUsername,
        },
      }),
    )

    if (!response.ok) {
      const code = await responseCode(response)
      if (
        code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" ||
        code === "USERNAME_IS_ALREADY_TAKEN" ||
        code === "REGISTRATION_UNAVAILABLE"
      ) {
        return registrationUnavailable()
      }
      if (response.status === 422 && code === "FAILED_TO_CREATE_USER") {
        const racedIdentity = await database.user.findFirst({
          where: {
            OR: [
              { phone: identity.normalizedIdentifier },
              { authUsername: identity.username },
              { authEmail: identity.internalEmail },
            ],
          },
          select: { id: true },
        })
        return racedIdentity ? registrationUnavailable() : serviceUnavailable()
      }
      return safeAuthFailure(response)
    }

    return finishCredentialResponse(request, response, identity.username, "citizen")
  }

  async function loginCitizen(
    request: Request,
    data: Extract<MunicipalAuthPostOperation, { operation: "citizen-login" }>,
  ): Promise<Response> {
    let username = "invalid"
    try {
      username = deriveCitizenAuthIdentity(data.phone).username
    } catch {
      // The accepted Better Auth hook performs the one constant-work verification.
    }

    const response = await auth.handler(
      internalRequest(request, INTERNAL_SIGN_IN_PATH, {
        body: {
          username,
          password: data.password,
        },
      }),
    )
    return finishCredentialResponse(request, response, username, "citizen")
  }

  async function loginStaff(
    request: Request,
    data: Extract<MunicipalAuthPostOperation, { operation: "staff-login" }>,
  ): Promise<Response> {
    let username = "invalid"
    try {
      username = deriveStaffAuthIdentity(data.employeeId).username
    } catch {
      // The accepted Better Auth hook performs the one constant-work verification.
    }

    const response = await auth.handler(
      internalRequest(request, INTERNAL_SIGN_IN_PATH, {
        body: {
          username,
          password: data.password,
        },
      }),
    )
    return finishCredentialResponse(request, response, username, "staff")
  }

  async function currentSession(request: Request): Promise<Response> {
    const response = await auth.handler(internalRequest(request, INTERNAL_SESSION_PATH))
    if (!response.ok) return safeAuthFailure(response)

    const userId = await internalResponseUserId(response)
    if (!userId) return authenticationRequired()

    const user = await findSafeUser(userId)
    if (!user?.isActive) return authenticationRequired()
    return safeSuccessResponse(response, toSafeAuthenticationDto(user))
  }

  async function handle(request: Request, context: AuthRouteContext): Promise<Response> {
    const { all = [] } = await context.params
    if (!isMunicipalAuthFacadeRoute(all)) return endpointNotFound()

    if (request.method === "GET") return currentSession(request)
    if (request.method !== "POST") return methodNotAllowed()
    if (!hasTrustedRequestOrigin(request, trustedOrigins)) return invalidOrigin()
    if (!hasSupportedMunicipalJsonMediaType(request.headers.get("content-type"))) {
      return unsupportedMediaType()
    }

    const parsed = municipalAuthPostSchema.safeParse(await readJson(request))
    if (!parsed.success) return invalidRequest()

    switch (parsed.data.operation) {
      case "citizen-register":
        return registerCitizen(request, parsed.data)
      case "citizen-login":
        return loginCitizen(request, parsed.data)
      case "staff-login":
        return loginStaff(request, parsed.data)
      case "sign-out":
        return auth.handler(
          internalRequest(request, INTERNAL_SIGN_OUT_PATH, { body: {}, method: "POST" }),
        )
    }

    return invalidRequest()
  }

  return { handle }
}
