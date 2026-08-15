import "dotenv/config"

import { randomBytes, randomInt } from "node:crypto"

import { PrismaNeon } from "@prisma/adapter-neon"
import { hashPassword, verifyPassword } from "better-auth/crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { PrismaClient, UserRole } from "../generated/prisma/client"
import {
  createMunicipalAuth,
  type MunicipalAuth,
  type PasswordVerifier,
} from "../lib/auth/config"
import { createMunicipalAuthHttpHandlers } from "../lib/auth/http-handlers"
import {
  deriveCitizenAuthIdentity,
  deriveStaffAuthIdentity,
} from "../lib/auth/identifiers"
import { requireSafeTestDatabaseUrl } from "../lib/db/test-database-url"

const APP_ORIGIN = "https://municipal.example.test"
const UNTRUSTED_ORIGIN = "https://untrusted.example.test"
const TEST_SECRET = "phase-2b2a-integration-secret-with-thirty-two-characters"
const TRUSTED_PROXY_IP = "203.0.113.20"
const RUN_ID = randomBytes(6).toString("hex")
const PREFIX = `phase2b2a-${RUN_ID}-`
const DISTRICT_ID = "al-naeem"
const CLIENT_IPS = Array.from({ length: 80 }, (_, index) => `198.20.${Number.parseInt(RUN_ID.slice(0, 2), 16)}.${index + 1}`)
const createdUserIds = new Set<string>()

let database: PrismaClient
let clientIpIndex = 0
let citizenPhone: string
let citizenPassword: string
let citizenUserId: string
let managerEmployeeId: string
let managerPassword: string
let crewEmployeeId: string
let crewPassword: string
let wrongRoleEmployeeId: string
let wrongRolePassword: string
let inactiveEmployeeId: string
let inactivePassword: string
let passwordlessPhone: string

function authentication(passwordVerifier?: PasswordVerifier): MunicipalAuth {
  return createMunicipalAuth({
    database,
    baseURL: APP_ORIGIN,
    secret: TEST_SECRET,
    trustedOrigins: [APP_ORIGIN],
    trustedProxyCidrs: [`${TRUSTED_PROXY_IP}/32`],
    secureCookies: true,
    passwordVerifier,
  })
}

function generatedPassword(): string {
  return `P-${randomBytes(24).toString("base64url")}`
}

function generatedSaudiPhone(): string {
  return `+96650${String(randomInt(0, 10_000_000)).padStart(7, "0")}`
}

function nextClientIp(): string {
  const value = CLIENT_IPS[clientIpIndex++]
  if (!value) throw new Error("The Phase 2B2A test exhausted its reserved client IP pool")
  return value
}

async function facadeRequest(
  endpoint: string,
  options: {
    auth?: MunicipalAuth
    body?: Record<string, unknown>
    clientIp?: string
    contentType?: string | null
    cookie?: string
    database?: PrismaClient
    headers?: Record<string, string>
    method?: "DELETE" | "GET" | "POST" | "PUT"
    origin?: string
    rawBody?: string
    rawUrl?: string
    segments?: string[]
  } = {},
): Promise<Response> {
  const clientIp = options.clientIp ?? nextClientIp()
  const headers = new Headers({
    "x-forwarded-for": `${clientIp}, ${TRUSTED_PROXY_IP}`,
    ...options.headers,
  })
  const requestBody =
    options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body))
  if (options.contentType === null) {
    headers.delete("content-type")
  } else if (options.contentType !== undefined) {
    headers.set("content-type", options.contentType)
  } else if (requestBody !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json")
  }
  if (options.cookie) headers.set("cookie", options.cookie)
  if (options.origin) headers.set("origin", options.origin)

  const request = new Request(options.rawUrl ?? `${APP_ORIGIN}/api/auth/${endpoint}`, {
    method: options.method ?? "POST",
    headers,
    body: requestBody,
  })
  const handlers = createMunicipalAuthHttpHandlers({
    auth: options.auth ?? authentication(),
    database: options.database ?? database,
  })
  return handlers.handle(request, {
    params: Promise.resolve({ all: options.segments ?? endpoint.split("/") }),
  })
}

function transformSuccessfulCredentialResponse(
  transform: (response: Response) => Promise<Response> | Response,
): MunicipalAuth {
  const base = authentication()
  return new Proxy(base, {
    get(target, property, receiver) {
      if (property !== "handler") return Reflect.get(target, property, receiver)
      return async (request: Request) => {
        const response = await target.handler(request)
        const path = new URL(request.url).pathname
        if (
          response.ok &&
          (path === "/api/auth/sign-in/username" || path === "/api/auth/sign-up/email")
        ) {
          return transform(response)
        }
        return response
      }
    },
  })
}

function facadeDatabaseWithSafeUserTransform(
  transform: (user: unknown) => Promise<unknown> | unknown,
  options: { rejectExactSessionDelete?: boolean } = {},
): PrismaClient {
  const userDelegate = new Proxy(database.user, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown
      if (property === "findUnique") {
        return async (...args: unknown[]) => {
          const user = await Reflect.apply(
            value as (...parameters: unknown[]) => Promise<unknown>,
            target,
            args,
          )
          return transform(user)
        }
      }
      return typeof value === "function" ? value.bind(target) : value
    },
  })

  const authSessionDelegate = new Proxy(database.authSession, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown
      if (property === "deleteMany" && options.rejectExactSessionDelete) {
        return async () => {
          throw new Error("Injected exact-session cleanup failure")
        }
      }
      return typeof value === "function" ? value.bind(target) : value
    },
  })

  return new Proxy(database, {
    get(target, property, receiver) {
      if (property === "user") return userDelegate
      if (property === "authSession") return authSessionDelegate
      return Reflect.get(target, property, receiver)
    },
  })
}

function sessionCookie(response: Response): string {
  const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token="))
  if (!cookie) throw new Error("Expected a session cookie")
  return cookie.split(";", 1)[0]
}

function validSessionSetCookies(response: Response): string[] {
  return response.headers
    .getSetCookie()
    .filter((cookie) => cookie.includes("session_token=") && !/session_token=;/i.test(cookie))
    .filter((cookie) => !/Max-Age=0/i.test(cookie))
}

async function createCredentialUser(data: {
  id: string
  name: string
  role: UserRole
  employeeId: string
  password: string
  isActive?: boolean
}): Promise<void> {
  const identity = deriveStaffAuthIdentity(data.employeeId)
  await database.user.create({
    data: {
      id: data.id,
      name: data.name,
      authEmail: identity.internalEmail,
      authUsername: identity.username,
      authDisplayUsername: identity.displayUsername,
      employeeId: identity.normalizedIdentifier,
      role: data.role,
      isActive: data.isActive ?? true,
      districtId: DISTRICT_ID,
      authAccounts: {
        create: {
          accountId: data.id,
          providerId: "credential",
          password: await hashPassword(data.password),
        },
      },
    },
  })
}

async function cleanup(): Promise<void> {
  requireSafeTestDatabaseUrl()
  if (!database) return
  await database.report.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await database.user.deleteMany({
    where: {
      OR: [
        { id: { startsWith: PREFIX } },
        ...(createdUserIds.size > 0 ? [{ id: { in: [...createdUserIds] } }] : []),
      ],
    },
  })
  createdUserIds.clear()
  const rateLimitKeys = CLIENT_IPS.flatMap((clientIp) =>
    ["/sign-up/email", "/sign-in/username", "/get-session", "/sign-out"].map(
      (path) => `${clientIp}|${path}`,
    ),
  )
  await database.authRateLimit.deleteMany({ where: { key: { in: rateLimitKeys } } })
}

describe("Phase 2B2A municipal authentication facade", { timeout: 90_000 }, () => {
  beforeAll(async () => {
    const connectionString = requireSafeTestDatabaseUrl()
    database = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) })
    await cleanup()

    citizenPhone = generatedSaudiPhone()
    citizenPassword = generatedPassword()
    citizenUserId = `${PREFIX}citizen`
    managerEmployeeId = `M-${RUN_ID.toUpperCase()}`
    managerPassword = generatedPassword()
    crewEmployeeId = `C-${RUN_ID.toUpperCase()}`
    crewPassword = generatedPassword()
    wrongRoleEmployeeId = `X-${RUN_ID.toUpperCase()}`
    wrongRolePassword = generatedPassword()
    inactiveEmployeeId = `I-${RUN_ID.toUpperCase()}`
    inactivePassword = generatedPassword()
    passwordlessPhone = generatedSaudiPhone()

    const citizenIdentity = deriveCitizenAuthIdentity(citizenPhone)
    await database.user.create({
      data: {
        id: citizenUserId,
        name: "Existing Credentialed Citizen",
        authEmail: citizenIdentity.internalEmail,
        authUsername: citizenIdentity.username,
        authDisplayUsername: citizenIdentity.displayUsername,
        phone: citizenIdentity.normalizedIdentifier,
        role: UserRole.Citizen,
        districtId: DISTRICT_ID,
        authAccounts: {
          create: {
            accountId: citizenUserId,
            providerId: "credential",
            password: await hashPassword(citizenPassword),
          },
        },
      },
    })

    await createCredentialUser({
      id: `${PREFIX}manager`,
      name: "Phase 2B2A Manager",
      role: UserRole.Manager,
      employeeId: managerEmployeeId,
      password: managerPassword,
    })
    await createCredentialUser({
      id: `${PREFIX}crew`,
      name: "Phase 2B2A Crew",
      role: UserRole.Crew,
      employeeId: crewEmployeeId,
      password: crewPassword,
    })
    await createCredentialUser({
      id: `${PREFIX}wrong-role`,
      name: "Wrong Namespace Role",
      role: UserRole.Citizen,
      employeeId: wrongRoleEmployeeId,
      password: wrongRolePassword,
    })
    await createCredentialUser({
      id: `${PREFIX}inactive`,
      name: "Inactive Manager",
      role: UserRole.Manager,
      employeeId: inactiveEmployeeId,
      password: inactivePassword,
      isActive: false,
    })

    const passwordlessIdentity = deriveCitizenAuthIdentity(passwordlessPhone)
    const passwordlessUserId = `${PREFIX}passwordless`
    await database.user.create({
      data: {
        id: passwordlessUserId,
        name: "Existing Passwordless Citizen",
        authEmail: passwordlessIdentity.internalEmail,
        authUsername: passwordlessIdentity.username,
        authDisplayUsername: passwordlessIdentity.displayUsername,
        phone: passwordlessIdentity.normalizedIdentifier,
        role: UserRole.Citizen,
        districtId: DISTRICT_ID,
      },
    })
    await database.report.create({
      data: {
        id: `${PREFIX}owned-report`,
        authorId: passwordlessUserId,
        districtId: DISTRICT_ID,
        title: "Ownership must remain unchanged",
        description: "Authentication must not claim municipal data.",
        category: "pothole",
        latitude: 21.6,
        longitude: 39.1,
      },
    })
  }, 90_000)

  afterAll(async () => {
    if (!database) return
    await cleanup()
    await database.$disconnect()
  }, 90_000)

  it("registers exactly one Citizen and returns only a safe DTO and secure cookie", async () => {
    const registrationPhone = generatedSaudiPhone()
    const registrationPassword = generatedPassword()
    const before = {
      users: await database.user.count(),
      accounts: await database.authAccount.count(),
      sessions: await database.authSession.count(),
    }
    const response = await facadeRequest("municipal", {
      origin: APP_ORIGIN,
      body: {
        operation: "citizen-register",
        name: "Facade Citizen",
        phone: registrationPhone,
        districtId: DISTRICT_ID,
        password: registrationPassword,
        confirmPassword: registrationPassword,
      },
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { user: { id: string; role: UserRole }; destination: string }
    const registeredUserId = body.user.id
    createdUserIds.add(registeredUserId)
    expect(body).toMatchObject({
      user: { id: registeredUserId, name: "Facade Citizen", role: UserRole.Citizen },
      destination: "/citizen-app",
    })
    expect(JSON.stringify(body)).not.toMatch(/authEmail|username|password|accountId|token|session|employeeId|isActive/)

    const cookies = response.headers.getSetCookie().join(";")
    expect(cookies).toMatch(/HttpOnly/i)
    expect(cookies).toMatch(/Secure/i)
    expect(cookies).toMatch(/SameSite=Lax/i)
    expect(await database.user.count()).toBe(before.users + 1)
    expect(await database.authAccount.count()).toBe(before.accounts + 1)
    expect(await database.authSession.count()).toBe(before.sessions + 1)

    const stored = await database.user.findUniqueOrThrow({
      where: { id: registeredUserId },
      include: { authAccounts: true },
    })
    expect(stored).toMatchObject({ role: UserRole.Citizen, isActive: true, employeeId: null })
    expect(stored.authAccounts).toHaveLength(1)
    await expect(
      verifyPassword({ hash: stored.authAccounts[0]?.password ?? "", password: registrationPassword }),
    ).resolves.toBe(true)
  })

  it("rejects privileged registration fields before creating authentication records", async () => {
    const before = {
      users: await database.user.count(),
      accounts: await database.authAccount.count(),
      sessions: await database.authSession.count(),
    }
    const response = await facadeRequest("municipal", {
      origin: APP_ORIGIN,
      body: {
        operation: "citizen-register",
        name: "Injection Attempt",
        phone: generatedSaudiPhone(),
        districtId: DISTRICT_ID,
        password: generatedPassword(),
        confirmPassword: generatedPassword(),
        role: "Manager",
        id: `${PREFIX}injected-id`,
        username: deriveStaffAuthIdentity("M-INJECTED").username,
        email: "attacker@example.test",
        employeeId: "M-INJECTED",
        isActive: true,
        account: {},
        session: {},
      },
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      message: "Invalid authentication request",
      code: "INVALID_AUTH_REQUEST",
    })
    expect(await database.user.count()).toBe(before.users)
    expect(await database.authAccount.count()).toBe(before.accounts)
    expect(await database.authSession.count()).toBe(before.sessions)
  })

  it("never claims credentialed or passwordless phone identities or their municipal ownership", async () => {
    const passwordlessUser = await database.user.findUniqueOrThrow({ where: { id: `${PREFIX}passwordless` } })
    const ownedReport = await database.report.findUniqueOrThrow({ where: { id: `${PREFIX}owned-report` } })
    const before = {
      users: await database.user.count(),
      accounts: await database.authAccount.count(),
      sessions: await database.authSession.count(),
    }

    for (const phone of [citizenPhone.replace("+966", "0"), passwordlessPhone.replace("+966", "0")]) {
      const password = generatedPassword()
      const response = await facadeRequest("municipal", {
        origin: APP_ORIGIN,
        body: {
          operation: "citizen-register",
          name: "Claim Attempt",
          phone,
          districtId: DISTRICT_ID,
          password,
          confirmPassword: password,
        },
      })
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        message: "Registration is unavailable",
        code: "REGISTRATION_UNAVAILABLE",
      })
      expect(response.headers.getSetCookie()).toHaveLength(0)
    }

    expect(await database.user.count()).toBe(before.users)
    expect(await database.authAccount.count()).toBe(before.accounts)
    expect(await database.authSession.count()).toBe(before.sessions)
    await expect(database.user.findUniqueOrThrow({ where: { id: passwordlessUser.id } })).resolves.toMatchObject({
      id: passwordlessUser.id,
      phone: passwordlessUser.phone,
      role: passwordlessUser.role,
    })
    await expect(database.report.findUniqueOrThrow({ where: { id: ownedReport.id } })).resolves.toMatchObject({
      authorId: ownedReport.authorId,
    })
  })

  it("rate limits repeated collision attempts through Better Auth database storage", async () => {
    const clientIp = CLIENT_IPS[70]
    if (!clientIp) throw new Error("Expected a reserved rate-limit client")
    const statuses: number[] = []

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const password = generatedPassword()
      const response = await facadeRequest("municipal", {
        clientIp,
        origin: APP_ORIGIN,
        body: {
          operation: "citizen-register",
          name: "Rate Limited Claim",
          phone: passwordlessPhone,
          districtId: DISTRICT_ID,
          password,
          confirmPassword: password,
        },
      })
      statuses.push(response.status)
    }

    expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400])
    expect(statuses[5]).toBe(429)
    await expect(
      database.authRateLimit.findUniqueOrThrow({ where: { key: `${clientIp}|/sign-up/email` } }),
    ).resolves.toMatchObject({ count: 5 })
  })

  it("accepts only supported JSON media types and keeps malformed JSON at 400", async () => {
    for (const contentType of [
      "application/json",
      "application/json; charset=utf-8",
      "Application/JSON ; Charset = UTF-8",
    ]) {
      const response = await facadeRequest("municipal", {
        contentType,
        origin: APP_ORIGIN,
        body: { operation: "citizen-login", phone: citizenPhone, password: citizenPassword },
      })
      expect(response.status, contentType).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        user: { id: citizenUserId, role: UserRole.Citizen },
        destination: "/citizen-app",
      })
    }

    let handlerCalls = 0
    const base = authentication()
    const countingAuth = new Proxy(base, {
      get(target, property, receiver) {
        if (property !== "handler") return Reflect.get(target, property, receiver)
        return async (request: Request) => {
          handlerCalls += 1
          return target.handler(request)
        }
      },
    })
    const before = {
      accounts: await database.authAccount.count(),
      rateLimits: await database.authRateLimit.count(),
      sessions: await database.authSession.count(),
      users: await database.user.count(),
    }
    const malformed = await facadeRequest("municipal", {
      auth: countingAuth,
      contentType: "application/json; charset=utf-8",
      origin: APP_ORIGIN,
      rawBody: "{",
    })

    expect(malformed.status).toBe(400)
    await expect(malformed.json()).resolves.toEqual({
      message: "Invalid authentication request",
      code: "INVALID_AUTH_REQUEST",
    })
    expect(handlerCalls).toBe(0)
    await expect(database.user.count()).resolves.toBe(before.users)
    await expect(database.authAccount.count()).resolves.toBe(before.accounts)
    await expect(database.authSession.count()).resolves.toBe(before.sessions)
    await expect(database.authRateLimit.count()).resolves.toBe(before.rateLimits)
  })

  it("rejects unsupported media types before auth, rate-limit, session, or data side effects", async () => {
    const existingLogin = await facadeRequest("municipal", {
      origin: APP_ORIGIN,
      body: { operation: "citizen-login", phone: citizenPhone, password: citizenPassword },
    })
    const existingCookie = sessionCookie(existingLogin)
    const sessionsBefore = await database.authSession.findMany({
      where: { userId: citizenUserId },
      select: { id: true, token: true },
      orderBy: { id: "asc" },
    })
    const before = {
      accounts: await database.authAccount.count(),
      rateLimits: await database.authRateLimit.count(),
      sessions: await database.authSession.count(),
      users: await database.user.count(),
    }

    let handlerCalls = 0
    const base = authentication()
    const countingAuth = new Proxy(base, {
      get(target, property, receiver) {
        if (property !== "handler") return Reflect.get(target, property, receiver)
        return async (request: Request) => {
          handlerCalls += 1
          return target.handler(request)
        }
      },
    })
    const registrationPassword = generatedPassword()
    const rejectedCases: Array<{
      body: Record<string, unknown>
      contentType?: string | null
      headers?: Record<string, string>
      name: string
    }> = [
      { name: "missing Content-Type", contentType: null, body: { operation: "sign-out" } },
      {
        name: "text/plain",
        headers: { "content-type": "text/plain" },
        body: { operation: "sign-out" },
      },
      {
        name: "form encoding",
        contentType: "application/x-www-form-urlencoded",
        body: { operation: "sign-out" },
      },
      {
        name: "multipart form",
        contentType: "multipart/form-data; boundary=phase2b2a",
        body: { operation: "sign-out" },
      },
      {
        name: "structured JSON suffix",
        contentType: "application/problem+json",
        body: {
          operation: "citizen-register",
          name: "Rejected Media Citizen",
          phone: generatedSaudiPhone(),
          districtId: DISTRICT_ID,
          password: registrationPassword,
          confirmPassword: registrationPassword,
        },
      },
      {
        name: "comma-combined values",
        contentType: "application/json, text/plain",
        body: { operation: "citizen-login", phone: citizenPhone, password: citizenPassword },
      },
      {
        name: "invalid charset parameter",
        contentType: "application/json; charset",
        body: { operation: "citizen-login", phone: citizenPhone, password: citizenPassword },
      },
      {
        name: "non-UTF-8 charset",
        contentType: "application/json; charset=iso-8859-1",
        body: { operation: "citizen-login", phone: citizenPhone, password: citizenPassword },
      },
      {
        name: "ambiguous duplicate charset",
        contentType: "application/json; charset=utf-8; charset=utf-8",
        body: { operation: "citizen-login", phone: citizenPhone, password: citizenPassword },
      },
    ]

    for (const rejected of rejectedCases) {
      const response = await facadeRequest("municipal", {
        auth: countingAuth,
        body: rejected.body,
        contentType: rejected.contentType,
        cookie: existingCookie,
        headers: rejected.headers,
        origin: APP_ORIGIN,
      })
      expect(response.status, rejected.name).toBe(415)
      await expect(response.json()).resolves.toEqual({
        message: "Unsupported media type",
        code: "UNSUPPORTED_MEDIA_TYPE",
      })
      expect(response.headers.getSetCookie(), rejected.name).toHaveLength(0)
    }

    expect(handlerCalls).toBe(0)
    await expect(database.user.count()).resolves.toBe(before.users)
    await expect(database.authAccount.count()).resolves.toBe(before.accounts)
    await expect(database.authSession.count()).resolves.toBe(before.sessions)
    await expect(database.authRateLimit.count()).resolves.toBe(before.rateLimits)
    await expect(
      database.authSession.findMany({
        where: { userId: citizenUserId },
        select: { id: true, token: true },
        orderBy: { id: "asc" },
      }),
    ).resolves.toEqual(sessionsBefore)

    const sessionWithoutContentType = await facadeRequest("municipal", {
      auth: base,
      contentType: null,
      cookie: existingCookie,
      method: "GET",
    })
    expect(sessionWithoutContentType.status).toBe(200)
    await expect(sessionWithoutContentType.json()).resolves.toMatchObject({
      user: { id: citizenUserId, role: UserRole.Citizen },
      destination: "/citizen-app",
    })
  })

  it("logs in Citizen, Manager, and Crew only through their namespaces and live roles", async () => {
    const cases = [
      [{ operation: "citizen-login", phone: citizenPhone, password: citizenPassword }, UserRole.Citizen, "/citizen-app"],
      [{ operation: "staff-login", employeeId: managerEmployeeId, password: managerPassword }, UserRole.Manager, "/manager"],
      [{ operation: "staff-login", employeeId: crewEmployeeId, password: crewPassword }, UserRole.Crew, "/crew"],
    ] as const

    for (const [body, role, destination] of cases) {
      const response = await facadeRequest("municipal", { origin: APP_ORIGIN, body })
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({ user: { role }, destination })
      expect(response.headers.getSetCookie().some((value) => value.includes("session_token="))).toBe(true)
    }

    const genericFailures = [
      { operation: "citizen-login", phone: managerEmployeeId, password: managerPassword },
      { operation: "staff-login", employeeId: citizenPhone, password: citizenPassword },
      { operation: "staff-login", employeeId: wrongRoleEmployeeId, password: wrongRolePassword },
      { operation: "staff-login", employeeId: inactiveEmployeeId, password: inactivePassword },
    ] as const
    const sessionCount = await database.authSession.count()
    for (const body of genericFailures) {
      const response = await facadeRequest("municipal", { origin: APP_ORIGIN, body })
      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({
        message: "Invalid username or password",
        code: "INVALID_USERNAME_OR_PASSWORD",
      })
      expect(response.headers.getSetCookie()).toHaveLength(0)
    }
    expect(await database.authSession.count()).toBe(sessionCount)
  })

  it("revokes only the newly issued session after every post-authentication failure", async () => {
    const existingCitizenLogin = await facadeRequest("municipal", {
      origin: APP_ORIGIN,
      body: { operation: "citizen-login", phone: citizenPhone, password: citizenPassword },
    })
    const existingCitizenCookie = sessionCookie(existingCitizenLogin)
    await facadeRequest("municipal", {
      origin: APP_ORIGIN,
      body: {
        operation: "staff-login",
        employeeId: managerEmployeeId,
        password: managerPassword,
      },
    })

    const missingUserIdAuth = transformSuccessfulCredentialResponse(async (response) => {
      const body = (await response.clone().json()) as { token?: unknown }
      return new Response(JSON.stringify({ token: body.token }), {
        status: response.status,
        headers: response.headers,
      })
    })
    const malformedResponseAuth = transformSuccessfulCredentialResponse(
      (response) => new Response("{", { status: response.status, headers: response.headers }),
    )

    const scenarios: Array<{
      auth?: MunicipalAuth
      database?: PrismaClient
      name: string
    }> = [
      { name: "missing user id", auth: missingUserIdAuth },
      { name: "safe response parsing failure", auth: malformedResponseAuth },
      {
        name: "database reload exception",
        database: facadeDatabaseWithSafeUserTransform(() => {
          throw new Error("Injected safe-user reload failure")
        }),
      },
      { name: "user missing after reload", database: facadeDatabaseWithSafeUserTransform(() => null) },
      {
        name: "role changed after authentication",
        database: facadeDatabaseWithSafeUserTransform((user) => ({
          ...(user as Record<string, unknown>),
          role: UserRole.Manager,
        })),
      },
      {
        name: "user became inactive",
        database: facadeDatabaseWithSafeUserTransform((user) => ({
          ...(user as Record<string, unknown>),
          isActive: false,
        })),
      },
      {
        name: "safe DTO construction failure",
        database: facadeDatabaseWithSafeUserTransform((user) =>
          new Proxy(user as object, {
            get(target, property, receiver) {
              if (property === "name") throw new Error("Injected DTO construction failure")
              return Reflect.get(target, property, receiver)
            },
          }),
        ),
      },
      {
        name: "safe response construction failure",
        database: facadeDatabaseWithSafeUserTransform((user) => ({
          ...(user as Record<string, unknown>),
          name: BigInt(1),
        })),
      },
      {
        name: "unexpected post-authentication validation failure",
        database: facadeDatabaseWithSafeUserTransform((user) => ({
          ...(user as Record<string, unknown>),
          authUsername: "citizen:unexpected",
        })),
      },
    ]

    const municipalCounts = {
      accounts: await database.authAccount.count(),
      reports: await database.report.count(),
      users: await database.user.count(),
    }
    const ownedReport = await database.report.findUniqueOrThrow({
      where: { id: `${PREFIX}owned-report` },
      select: { authorId: true },
    })

    for (const scenario of scenarios) {
      const citizenSessionsBefore = await database.authSession.findMany({
        where: { userId: citizenUserId },
        select: { id: true, token: true },
        orderBy: { id: "asc" },
      })
      const managerSessionsBefore = await database.authSession.findMany({
        where: { userId: `${PREFIX}manager` },
        select: { id: true, token: true },
        orderBy: { id: "asc" },
      })

      const response = await facadeRequest("municipal", {
        auth: scenario.auth,
        cookie: existingCitizenCookie,
        database: scenario.database,
        origin: APP_ORIGIN,
        body: { operation: "citizen-login", phone: citizenPhone, password: citizenPassword },
      })

      expect(response.status, scenario.name).toBe(500)
      await expect(response.json()).resolves.toEqual({
        message: "Authentication service unavailable",
        code: "AUTHENTICATION_SERVICE_ERROR",
      })
      expect(validSessionSetCookies(response), scenario.name).toHaveLength(0)
      expect(
        response.headers
          .getSetCookie()
          .some((cookie) => cookie.includes("session_token=") && /Max-Age=0/i.test(cookie)),
        scenario.name,
      ).toBe(true)
      await expect(
        database.authSession.findMany({
          where: { userId: citizenUserId },
          select: { id: true, token: true },
          orderBy: { id: "asc" },
        }),
        scenario.name,
      ).resolves.toEqual(citizenSessionsBefore)
      await expect(
        database.authSession.findMany({
          where: { userId: `${PREFIX}manager` },
          select: { id: true, token: true },
          orderBy: { id: "asc" },
        }),
        scenario.name,
      ).resolves.toEqual(managerSessionsBefore)
      await expect(
        facadeRequest("municipal", { method: "GET", cookie: existingCitizenCookie }),
        scenario.name,
      ).resolves.toMatchObject({ status: 200 })
      await expect(database.user.count(), scenario.name).resolves.toBe(municipalCounts.users)
      await expect(database.authAccount.count(), scenario.name).resolves.toBe(municipalCounts.accounts)
      await expect(database.report.count(), scenario.name).resolves.toBe(municipalCounts.reports)
      await expect(
        database.report.findUniqueOrThrow({
          where: { id: `${PREFIX}owned-report` },
          select: { authorId: true },
        }),
        scenario.name,
      ).resolves.toEqual(ownedReport)
    }
  }, 90_000)

  it("revokes a registration-created session without deleting its new Citizen or account", async () => {
    const phone = generatedSaudiPhone()
    const password = generatedPassword()
    const identity = deriveCitizenAuthIdentity(phone)
    const authWithMissingUserId = transformSuccessfulCredentialResponse(async (response) => {
      const body = (await response.clone().json()) as { token?: unknown }
      return new Response(JSON.stringify({ token: body.token }), {
        status: response.status,
        headers: response.headers,
      })
    })
    const before = {
      accounts: await database.authAccount.count(),
      sessions: await database.authSession.count(),
      users: await database.user.count(),
    }

    const response = await facadeRequest("municipal", {
      auth: authWithMissingUserId,
      origin: APP_ORIGIN,
      body: {
        operation: "citizen-register",
        name: "Post-auth Failure Citizen",
        phone,
        districtId: DISTRICT_ID,
        password,
        confirmPassword: password,
      },
    })

    expect(response.status).toBe(500)
    expect(validSessionSetCookies(response)).toHaveLength(0)
    const createdUser = await database.user.findUniqueOrThrow({
      where: { authUsername: identity.username },
      include: { authAccounts: true },
    })
    createdUserIds.add(createdUser.id)
    expect(createdUser.role).toBe(UserRole.Citizen)
    expect(createdUser.authAccounts).toHaveLength(1)
    expect(await database.authSession.count({ where: { userId: createdUser.id } })).toBe(0)
    expect(await database.report.count({ where: { authorId: createdUser.id } })).toBe(0)
    expect(await database.user.count()).toBe(before.users + 1)
    expect(await database.authAccount.count()).toBe(before.accounts + 1)
    expect(await database.authSession.count()).toBe(before.sessions)
  })

  it("never reports authentication success when exact-session compensation fails", async () => {
    const base = authentication()
    const cleanupFailingAuth = new Proxy(base, {
      get(target, property, receiver) {
        if (property !== "handler") return Reflect.get(target, property, receiver)
        return async (request: Request) => {
          const path = new URL(request.url).pathname
          if (path === "/api/auth/sign-out") {
            return Response.json({ code: "INTERNAL_SERVER_ERROR" }, { status: 500 })
          }
          const response = await target.handler(request)
          if (response.ok && path === "/api/auth/sign-in/username") {
            const body = (await response.clone().json()) as { token?: unknown }
            return new Response(JSON.stringify({ token: body.token }), {
              status: response.status,
              headers: response.headers,
            })
          }
          return response
        }
      },
    })
    const sessionsBefore = await database.authSession.findMany({
      where: { userId: citizenUserId },
      select: { id: true },
    })

    const response = await facadeRequest("municipal", {
      auth: cleanupFailingAuth,
      database: facadeDatabaseWithSafeUserTransform((user) => user, {
        rejectExactSessionDelete: true,
      }),
      origin: APP_ORIGIN,
      body: { operation: "citizen-login", phone: citizenPhone, password: citizenPassword },
    })

    expect(response.status).toBe(500)
    expect(validSessionSetCookies(response)).toHaveLength(0)
    const sessionsAfter = await database.authSession.findMany({
      where: { userId: citizenUserId },
      select: { id: true },
    })
    expect(sessionsAfter).toHaveLength(sessionsBefore.length + 1)

    const previousIds = new Set(sessionsBefore.map((session) => session.id))
    const injectedSessionIds = sessionsAfter
      .filter((session) => !previousIds.has(session.id))
      .map((session) => session.id)
    await database.authSession.deleteMany({ where: { id: { in: injectedSessionIds } } })
  })

  it("keeps exactly one expensive verification for facade credential failures", async () => {
    const attempts = [
      { operation: "staff-login", employeeId: "not valid!", password: generatedPassword() },
      { operation: "staff-login", employeeId: wrongRoleEmployeeId, password: wrongRolePassword },
      { operation: "staff-login", employeeId: managerEmployeeId, password: generatedPassword() },
    ] as const

    for (const body of attempts) {
      let verificationCount = 0
      const verifier: PasswordVerifier = async (data) => {
        verificationCount += 1
        return verifyPassword(data)
      }
      const response = await facadeRequest("municipal", {
        auth: authentication(verifier),
        origin: APP_ORIGIN,
        body,
      })
      expect(response.status).toBe(401)
      expect(verificationCount).toBe(1)
    }
  })

  it("sanitizes current-session data and retains Better Auth logout transport", async () => {
    const login = await facadeRequest("municipal", {
      origin: APP_ORIGIN,
      body: { operation: "citizen-login", phone: citizenPhone, password: citizenPassword },
    })
    const cookie = sessionCookie(login)
    const session = await facadeRequest("municipal", { method: "GET", cookie })

    expect(session.status).toBe(200)
    const sessionText = await session.text()
    expect(JSON.parse(sessionText)).toMatchObject({
      user: { id: citizenUserId, role: UserRole.Citizen },
      destination: "/citizen-app",
    })
    expect(sessionText).not.toMatch(/authEmail|username|employeeId|password|token|session|isActive/)

    const rejectedLogout = await facadeRequest("municipal", {
      cookie,
      origin: UNTRUSTED_ORIGIN,
      body: { operation: "sign-out" },
    })
    expect(rejectedLogout.status).toBe(403)

    const logout = await facadeRequest("municipal", {
      cookie,
      origin: APP_ORIGIN,
      body: { operation: "sign-out" },
    })
    expect(logout.status).toBe(200)
    const expired = await facadeRequest("municipal", { method: "GET", cookie })
    expect(expired.status).toBe(401)
  })

  it("denies legacy municipal, raw Better Auth, and non-facade paths", async () => {
    for (const [endpoint, rawUrl, segments] of [
      ["municipal/citizen/register", undefined, undefined],
      ["municipal/citizen/login", undefined, undefined],
      ["municipal/staff/login", undefined, undefined],
      ["get-session", undefined, undefined],
      ["sign-out", undefined, undefined],
      ["sign-up/email", undefined, undefined],
      ["sign-in/username", undefined, undefined],
      ["sign-in%2fusername", `${APP_ORIGIN}/api/auth/sign-in%2fusername`, ["sign-in", "username"]],
      ["sign-in//username", `${APP_ORIGIN}/api/auth/sign-in//username`, ["sign-in", "username"]],
      ["SIGN-IN/username", undefined, undefined],
      ["sign-in/%zz", `${APP_ORIGIN}/api/auth/sign-in/%zz`, ["sign-in", "%zz"]],
      ["municipal%2fstaff", `${APP_ORIGIN}/api/auth/municipal%2fstaff`, ["municipal%2fstaff"]],
      ["municipal%5cstaff", `${APP_ORIGIN}/api/auth/municipal%5cstaff`, ["municipal%5cstaff"]],
      ["municipal%252fstaff", `${APP_ORIGIN}/api/auth/municipal%252fstaff`, ["municipal%252fstaff"]],
      ["municipal/%252e%252e", `${APP_ORIGIN}/api/auth/municipal/%252e%252e`, ["municipal", "%252e%252e"]],
      ["municipal//staff", `${APP_ORIGIN}/api/auth/municipal//staff`, ["municipal", "", "staff"]],
    ] as const) {
      const response = await facadeRequest(endpoint, {
        rawUrl,
        segments: segments ? [...segments] : undefined,
        origin: APP_ORIGIN,
        body: { username: "injected", email: "injected@example.test", password: generatedPassword() },
      })
      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toEqual({
        message: "Authentication endpoint not found",
        code: "AUTH_ENDPOINT_NOT_FOUND",
      })
      expect(response.headers.getSetCookie()).toHaveLength(0)
    }

    const wrongMethod = await facadeRequest("municipal", {
      method: "PUT",
      origin: APP_ORIGIN,
    })
    expect(wrongMethod.status).toBe(405)

    const originFailure = await facadeRequest("municipal", {
      origin: UNTRUSTED_ORIGIN,
      body: {
        operation: "staff-login",
        employeeId: managerEmployeeId,
        password: managerPassword,
      },
    })
    expect(originFailure.status).toBe(403)
    expect(originFailure.headers.getSetCookie()).toHaveLength(0)
  })

  it("keeps operation selection in the strict body after URL normalization", async () => {
    for (const rawUrl of [
      `${APP_ORIGIN}/api/auth/municipal/staff/..`,
      `${APP_ORIGIN}/api/auth/municipal/staff/%2e%2e`,
      `${APP_ORIGIN}/api/auth/municipal\\staff\\..`,
    ]) {
      const normalizedRequest = new Request(rawUrl)
      expect(new URL(normalizedRequest.url).pathname.replace(/\/$/, "")).toBe("/api/auth/municipal")

      const response = await facadeRequest("municipal", {
        rawUrl,
        segments: ["municipal"],
        origin: APP_ORIGIN,
        body: {
          operation: "citizen-login",
          phone: citizenPhone,
          password: citizenPassword,
        },
        headers: { "x-municipal-operation": "staff-login" },
      })
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        user: { role: UserRole.Citizen },
        destination: "/citizen-app",
      })
    }

    const queryAndHeaderAttempt = await facadeRequest("municipal", {
      rawUrl: `${APP_ORIGIN}/api/auth/municipal?operation=staff-login`,
      segments: ["municipal"],
      origin: APP_ORIGIN,
      headers: { "x-municipal-operation": "staff-login" },
      body: {
        operation: "citizen-login",
        phone: citizenPhone,
        password: citizenPassword,
      },
    })
    expect(queryAndHeaderAttempt.status).toBe(200)
    await expect(queryAndHeaderAttempt.json()).resolves.toMatchObject({
      user: { role: UserRole.Citizen },
      destination: "/citizen-app",
    })

    const formerlyStaffLookingPath = await facadeRequest("municipal/citizen/../staff/login", {
      rawUrl: `${APP_ORIGIN}/api/auth/municipal/citizen/../staff/login`,
      segments: ["municipal", "staff", "login"],
      origin: APP_ORIGIN,
      body: {
        operation: "citizen-login",
        phone: citizenPhone,
        password: citizenPassword,
      },
    })
    expect(formerlyStaffLookingPath.status).toBe(404)

    const implicitStaffAttempt = await facadeRequest("municipal", {
      origin: APP_ORIGIN,
      body: {
        operation: "citizen-login",
        employeeId: managerEmployeeId,
        password: managerPassword,
      },
    })
    expect(implicitStaffAttempt.status).toBe(400)
  })
})
