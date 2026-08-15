import { z } from "zod"

import type { UserRole } from "@/types/domain"

const MUNICIPAL_AUTH_ENDPOINT = "/api/auth/municipal"

const ROLE_DESTINATIONS = {
  Citizen: "/citizen-app",
  Manager: "/manager",
  Crew: "/crew",
} as const satisfies Record<UserRole, string>

const safeMunicipalUserSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    role: z.enum(["Citizen", "Manager", "Crew"]),
    phone: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    district: z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
      })
      .strict()
      .nullable(),
    departmentId: z.string().nullable(),
  })
  .strict()

const safeAuthenticationSchema = z
  .object({
    user: safeMunicipalUserSchema,
    destination: z.enum(["/citizen-app", "/manager", "/crew"]),
  })
  .strict()
  .superRefine((value, context) => {
    if (ROLE_DESTINATIONS[value.user.role] !== value.destination) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["destination"], message: "Invalid destination" })
    }
  })

const errorCodeSchema = z.object({ code: z.string().optional() }).passthrough()

export type SafeMunicipalUser = z.infer<typeof safeMunicipalUserSchema>
export type SafeAuthenticationSession = z.infer<typeof safeAuthenticationSchema>

export type MunicipalAuthFailureKind =
  | "credentials"
  | "forbidden"
  | "network"
  | "rate-limit"
  | "registration"
  | "server"
  | "session-expired"
  | "unsupported-media"
  | "validation"

export interface MunicipalAuthFailure {
  ok: false
  kind: MunicipalAuthFailureKind
  status: number | null
}

export interface MunicipalAuthSuccess<T> {
  ok: true
  data: T
}

export type MunicipalAuthResult<T> = MunicipalAuthSuccess<T> | MunicipalAuthFailure

interface CitizenRegistrationInput {
  name: string
  phone: string
  districtId: string
  password: string
  confirmPassword: string
}

interface CitizenLoginInput {
  phone: string
  password: string
}

interface StaffLoginInput {
  employeeId: string
  password: string
}

type SessionOperation =
  | ({ operation: "citizen-register" } & CitizenRegistrationInput)
  | ({ operation: "citizen-login" } & CitizenLoginInput)
  | ({ operation: "staff-login" } & StaffLoginInput)

const SAFE_MESSAGES: Record<MunicipalAuthFailureKind, string> = {
  credentials: "Unable to sign in with those credentials.",
  forbidden: "You are not authorized to complete this request.",
  network: "Unable to reach the authentication service. Please try again.",
  "rate-limit": "Too many attempts. Please wait and try again.",
  registration: "Unable to create an account with those details.",
  server: "Authentication is temporarily unavailable. Please try again.",
  "session-expired": "Your session has expired. Please sign in again.",
  "unsupported-media": "The authentication request was not accepted. Please refresh and try again.",
  validation: "Please check the information you entered and try again.",
}

export function municipalAuthFailureMessage(failure: MunicipalAuthFailure): string {
  return SAFE_MESSAGES[failure.kind]
}

export function destinationForMunicipalRole(role: UserRole): string {
  return ROLE_DESTINATIONS[role]
}

async function parsedErrorCode(response: Response): Promise<string | null> {
  try {
    const result = errorCodeSchema.safeParse(await response.clone().json())
    return result.success ? result.data.code ?? null : null
  } catch {
    return null
  }
}

async function failureForResponse(
  response: Response,
  operation: SessionOperation["operation"] | "session" | "sign-out",
): Promise<MunicipalAuthFailure> {
  if (response.status === 429) return { ok: false, kind: "rate-limit", status: 429 }
  if (response.status === 415) return { ok: false, kind: "unsupported-media", status: 415 }
  if (response.status >= 500) return { ok: false, kind: "server", status: response.status }

  if (response.status === 401) {
    if (operation === "citizen-login" || operation === "staff-login") {
      return { ok: false, kind: "credentials", status: 401 }
    }
    if (operation === "session" || operation === "sign-out") {
      return { ok: false, kind: "session-expired", status: 401 }
    }
    return { ok: false, kind: "registration", status: 401 }
  }

  if (response.status === 403) return { ok: false, kind: "forbidden", status: 403 }

  if (operation === "citizen-register" && (response.status === 409 || response.status === 400)) {
    const code = await parsedErrorCode(response)
    if (response.status === 409 || code === "REGISTRATION_UNAVAILABLE") {
      return { ok: false, kind: "registration", status: response.status }
    }
  }

  return { ok: false, kind: "validation", status: response.status }
}

async function parseSessionResponse(response: Response): Promise<MunicipalAuthResult<SafeAuthenticationSession>> {
  if (!response.ok) return failureForResponse(response, "session")

  try {
    const parsed = safeAuthenticationSchema.safeParse(await response.json())
    if (!parsed.success) return { ok: false, kind: "server", status: response.status }
    return { ok: true, data: parsed.data }
  } catch {
    return { ok: false, kind: "server", status: response.status }
  }
}

async function requestSession(): Promise<MunicipalAuthResult<SafeAuthenticationSession>> {
  try {
    const response = await fetch(MUNICIPAL_AUTH_ENDPOINT, {
      method: "GET",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      cache: "no-store",
    })
    return parseSessionResponse(response)
  } catch {
    return { ok: false, kind: "network", status: null }
  }
}

let inFlightSessionRequest: Promise<MunicipalAuthResult<SafeAuthenticationSession>> | null = null

export function getMunicipalSession(options: { force?: boolean } = {}): Promise<MunicipalAuthResult<SafeAuthenticationSession>> {
  if (!options.force && inFlightSessionRequest) return inFlightSessionRequest

  const request = requestSession().finally(() => {
    if (inFlightSessionRequest === request) inFlightSessionRequest = null
  })
  inFlightSessionRequest = request
  return request
}

interface MunicipalAuthRequestOptions {
  signal?: AbortSignal
}

async function postSessionOperation(
  operation: SessionOperation,
  options: MunicipalAuthRequestOptions = {},
): Promise<MunicipalAuthResult<SafeAuthenticationSession>> {
  try {
    const response = await fetch(MUNICIPAL_AUTH_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(operation),
      signal: options.signal,
    })

    if (!response.ok) return failureForResponse(response, operation.operation)
    return parseSessionResponse(response)
  } catch {
    return { ok: false, kind: "network", status: null }
  }
}

export function registerCitizen(
  input: CitizenRegistrationInput,
  options: MunicipalAuthRequestOptions = {},
): Promise<MunicipalAuthResult<SafeAuthenticationSession>> {
  return postSessionOperation({ operation: "citizen-register", ...input }, options)
}

export function loginCitizen(
  input: CitizenLoginInput,
  options: MunicipalAuthRequestOptions = {},
): Promise<MunicipalAuthResult<SafeAuthenticationSession>> {
  return postSessionOperation({ operation: "citizen-login", ...input }, options)
}

export function loginStaff(input: StaffLoginInput): Promise<MunicipalAuthResult<SafeAuthenticationSession>> {
  return postSessionOperation({ operation: "staff-login", ...input })
}

export async function signOutMunicipal(): Promise<MunicipalAuthResult<{ expired: boolean }>> {
  try {
    const response = await fetch(MUNICIPAL_AUTH_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ operation: "sign-out" }),
    })

    if (response.ok) return { ok: true, data: { expired: false } }
    if (response.status === 401) return { ok: true, data: { expired: true } }
    return failureForResponse(response, "sign-out")
  } catch {
    return { ok: false, kind: "network", status: null }
  }
}
