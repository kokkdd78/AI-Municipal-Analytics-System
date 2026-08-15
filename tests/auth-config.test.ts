import { describe, expect, it } from "vitest"

import type { PrismaClient } from "../generated/prisma/client"
import { createMunicipalAuth, invalidCredentialsError } from "../lib/auth/config"
import { readAuthRuntimeEnvironment } from "../lib/auth/environment"

const TEST_ORIGIN = "https://municipal.example.test"
const TEST_SECRET = "test-only-secret-with-at-least-thirty-two-characters"
const TEST_PROXY_CIDRS = "192.0.2.10/32,2001:db8::10/128"

function productionEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    BETTER_AUTH_SECRET: TEST_SECRET,
    BETTER_AUTH_URL: TEST_ORIGIN,
    BETTER_AUTH_TRUSTED_ORIGINS: `${TEST_ORIGIN},https://admin.example.test`,
    AUTH_TRUSTED_PROXY_CIDRS: TEST_PROXY_CIDRS,
    NODE_ENV: "production",
    ...overrides,
  }
}

describe("authentication environment", () => {
  it("accepts exact origins and enables secure cookies in production", () => {
    const environment = readAuthRuntimeEnvironment(productionEnvironment())

    expect(environment).toEqual({
      baseURL: TEST_ORIGIN,
      secret: TEST_SECRET,
      trustedOrigins: [TEST_ORIGIN, "https://admin.example.test"],
      trustedProxyCidrs: ["192.0.2.10/32", "2001:db8::10/128"],
      secureCookies: true,
    })
  })

  it.each([
    {},
    productionEnvironment({ BETTER_AUTH_SECRET: "too-short" }),
    {
      ...productionEnvironment(),
      BETTER_AUTH_URL: `${TEST_ORIGIN}/path`,
    },
    {
      ...productionEnvironment(),
      BETTER_AUTH_TRUSTED_ORIGINS: "https://*.example.test",
    },
    {
      ...productionEnvironment(),
      BETTER_AUTH_TRUSTED_ORIGINS: "https://other.example.test",
    },
  ])("fails closed with one generic error", (environment) => {
    expect(() => readAuthRuntimeEnvironment(environment)).toThrow(
      "The authentication environment configuration is invalid",
    )
  })

  it.each([
    productionEnvironment({ BETTER_AUTH_URL: "http://municipal.example.test" }),
    productionEnvironment({ BETTER_AUTH_TRUSTED_ORIGINS: `${TEST_ORIGIN},http://admin.example.test` }),
    productionEnvironment({
      BETTER_AUTH_URL: "https://localhost",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://localhost",
    }),
  ])("rejects insecure or local production origins", (environment) => {
    expect(() => readAuthRuntimeEnvironment(environment)).toThrow(
      "The authentication environment configuration is invalid",
    )
  })

  it.each([undefined, "", "proxy.example.test", "*", "192.0.2.10/33", "192.0.2.10,,192.0.2.11"])(
    "rejects missing or malformed production trusted proxies",
    (trustedProxies) => {
      expect(() =>
        readAuthRuntimeEnvironment(productionEnvironment({ AUTH_TRUSTED_PROXY_CIDRS: trustedProxies })),
      ).toThrow("The authentication environment configuration is invalid")
    },
  )

  it.each(["development", "test"])("allows localhost HTTP in %s", (nodeEnvironment) => {
    expect(
      readAuthRuntimeEnvironment({
        BETTER_AUTH_SECRET: TEST_SECRET,
        BETTER_AUTH_URL: "http://localhost:3000",
        BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
        NODE_ENV: nodeEnvironment,
      }),
    ).toMatchObject({
      baseURL: "http://localhost:3000",
      trustedOrigins: ["http://localhost:3000"],
      trustedProxyCidrs: [],
      secureCookies: false,
    })
  })
})

describe("Better Auth security configuration", () => {
  it("uses Better Auth's canonical invalid-credentials error", () => {
    let error: unknown

    try {
      invalidCredentialsError()
    } catch (caught) {
      error = caught
    }

    expect(error).toMatchObject({
      status: "UNAUTHORIZED",
      statusCode: 401,
      body: {
        code: "INVALID_USERNAME_OR_PASSWORD",
        message: "Invalid username or password",
      },
      headers: {},
    })
  })

  it("uses database sessions, strict model mappings, CSRF checks, and server-owned roles", () => {
    const auth = createMunicipalAuth({
      database: {} as PrismaClient,
      baseURL: TEST_ORIGIN,
      secret: TEST_SECRET,
      trustedOrigins: [TEST_ORIGIN],
      trustedProxyCidrs: ["192.0.2.10/32"],
      secureCookies: true,
    })

    expect(auth.options.user?.modelName).toBe("User")
    expect(auth.options.user?.fields).toMatchObject({ email: "authEmail", image: "avatarUrl" })
    expect(auth.options.user?.additionalFields?.role).toMatchObject({ input: false, defaultValue: "Citizen" })
    expect(auth.options.user?.additionalFields?.isActive).toMatchObject({ input: false, defaultValue: true })
    expect(auth.options.session).toMatchObject({
      modelName: "AuthSession",
      expiresIn: 28_800,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    })
    expect(auth.options.account?.modelName).toBe("AuthAccount")
    expect(auth.options.verification?.modelName).toBe("AuthVerification")
    expect(auth.options.advanced).toMatchObject({
      useSecureCookies: true,
      disableCSRFCheck: false,
      disableOriginCheck: false,
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for"],
        trustedProxies: ["192.0.2.10/32"],
      },
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: true },
    })
    expect(auth.options.rateLimit).toMatchObject({
      enabled: true,
      storage: "database",
      modelName: "AuthRateLimit",
    })
    expect(auth.options.disabledPaths).toEqual(
      expect.arrayContaining(["/sign-in/email", "/is-username-available"]),
    )
  })
})
