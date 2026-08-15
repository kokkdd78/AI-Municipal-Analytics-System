import { createHash } from "node:crypto"

import { parsePhoneNumberFromString } from "libphonenumber-js/max"

const EMPLOYEE_ID_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/

export class InvalidAuthIdentifierError extends Error {
  constructor() {
    super("The authentication identifier is invalid")
    this.name = "InvalidAuthIdentifierError"
  }
}

function opaqueIdentifier(namespace: "citizen" | "staff", value: string): string {
  return createHash("sha256").update(`${namespace}:${value}`, "utf8").digest("hex")
}

export function normalizeCitizenPhone(value: unknown): string {
  if (typeof value !== "string" || value.length > 64) throw new InvalidAuthIdentifierError()

  const parsed = parsePhoneNumberFromString(value.trim(), "SA")
  if (!parsed || parsed.ext || !parsed.isValid()) throw new InvalidAuthIdentifierError()

  return parsed.number
}

export function normalizeEmployeeId(value: unknown): string {
  if (typeof value !== "string") throw new InvalidAuthIdentifierError()

  const normalized = value.trim().toUpperCase().replace(/\s+/g, "")
  if (!EMPLOYEE_ID_PATTERN.test(normalized)) throw new InvalidAuthIdentifierError()

  return normalized
}

export interface AuthIdentity {
  normalizedIdentifier: string
  username: string
  displayUsername: string
  internalEmail: string
}

function deriveIdentity(namespace: "citizen" | "staff", normalizedIdentifier: string): AuthIdentity {
  const digest = opaqueIdentifier(namespace, normalizedIdentifier)
  const username = `${namespace}_${digest}`

  return {
    normalizedIdentifier,
    username,
    displayUsername: username,
    internalEmail: `${namespace}-${digest.slice(0, 48)}@auth.invalid`,
  }
}

export function deriveCitizenAuthIdentity(phone: unknown): AuthIdentity {
  return deriveIdentity("citizen", normalizeCitizenPhone(phone))
}

export function deriveStaffAuthIdentity(employeeId: unknown): AuthIdentity {
  return deriveIdentity("staff", normalizeEmployeeId(employeeId))
}

export function isCitizenAuthUsername(value: unknown): value is string {
  return typeof value === "string" && /^citizen_[a-f0-9]{64}$/.test(value)
}

export function isStaffAuthUsername(value: unknown): value is string {
  return typeof value === "string" && /^staff_[a-f0-9]{64}$/.test(value)
}

export function deriveExistingUserAuthEmail(userId: string): string {
  if (!userId) throw new InvalidAuthIdentifierError()

  // This digest is an opaque, deterministic alias only; it is never used as a credential hash.
  const digest = createHash("md5").update(userId, "utf8").digest("hex")
  return `existing-${digest}@auth.invalid`
}
