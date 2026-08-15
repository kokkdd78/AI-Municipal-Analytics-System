import { describe, expect, it } from "vitest"

import { citizenUsernameCredentials, staffUsernameCredentials } from "../lib/auth/credentials"
import {
  deriveCitizenAuthIdentity,
  deriveExistingUserAuthEmail,
  deriveStaffAuthIdentity,
  isCitizenAuthUsername,
  isStaffAuthUsername,
  normalizeCitizenPhone,
  normalizeEmployeeId,
} from "../lib/auth/identifiers"

describe("authentication identifier normalization", () => {
  it("normalizes equivalent citizen phones to one E.164 identity", () => {
    const international = deriveCitizenAuthIdentity("+966 50 123 4567")
    const local = deriveCitizenAuthIdentity("0501234567")

    expect(international).toEqual(local)
    expect(international.normalizedIdentifier).toBe("+966501234567")
    expect(isCitizenAuthUsername(international.username)).toBe(true)
    expect(isStaffAuthUsername(international.username)).toBe(false)
    expect(international.internalEmail.endsWith("@auth.invalid")).toBe(true)
    expect(international.internalEmail).not.toContain(international.normalizedIdentifier)
    expect(international.internalEmail.split("@", 1)[0]?.length).toBeLessThanOrEqual(64)
  })

  it("normalizes employee IDs and keeps staff identities in a separate namespace", () => {
    expect(normalizeEmployeeId(" m - 1024 ")).toBe("M-1024")

    const staff = deriveStaffAuthIdentity("m-1024")
    const citizen = deriveCitizenAuthIdentity("+966501234567")

    expect(isStaffAuthUsername(staff.username)).toBe(true)
    expect(isCitizenAuthUsername(staff.username)).toBe(false)
    expect(staff.username).not.toBe(citizen.username)
    expect(staff.internalEmail.endsWith("@auth.invalid")).toBe(true)
  })

  it("rejects malformed identifiers without reflecting their values", () => {
    for (const value of ["", "not-a-phone", {}, true]) {
      expect(() => normalizeCitizenPhone(value)).toThrow("The authentication identifier is invalid")
    }
    for (const value of ["", "--", "employee@example.com", {}, false]) {
      expect(() => normalizeEmployeeId(value)).toThrow("The authentication identifier is invalid")
    }
  })

  it("builds login payloads from server-derived identifiers only", () => {
    const citizen = citizenUsernameCredentials("0501234567", "valid-password")
    const staff = staffUsernameCredentials("m-1024", "valid-password")

    expect(isCitizenAuthUsername(citizen.username)).toBe(true)
    expect(isStaffAuthUsername(staff.username)).toBe(true)
    expect(() => citizenUsernameCredentials("0501234567", "short")).toThrow("Invalid credentials")
  })

  it("creates a deterministic passwordless internal address for existing users", () => {
    const first = deriveExistingUserAuthEmail("stable-user-id")

    expect(deriveExistingUserAuthEmail("stable-user-id")).toBe(first)
    expect(deriveExistingUserAuthEmail("other-user-id")).not.toBe(first)
    expect(first.endsWith("@auth.invalid")).toBe(true)
  })
})
