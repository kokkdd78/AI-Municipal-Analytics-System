import "dotenv/config"

import { randomBytes, randomInt } from "node:crypto"

import { PrismaNeon } from "@prisma/adapter-neon"
import { verifyPassword } from "better-auth/crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { PrismaClient, UserRole } from "../generated/prisma/client"
import {
  createMunicipalAuth,
  type MunicipalAuth,
  type PasswordVerifier,
} from "../lib/auth/config"
import {
  deriveCitizenAuthIdentity,
  deriveExistingUserAuthEmail,
  deriveStaffAuthIdentity,
} from "../lib/auth/identifiers"
import { requireSafeTestDatabaseUrl } from "../lib/db/test-database-url"
import { provisionTestCredential } from "../scripts/test-auth-provisioning"

const APP_ORIGIN = "http://localhost:3000"
const UNTRUSTED_ORIGIN = "https://untrusted.example.test"
const TEST_SECRET = "integration-only-secret-with-at-least-thirty-two-characters"
const RUN_ID = randomBytes(6).toString("hex")
const PREFIX = `phase2b-auth-${RUN_ID}-`
const DISTRICT_ID = "al-naeem"
const TRUSTED_PROXY_IP = "203.0.113.10"
const TRUSTED_PROXY_CIDRS = [`${TRUSTED_PROXY_IP}/32`]
const RATE_LIMIT_PATHS = ["/sign-up/email", "/sign-in/username", "/get-session", "/sign-out"]
const RUN_NETWORK_OCTET = Number.parseInt(RUN_ID.slice(0, 2), 16)
const AUTOMATIC_CLIENT_IPS = Array.from(
  { length: 100 },
  (_, index) => `198.19.${RUN_NETWORK_OCTET}.${index + 1}`,
)
const PERSISTENT_RATE_CLIENT = `198.18.${RUN_NETWORK_OCTET}.42`
const SEPARATE_RATE_CLIENT = `198.18.${RUN_NETWORK_OCTET}.43`

let database: PrismaClient
let citizenPhone: string
let citizenPassword: string
let citizenUserId: string
let managerUserId: string
let crewUserId: string
let injectedCrewCitizenUserId: string
let requestIpCounter = 1
const rateLimitClientIps = new Set<string>([
  ...AUTOMATIC_CLIENT_IPS,
  PERSISTENT_RATE_CLIENT,
  SEPARATE_RATE_CLIENT,
])

function authentication(passwordVerifier?: PasswordVerifier): MunicipalAuth {
  return createMunicipalAuth({
    database,
    baseURL: APP_ORIGIN,
    secret: TEST_SECRET,
    trustedOrigins: [APP_ORIGIN],
    trustedProxyCidrs: TRUSTED_PROXY_CIDRS,
    secureCookies: false,
    passwordVerifier,
  })
}

function generatedPassword(): string {
  return `T-${randomBytes(24).toString("base64url")}`
}

function generatedSaudiPhone(): string {
  return `+96650${String(randomInt(0, 10_000_000)).padStart(7, "0")}`
}

async function authRequest(
  auth: MunicipalAuth,
  path: string,
  options: {
    body?: Record<string, unknown>
    cookie?: string
    origin?: string
    method?: "GET" | "POST"
    clientIp?: string
    forwardedFor?: string
  } = {},
): Promise<Response> {
  const headers = new Headers()
  if (options.body) headers.set("content-type", "application/json")
  if (options.cookie) headers.set("cookie", options.cookie)
  if (options.origin) headers.set("origin", options.origin)
  const clientIp = options.clientIp ?? AUTOMATIC_CLIENT_IPS[requestIpCounter++ - 1]
  if (!clientIp) throw new Error("The authentication test exhausted its reserved client IP pool")
  rateLimitClientIps.add(clientIp)
  headers.set("x-forwarded-for", options.forwardedFor ?? `${clientIp}, ${TRUSTED_PROXY_IP}`)

  return auth.handler(
    new Request(`${APP_ORIGIN}/api/auth${path}`, {
      method: options.method ?? "POST",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }),
  )
}

function sessionCookie(response: Response): string {
  const cookies = response.headers.getSetCookie()
  const session = cookies.find((value) => value.includes("session_token="))
  if (!session) throw new Error("Expected an authentication session cookie")
  return session.split(";", 1)[0]
}

async function signIn(
  username: string,
  password: string,
  auth: MunicipalAuth = authentication(),
): Promise<Response> {
  return authRequest(auth, "/sign-in/username", {
    body: { username, password },
    origin: APP_ORIGIN,
  })
}

async function cleanup(): Promise<void> {
  requireSafeTestDatabaseUrl()
  if (!database) return

  const knownUserIds = [citizenUserId, injectedCrewCitizenUserId, managerUserId, crewUserId].filter(Boolean)
  if (knownUserIds.length > 0) await database.user.deleteMany({ where: { id: { in: knownUserIds } } })
  await database.user.deleteMany({ where: { id: { startsWith: PREFIX } } })
  const rateLimitKeys = [...rateLimitClientIps].flatMap((clientIp) =>
    RATE_LIMIT_PATHS.map((path) => `${clientIp}|${path}`),
  )
  if (rateLimitKeys.length > 0) {
    await database.authRateLimit.deleteMany({ where: { key: { in: rateLimitKeys } } })
  }
}

describe("Phase 2B1 Better Auth backend", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    const testConnectionString = requireSafeTestDatabaseUrl()
    database = new PrismaClient({ adapter: new PrismaNeon({ connectionString: testConnectionString }) })
    await cleanup()
    citizenPhone = generatedSaudiPhone()
    citizenPassword = generatedPassword()
  })

  afterAll(async () => {
    if (!database) return
    await cleanup()
    await database.$disconnect()
  })

  it("forces every public registration to Citizen and stores only an account password hash", async () => {
    const identity = deriveCitizenAuthIdentity(citizenPhone)
    const response = await authRequest(authentication(), "/sign-up/email", {
      origin: APP_ORIGIN,
      body: {
        name: "Phase 2B Citizen",
        phone: citizenPhone,
        districtId: DISTRICT_ID,
        password: citizenPassword,
        email: "attacker@example.test",
        username: deriveStaffAuthIdentity("M-INJECTED").username,
        role: "Manager",
        isActive: false,
        employeeId: "M-INJECTED",
        departmentId: "department-roads",
        passwordHash: "plaintext-attempt",
      },
    })

    expect(response.status).toBe(200)
    const user = await database.user.findUniqueOrThrow({
      where: { authUsername: identity.username },
      include: { authAccounts: true },
    })
    citizenUserId = user.id

    expect(user).toMatchObject({
      authEmail: identity.internalEmail,
      authUsername: identity.username,
      authDisplayUsername: identity.displayUsername,
      phone: identity.normalizedIdentifier,
      role: UserRole.Citizen,
      isActive: true,
      employeeId: null,
      departmentId: null,
      passwordHash: null,
    })
    expect(user.authAccounts).toHaveLength(1)
    expect(user.authAccounts[0]).toMatchObject({ providerId: "credential", accountId: user.id })
    expect(user.authAccounts[0]?.password).toBeTruthy()
    expect(user.authAccounts[0]?.password).not.toBe(citizenPassword)
    await expect(
      verifyPassword({ hash: user.authAccounts[0]?.password ?? "", password: citizenPassword }),
    ).resolves.toBe(true)
    const responseBody = await response.clone().text()
    expect(responseBody.includes(citizenPassword)).toBe(false)
    expect(responseBody.includes(user.authAccounts[0]?.password ?? "missing-hash")).toBe(false)

    const rawCookie = response.headers.getSetCookie().join(";")
    expect(rawCookie).toMatch(/HttpOnly/i)
    expect(rawCookie).toMatch(/SameSite=Lax/i)

    const crewInjectionIdentity = deriveCitizenAuthIdentity(generatedSaudiPhone())
    const crewInjectionResponse = await authRequest(authentication(), "/sign-up/email", {
      origin: APP_ORIGIN,
      body: {
        name: "Crew Injection Attempt",
        phone: crewInjectionIdentity.normalizedIdentifier,
        districtId: DISTRICT_ID,
        password: generatedPassword(),
        role: "Crew",
        id: `${PREFIX}injected-id`,
        isActive: false,
        employeeId: `C-${RUN_ID.toUpperCase()}`,
      },
    })
    expect(crewInjectionResponse.status).toBe(200)
    const injectedUser = await database.user.findUniqueOrThrow({
      where: { authUsername: crewInjectionIdentity.username },
    })
    injectedCrewCitizenUserId = injectedUser.id
    expect(injectedUser).toMatchObject({
      role: UserRole.Citizen,
      isActive: true,
      employeeId: null,
    })
    expect(injectedUser.id).not.toBe(`${PREFIX}injected-id`)
  })

  it("does not duplicate a normalized citizen phone or reveal an existing account", async () => {
    const equivalentPhone = citizenPhone.replace("+966", "0")
    const response = await authRequest(authentication(), "/sign-up/email", {
      origin: APP_ORIGIN,
      body: {
        name: "Duplicate Attempt",
        phone: equivalentPhone,
        districtId: DISTRICT_ID,
        password: generatedPassword(),
      },
    })

    const identity = deriveCitizenAuthIdentity(citizenPhone)
    expect(await database.user.count({ where: { authUsername: identity.username } })).toBe(1)
    expect(await database.user.findUniqueOrThrow({ where: { id: citizenUserId } })).toMatchObject({
      name: "Phase 2B Citizen",
    })
    expect((await response.text()).toLowerCase()).not.toMatch(/already exists|user exists|registered/)
  })

  it("provisions password credentials only for existing staff and preserves database roles", async () => {
    managerUserId = `${PREFIX}manager`
    crewUserId = `${PREFIX}crew`
    const managerEmployeeId = `M-${RUN_ID.toUpperCase()}`
    const crewEmployeeId = `C-${RUN_ID.toUpperCase()}`
    const managerPassword = generatedPassword()
    const crewPassword = generatedPassword()

    await database.user.createMany({
      data: [
        {
          id: managerUserId,
          name: "Phase 2B Manager",
          authEmail: deriveExistingUserAuthEmail(managerUserId),
          employeeId: managerEmployeeId,
          role: UserRole.Manager,
          districtId: DISTRICT_ID,
        },
        {
          id: crewUserId,
          name: "Phase 2B Crew",
          authEmail: deriveExistingUserAuthEmail(crewUserId),
          employeeId: crewEmployeeId,
          role: UserRole.Crew,
          districtId: DISTRICT_ID,
        },
      ],
    })

    await provisionTestCredential(managerUserId, managerPassword)
    await provisionTestCredential(crewUserId, crewPassword)

    const managerIdentity = deriveStaffAuthIdentity(managerEmployeeId)
    const crewIdentity = deriveStaffAuthIdentity(crewEmployeeId)
    expect((await signIn(managerIdentity.username, managerPassword)).status).toBe(200)
    expect((await signIn(crewIdentity.username, crewPassword)).status).toBe(200)
    expect(await database.user.findUniqueOrThrow({ where: { id: managerUserId } })).toMatchObject({
      id: managerUserId,
      role: UserRole.Manager,
      authUsername: managerIdentity.username,
      passwordHash: null,
    })
    expect(await database.user.findUniqueOrThrow({ where: { id: crewUserId } })).toMatchObject({
      id: crewUserId,
      role: UserRole.Crew,
      authUsername: crewIdentity.username,
      passwordHash: null,
    })
    await expect(provisionTestCredential(managerUserId, generatedPassword())).rejects.toThrow(
      "Test credential provisioning was refused",
    )
  })

  it("performs exactly one password verification for every generic credential failure", async () => {
    const identity = deriveCitizenAuthIdentity(citizenPhone)
    const unknownIdentity = deriveCitizenAuthIdentity(generatedSaudiPhone())
    const passwordlessIdentity = deriveStaffAuthIdentity(`P-${RUN_ID.toUpperCase()}`)
    const passwordlessUserId = `${PREFIX}passwordless`
    await database.user.create({
      data: {
        id: passwordlessUserId,
        name: "Passwordless Test User",
        authEmail: deriveExistingUserAuthEmail(passwordlessUserId),
        authUsername: passwordlessIdentity.username,
        authDisplayUsername: passwordlessIdentity.displayUsername,
        employeeId: passwordlessIdentity.normalizedIdentifier,
        role: UserRole.Crew,
        districtId: DISTRICT_ID,
      },
    })

    async function countedAttempt(username: string, password: string) {
      let verificationCount = 0
      const countedVerifier: PasswordVerifier = async (data) => {
        verificationCount += 1
        return verifyPassword(data)
      }
      const response = await signIn(username, password, authentication(countedVerifier))
      return { response, verificationCount }
    }

    const sessionCountBefore = await database.authSession.count()
    const wrongPassword = await countedAttempt(identity.username, generatedPassword())
    const unknownAccount = await countedAttempt(unknownIdentity.username, generatedPassword())
    const wrongNamespace = await countedAttempt("manager_injected", generatedPassword())
    const passwordlessAccount = await countedAttempt(passwordlessIdentity.username, generatedPassword())

    await database.user.update({ where: { id: citizenUserId }, data: { isActive: false } })
    let inactiveAccount
    try {
      inactiveAccount = await countedAttempt(identity.username, citizenPassword)
    } finally {
      await database.user.update({ where: { id: citizenUserId }, data: { isActive: true } })
    }

    const attempts = [wrongNamespace, unknownAccount, inactiveAccount, passwordlessAccount, wrongPassword]
    expect(attempts.map(({ response }) => response.status)).toEqual([401, 401, 401, 401, 401])
    expect(attempts.map(({ verificationCount }) => verificationCount)).toEqual([1, 1, 1, 1, 1])
    const results = await Promise.all(
      attempts.map(async ({ response }) => {
        const responseText = await response.text()
        const body = JSON.parse(responseText) as unknown
        expect(response.headers.getSetCookie()).toHaveLength(0)
        return {
          body,
          responseText,
          responseLength: new TextEncoder().encode(responseText).byteLength,
          headers: {
            contentType: response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? null,
            contentLength: response.headers.get("content-length"),
            cacheControl: response.headers.get("cache-control"),
            pragma: response.headers.get("pragma"),
            expires: response.headers.get("expires"),
            wwwAuthenticate: response.headers.get("www-authenticate"),
            authenticationInfo: response.headers.get("authentication-info"),
          },
        }
      }),
    )
    const canonicalBody = {
      message: "Invalid username or password",
      code: "INVALID_USERNAME_OR_PASSWORD",
    }
    const canonicalWrongPasswordResult = results[4]
    expect(canonicalWrongPasswordResult).toBeDefined()
    if (!canonicalWrongPasswordResult) throw new Error("Expected the active-account wrong-password result")
    for (const result of results) {
      expect(result.body).toEqual(canonicalBody)
      expect(result.responseText).toBe(canonicalWrongPasswordResult.responseText)
      expect(result.responseLength).toBe(canonicalWrongPasswordResult.responseLength)
      expect(result.headers).toEqual(canonicalWrongPasswordResult.headers)
      expect(result.headers.contentType).toBe("application/json")
    }
    expect(await database.authSession.count()).toBe(sessionCountBefore)
  })

  it("persists proxy-safe login rate limits across Better Auth instances", async () => {
    const username = deriveCitizenAuthIdentity(generatedSaudiPhone()).username
    const statuses: number[] = []
    const firstAuthInstance = authentication()

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await authRequest(firstAuthInstance, "/sign-in/username", {
        origin: APP_ORIGIN,
        clientIp: PERSISTENT_RATE_CLIENT,
        forwardedFor: `192.0.2.${attempt + 10}, ${PERSISTENT_RATE_CLIENT}, ${TRUSTED_PROXY_IP}`,
        body: { username, password: generatedPassword() },
      })
      statuses.push(response.status)
    }

    await expect(
      database.authRateLimit.findUniqueOrThrow({
        where: { key: `${PERSISTENT_RATE_CLIENT}|/sign-in/username` },
      }),
    ).resolves.toMatchObject({ count: 3 })

    const secondAuthInstance = authentication()
    for (let attempt = 3; attempt < 6; attempt += 1) {
      const response = await authRequest(secondAuthInstance, "/sign-in/username", {
        origin: APP_ORIGIN,
        clientIp: PERSISTENT_RATE_CLIENT,
        forwardedFor: `192.0.2.${attempt + 10}, ${PERSISTENT_RATE_CLIENT}, ${TRUSTED_PROXY_IP}`,
        body: { username, password: generatedPassword() },
      })
      statuses.push(response.status)
    }

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401])
    expect(statuses[5]).toBe(429)
    await expect(
      database.authRateLimit.findUniqueOrThrow({
        where: { key: `${PERSISTENT_RATE_CLIENT}|/sign-in/username` },
      }),
    ).resolves.toMatchObject({ count: 5 })

    const separateClient = await authRequest(authentication(), "/sign-in/username", {
      origin: APP_ORIGIN,
      clientIp: SEPARATE_RATE_CLIENT,
      forwardedFor: `${SEPARATE_RATE_CLIENT}, ${TRUSTED_PROXY_IP}`,
      body: { username, password: generatedPassword() },
    })
    expect(separateClient.status).toBe(401)
    await expect(
      database.authRateLimit.findUniqueOrThrow({
        where: { key: `${SEPARATE_RATE_CLIENT}|/sign-in/username` },
      }),
    ).resolves.toMatchObject({ count: 1 })
  })

  it("uses fixed eight-hour database sessions and revokes them on logout", async () => {
    const identity = deriveCitizenAuthIdentity(citizenPhone)
    const login = await signIn(identity.username, citizenPassword)
    expect(login.status).toBe(200)
    const cookie = sessionCookie(login)

    const session = await database.authSession.findFirstOrThrow({
      where: { userId: citizenUserId },
      orderBy: { createdAt: "desc" },
    })
    expect(session.expiresAt.getTime() - session.createdAt.getTime()).toBeGreaterThanOrEqual(28_799_000)
    expect(session.expiresAt.getTime() - session.createdAt.getTime()).toBeLessThanOrEqual(28_800_000)

    const current = await authRequest(authentication(), "/get-session", { cookie, method: "GET" })
    expect(current.status).toBe(200)
    expect((await current.json()) as unknown).not.toBeNull()
    expect((await database.authSession.findUniqueOrThrow({ where: { id: session.id } })).expiresAt).toEqual(
      session.expiresAt,
    )

    const rejectedLogout = await authRequest(authentication(), "/sign-out", {
      cookie,
      origin: UNTRUSTED_ORIGIN,
      body: {},
    })
    expect(rejectedLogout.status).toBe(403)
    expect(await database.authSession.count({ where: { id: session.id } })).toBe(1)

    const logout = await authRequest(authentication(), "/sign-out", {
      cookie,
      origin: APP_ORIGIN,
      body: {},
    })
    expect(logout.status).toBe(200)
    expect(await database.authSession.count({ where: { id: session.id } })).toBe(0)
  }, 60_000)

  it("rejects expired database sessions", async () => {
    const identity = deriveCitizenAuthIdentity(citizenPhone)
    const login = await signIn(identity.username, citizenPassword)
    const cookie = sessionCookie(login)
    const session = await database.authSession.findFirstOrThrow({
      where: { userId: citizenUserId },
      orderBy: { createdAt: "desc" },
    })
    await database.authSession.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })

    const response = await authRequest(authentication(), "/get-session", { cookie, method: "GET" })
    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
  }, 60_000)
})
