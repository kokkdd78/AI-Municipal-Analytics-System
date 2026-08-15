import { betterAuth, APIError } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { createAuthMiddleware } from "better-auth/api"
import { verifyPassword } from "better-auth/crypto"
import { USERNAME_ERROR_CODES, username } from "better-auth/plugins"

import type { PrismaClient } from "@/generated/prisma/client"
import { deriveCitizenAuthIdentity, isCitizenAuthUsername, isStaffAuthUsername } from "./identifiers"

const INVALID_CREDENTIALS = "Invalid username or password"
const BETTER_AUTH_PASSWORD_HASH = /^[a-f0-9]{32}:[a-f0-9]{128}$/
const DUMMY_PASSWORD_HASH =
  "7cf2e07fd7aa56062b8df1f382e13758:e3c8b9da97a20cfc5140fa782cfc38bc4d1c2cb3c9eee1d28ca811f34ea47fc3354ae2a897101f2b245b3657cc5ab71a7f9b5cb527d5f10a51fbd8822e6397ce"

export type PasswordVerifier = (data: { hash: string; password: string }) => Promise<boolean>

export interface MunicipalAuthOptions {
  database: PrismaClient
  baseURL: string
  secret: string
  trustedOrigins: string[]
  trustedProxyCidrs: string[]
  secureCookies: boolean
  passwordVerifier?: PasswordVerifier
}

function genericCredentialError(): never {
  throw new APIError("UNAUTHORIZED", { message: INVALID_CREDENTIALS })
}

export function invalidCredentialsError(): never {
  throw APIError.from("UNAUTHORIZED", USERNAME_ERROR_CODES.INVALID_USERNAME_OR_PASSWORD)
}

async function constantWorkCredentialError(password: unknown, verifier: PasswordVerifier): Promise<never> {
  try {
    await verifier({ hash: DUMMY_PASSWORD_HASH, password: typeof password === "string" ? password : "" })
  } catch {
    // Authentication must still fail generically if the verifier rejects unexpectedly.
  }
  invalidCredentialsError()
}

function validName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 120
}

function validDistrictId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 100
}

export function createMunicipalAuth(options: MunicipalAuthOptions) {
  const { database } = options
  const passwordVerifier = options.passwordVerifier ?? verifyPassword

  return betterAuth({
    appName: "Smart Municipal Assistant",
    baseURL: options.baseURL,
    secret: options.secret,
    trustedOrigins: options.trustedOrigins,
    database: prismaAdapter(database, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      password: { verify: passwordVerifier },
    },
    user: {
      modelName: "User",
      fields: {
        email: "authEmail",
        image: "avatarUrl",
      },
      additionalFields: {
        phone: { type: "string", required: false, input: true, returned: false },
        districtId: { type: "string", required: false, input: true, returned: true },
        role: {
          type: ["Citizen", "Manager", "Crew"],
          required: true,
          defaultValue: "Citizen",
          input: false,
          returned: true,
        },
        isActive: {
          type: "boolean",
          required: true,
          defaultValue: true,
          input: false,
          returned: true,
        },
      },
    },
    session: {
      modelName: "AuthSession",
      expiresIn: 60 * 60 * 8,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    account: { modelName: "AuthAccount" },
    verification: { modelName: "AuthVerification" },
    disabledPaths: ["/sign-in/email", "/is-username-available"],
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "AuthRateLimit",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/username": { window: 60, max: 5 },
        "/sign-up/email": { window: 60 * 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: options.secureCookies,
      disableCSRFCheck: false,
      disableOriginCheck: false,
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for"],
        trustedProxies: options.trustedProxyCidrs,
      },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: options.secureCookies,
        path: "/",
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            if (context?.path !== "/sign-up/email") return
            return { data: { ...user, role: "Citizen", isActive: true } }
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        const body = context.body as Record<string, unknown> | undefined
        if (!body) return

        if (context.path === "/sign-up/email") {
          if (!validName(body.name) || !validDistrictId(body.districtId)) genericCredentialError()

          let identity
          try {
            identity = deriveCitizenAuthIdentity(body.phone)
          } catch {
            genericCredentialError()
          }

          const district = await database.district.findUnique({
            where: { id: body.districtId.trim() },
            select: { id: true },
          })
          if (!district) genericCredentialError()

          body.name = body.name.trim()
          body.phone = identity.normalizedIdentifier
          body.districtId = district.id
          body.email = identity.internalEmail
          body.username = identity.username
          body.displayUsername = identity.displayUsername
          body.role = "Citizen"
          body.isActive = true
          delete body.employeeId
          delete body.departmentId
          delete body.passwordHash
          delete body.id
        }

        if (context.path === "/update-user") {
          delete body.email
          delete body.username
          delete body.displayUsername
          delete body.phone
          delete body.districtId
          delete body.role
          delete body.isActive
          delete body.employeeId
          delete body.departmentId
          delete body.passwordHash
          delete body.id
        }

        if (context.path === "/sign-in/username") {
          const submittedUsername =
            typeof body.username === "string" ? body.username.trim().toLowerCase() : ""
          if (!isCitizenAuthUsername(submittedUsername) && !isStaffAuthUsername(submittedUsername)) {
            await constantWorkCredentialError(body.password, passwordVerifier)
          }

          const user = await database.user.findUnique({
            where: { authUsername: submittedUsername },
            select: {
              isActive: true,
              authAccounts: {
                where: { providerId: "credential" },
                select: { password: true },
                take: 1,
              },
            },
          })
          const credentialHash = user?.authAccounts[0]?.password
          if (!user?.isActive || typeof credentialHash !== "string" || !BETTER_AUTH_PASSWORD_HASH.test(credentialHash)) {
            await constantWorkCredentialError(body.password, passwordVerifier)
          }
          body.username = submittedUsername
        }
      }),
    },
    plugins: [
      username({
        minUsernameLength: 70,
        maxUsernameLength: 72,
        usernameValidator: (value) => isCitizenAuthUsername(value) || isStaffAuthUsername(value),
        usernameNormalization: (value) => value.trim().toLowerCase(),
        displayUsernameNormalization: (value) => value.trim().toLowerCase(),
        validationOrder: { username: "post-normalization", displayUsername: "post-normalization" },
        schema: {
          user: {
            fields: {
              username: "authUsername",
              displayUsername: "authDisplayUsername",
            },
          },
        },
      }),
    ],
    logger: { disabled: true },
    telemetry: { enabled: false },
  })
}

export type MunicipalAuth = ReturnType<typeof createMunicipalAuth>
