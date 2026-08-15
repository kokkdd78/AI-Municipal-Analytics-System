import {
  deriveCitizenAuthIdentity,
  deriveStaffAuthIdentity,
  type AuthIdentity,
} from "./identifiers"

export interface UsernameCredentials {
  username: string
  password: string
}

function requirePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new Error("Invalid credentials")
  }
  return value
}

function credentials(identity: AuthIdentity, password: unknown): UsernameCredentials {
  return { username: identity.username, password: requirePassword(password) }
}

export function citizenUsernameCredentials(phone: unknown, password: unknown): UsernameCredentials {
  return credentials(deriveCitizenAuthIdentity(phone), password)
}

export function staffUsernameCredentials(employeeId: unknown, password: unknown): UsernameCredentials {
  return credentials(deriveStaffAuthIdentity(employeeId), password)
}
