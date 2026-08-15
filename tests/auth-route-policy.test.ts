import { UserRole } from "../generated/prisma/client"
import { describe, expect, it } from "vitest"

import {
  hasSupportedMunicipalJsonMediaType,
  hasTrustedRequestOrigin,
  isMunicipalAuthFacadeRoute,
} from "../lib/auth/http-handlers"
import {
  pageAuthorizationRedirect,
  requiredRoleForPage,
  roleHome,
  safeCallbackPath,
} from "../lib/auth/route-policy"
import { toSafeAuthenticationDto } from "../lib/auth/session-dto"
import {
  citizenLoginSchema,
  citizenRegistrationSchema,
  municipalAuthPostSchema,
  staffLoginSchema,
} from "../lib/auth/validation"

describe("municipal route and callback policy", () => {
  it("defines the exact page-role matrix and path boundaries", () => {
    expect([
      ["/citizen-app", requiredRoleForPage("/citizen-app")],
      ["/map", requiredRoleForPage("/map")],
      ["/my-reports", requiredRoleForPage("/my-reports")],
      ["/report", requiredRoleForPage("/report")],
      ["/report-success", requiredRoleForPage("/report-success")],
      ["/report/track/report-1", requiredRoleForPage("/report/track/report-1")],
      ["/manager", requiredRoleForPage("/manager")],
      ["/crew", requiredRoleForPage("/crew")],
    ]).toEqual([
      ["/citizen-app", UserRole.Citizen],
      ["/map", UserRole.Citizen],
      ["/my-reports", UserRole.Citizen],
      ["/report", UserRole.Citizen],
      ["/report-success", UserRole.Citizen],
      ["/report/track/report-1", UserRole.Citizen],
      ["/manager", UserRole.Manager],
      ["/crew", UserRole.Crew],
    ])
    expect(requiredRoleForPage("/manager-tools")).toBeNull()
    expect(requiredRoleForPage("/reporting")).toBeNull()
    expect(requiredRoleForPage("/report/track")).toBeNull()
    expect(requiredRoleForPage("/report/track/report-1/more")).toBeNull()
  })

  it("redirects anonymous and wrong-role users without trusting a requested role", () => {
    expect(pageAuthorizationRedirect(null, UserRole.Citizen)).toBe("/auth")
    expect(pageAuthorizationRedirect({ role: UserRole.Manager }, UserRole.Citizen)).toBe("/manager")
    expect(pageAuthorizationRedirect({ role: UserRole.Crew }, UserRole.Manager)).toBe("/crew")
    expect(pageAuthorizationRedirect({ role: UserRole.Citizen }, UserRole.Citizen)).toBeNull()
    expect(roleHome(UserRole.Citizen)).toBe("/citizen-app")
  })

  it("accepts only exact role-compatible callback destinations", () => {
    expect(safeCallbackPath("/citizen-app", UserRole.Citizen)).toBe("/citizen-app")
    expect(safeCallbackPath("/report/track/report-1", UserRole.Citizen)).toBe("/report/track/report-1")
    expect(safeCallbackPath("/manager", UserRole.Manager)).toBe("/manager")

    for (const value of [
      "https://evil.example/manager",
      "//evil.example/manager",
      "/manager\\anything",
      "/manager-tools",
      "/manager%2fanything",
      "/%6danager",
      "/manager?next=/crew",
      "/manager#fragment",
      "/manager\u0000",
      "%E0%A4%A",
    ]) {
      expect(safeCallbackPath(value, UserRole.Manager)).toBeNull()
    }
    expect(safeCallbackPath("/manager", UserRole.Citizen)).toBeNull()
    expect(safeCallbackPath("/crew", UserRole.Manager)).toBeNull()
  })
})

describe("municipal authentication request boundary", () => {
  it("exposes one fixed municipal route without deriving an operation from the URL", () => {
    expect(isMunicipalAuthFacadeRoute(["municipal"])).toBe(true)
    for (const segments of [
      [],
      ["municipal", "citizen", "register"],
      ["municipal", "staff", "login"],
      ["sign-in", "username"],
      ["get-session"],
      ["sign-out"],
    ]) {
      expect(isMunicipalAuthFacadeRoute(segments)).toBe(false)
    }

    const normalized = new Request(
      "https://municipal.test/api/auth/municipal/staff/../",
    )
    expect(new URL(normalized.url).pathname).toBe("/api/auth/municipal/")
    expect(isMunicipalAuthFacadeRoute(["municipal"])).toBe(true)
    expect(
      municipalAuthPostSchema.safeParse({
        operation: "citizen-login",
        phone: "+966501234567",
        password: "valid-password",
      }).success,
    ).toBe(true)
  })

  it("requires an exact trusted Origin on state-changing facade requests", () => {
    const trusted = ["https://municipal.example.test"]
    expect(
      hasTrustedRequestOrigin(
        new Request("https://municipal.example.test/api/auth/municipal", {
          headers: { origin: "https://municipal.example.test" },
        }),
        trusted,
      ),
    ).toBe(true)
    expect(
      hasTrustedRequestOrigin(
        new Request("https://municipal.example.test/api/auth/municipal", {
          headers: { origin: "HTTPS://MUNICIPAL.EXAMPLE.TEST:443" },
        }),
        trusted,
      ),
    ).toBe(true)

    for (const origin of [
      "https://evil.example.test",
      "https://municipal.example.test.evil.test",
      "https://municipal.example.test/",
      "https://user@municipal.example.test",
      "https://municipal.example.test:444",
      "http://municipal.example.test",
      "https://municipal.example.test, https://evil.example.test",
      "null",
      "not-an-origin",
      "",
    ]) {
      expect(
        hasTrustedRequestOrigin(
          new Request("https://municipal.example.test/api/auth/municipal", {
            headers: origin ? { origin } : undefined,
          }),
          trusted,
        ),
      ).toBe(false)
    }
  })

  it("accepts only an unambiguous application/json media type with optional UTF-8", () => {
    for (const contentType of [
      "application/json",
      "application/json; charset=utf-8",
      "Application/JSON ; Charset = UTF-8",
      'APPLICATION/JSON; CHARSET="UTF-8"',
    ]) {
      expect(hasSupportedMunicipalJsonMediaType(contentType)).toBe(true)
    }

    for (const contentType of [
      null,
      "",
      "text/plain",
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=example",
      "application/problem+json",
      "application/json, text/plain",
      "application/json; charset",
      "application/json; charset=iso-8859-1",
      "application/json; charset=utf8",
      "application/json; charset=utf-8; charset=utf-8",
      "application/json; profile=example",
      "application/json;",
    ]) {
      expect(hasSupportedMunicipalJsonMediaType(contentType)).toBe(false)
    }
  })

  it("rejects unknown and privileged client fields with strict schemas", () => {
    const registration = {
      name: "Citizen Name",
      phone: "+966501234567",
      districtId: "al-naeem",
      password: "valid-password",
      confirmPassword: "valid-password",
    }
    expect(citizenRegistrationSchema.safeParse(registration).success).toBe(true)

    for (const privileged of ["role", "id", "username", "email", "employeeId", "isActive", "account", "session"]) {
      expect(citizenRegistrationSchema.safeParse({ ...registration, [privileged]: "injected" }).success).toBe(false)
    }
    expect(citizenRegistrationSchema.safeParse({ ...registration, confirmPassword: "different" }).success).toBe(false)
    expect(citizenRegistrationSchema.safeParse({ ...registration, districtId: "not-a-jeddah-district" }).success).toBe(false)
    expect(citizenLoginSchema.safeParse({ phone: registration.phone, password: registration.password, role: "Manager" }).success).toBe(false)
    expect(staffLoginSchema.safeParse({ employeeId: "M-100", password: registration.password, role: "Manager" }).success).toBe(false)

    expect(
      municipalAuthPostSchema.safeParse({ operation: "citizen-register", ...registration }).success,
    ).toBe(true)
    expect(
      municipalAuthPostSchema.safeParse({
        operation: "citizen-login",
        phone: registration.phone,
        password: registration.password,
      }).success,
    ).toBe(true)
    expect(
      municipalAuthPostSchema.safeParse({
        operation: "staff-login",
        employeeId: "M-100",
        password: registration.password,
      }).success,
    ).toBe(true)
    expect(municipalAuthPostSchema.safeParse({ operation: "sign-out" }).success).toBe(true)

    for (const rejected of [
      { operation: "unknown" },
      { operation: "sign-out", role: "Manager" },
      {
        operation: "citizen-login",
        phone: registration.phone,
        password: registration.password,
        employeeId: "M-100",
      },
      {
        operation: "staff-login",
        employeeId: "M-100",
        password: registration.password,
        username: "injected",
      },
    ]) {
      expect(municipalAuthPostSchema.safeParse(rejected).success).toBe(false)
    }
  })

  it("serializes only the safe display DTO and a server-owned destination", () => {
    const dto = toSafeAuthenticationDto({
      id: "user-1",
      name: "Municipal User",
      role: UserRole.Manager,
      phone: "+966501234567",
      avatarUrl: null,
      departmentId: "department-roads",
      district: { id: "al-naeem", name: "Al-Naeem" },
    })

    expect(dto).toEqual({
      user: {
        id: "user-1",
        name: "Municipal User",
        role: UserRole.Manager,
        phone: null,
        avatarUrl: null,
        departmentId: "department-roads",
        district: { id: "al-naeem", name: "Al-Naeem" },
      },
      destination: "/manager",
    })
    expect(JSON.stringify(dto)).not.toMatch(/email|username|employeeId|password|token|session|isActive/)
  })
})
