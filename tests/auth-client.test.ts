import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getMunicipalSession,
  loginCitizen,
  loginStaff,
  municipalAuthFailureMessage,
  registerCitizen,
  signOutMunicipal,
} from "../lib/auth/client"

const citizenSession = {
  user: {
    id: "citizen-1",
    name: "Citizen User",
    role: "Citizen" as const,
    phone: "+966500000001",
    avatarUrl: null,
    district: { id: "al-naeem", name: "Al-Naeem" },
    departmentId: null,
  },
  destination: "/citizen-app" as const,
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("Phase 2B2B municipal authentication client", () => {
  it("fetches and parses only the sanitized same-origin session DTO", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(citizenSession))
    vi.stubGlobal("fetch", fetchMock)

    await expect(getMunicipalSession({ force: true })).resolves.toEqual({ ok: true, data: citizenSession })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/municipal",
      expect.objectContaining({ method: "GET", credentials: "same-origin", cache: "no-store" }),
    )
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>)["content-type"]).toBeUndefined()
  })

  it("rejects malformed or role/destination-inconsistent session DTOs", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ...citizenSession, destination: "/manager" }))
      .mockResolvedValueOnce(jsonResponse({ user: { id: "citizen-1" }, destination: "/citizen-app" }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(getMunicipalSession({ force: true })).resolves.toEqual({ ok: false, kind: "server", status: 200 })
    await expect(getMunicipalSession({ force: true })).resolves.toEqual({ ok: false, kind: "server", status: 200 })
  })

  it("reports an anonymous or expired session without accepting local authority", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ message: "Authentication required", code: "AUTHENTICATION_REQUIRED" }, 401))
    vi.stubGlobal("fetch", fetchMock)

    await expect(getMunicipalSession({ force: true })).resolves.toEqual({
      ok: false,
      kind: "session-expired",
      status: 401,
    })
  })

  it("sends each supported operation as JSON only to the municipal façade", async () => {
    const managerSession = {
      user: {
        ...citizenSession.user,
        id: "manager-1",
        role: "Manager" as const,
        phone: null,
        district: null,
        departmentId: "operations",
      },
      destination: "/manager" as const,
    }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(citizenSession))
      .mockResolvedValueOnce(jsonResponse(citizenSession))
      .mockResolvedValueOnce(jsonResponse(managerSession))
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()

    await registerCitizen({
      name: "Citizen User",
      phone: "+966500000001",
      districtId: "al-naeem",
      password: "registration-password",
      confirmPassword: "registration-password",
    })
    await loginCitizen(
      { phone: "+966500000001", password: "citizen-password" },
      { signal: controller.signal },
    )
    await loginStaff({ employeeId: "M-100", password: "staff-password" })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls.map(([endpoint]) => endpoint)).toEqual([
      "/api/auth/municipal",
      "/api/auth/municipal",
      "/api/auth/municipal",
    ])
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" })
      expect(init?.headers).toMatchObject({ "content-type": "application/json" })
    }
    expect(fetchMock.mock.calls[1][1]?.signal).toBe(controller.signal)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      operation: "citizen-register",
      name: "Citizen User",
      phone: "+966500000001",
      districtId: "al-naeem",
      password: "registration-password",
      confirmPassword: "registration-password",
    })
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      operation: "citizen-login",
      phone: "+966500000001",
      password: "citizen-password",
    })
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      operation: "staff-login",
      employeeId: "M-100",
      password: "staff-password",
    })
  })

  it("maps the canonical 401 response to the same safe credential failure for both login operations", async () => {
    const invalidCredentials = {
      message: "Invalid username or password",
      code: "INVALID_USERNAME_OR_PASSWORD",
    }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(invalidCredentials, 401))
      .mockResolvedValueOnce(jsonResponse(invalidCredentials, 401))
    vi.stubGlobal("fetch", fetchMock)

    const citizen = await loginCitizen({ phone: "+966500000001", password: "wrong-password" })
    const staff = await loginStaff({ employeeId: "M-100", password: "wrong-password" })

    expect(citizen).toEqual({ ok: false, kind: "credentials", status: 401 })
    expect(staff).toEqual({ ok: false, kind: "credentials", status: 401 })
    if (!citizen.ok && !staff.ok) {
      expect(municipalAuthFailureMessage(citizen)).toBe("Unable to sign in with those credentials.")
      expect(municipalAuthFailureMessage(staff)).toBe(municipalAuthFailureMessage(citizen))
      expect(municipalAuthFailureMessage(citizen)).not.toContain("username")
    }
  })

  it("keeps registration, validation, unsupported-media, rate-limit, and network failures distinct", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ code: "REGISTRATION_UNAVAILABLE" }, 409))
      .mockResolvedValueOnce(jsonResponse({ code: "AUTHENTICATION_REQUIRED" }, 401))
      .mockResolvedValueOnce(jsonResponse({ code: "INVALID_REQUEST" }, 400))
      .mockResolvedValueOnce(jsonResponse({ code: "UNSUPPORTED_MEDIA_TYPE" }, 415))
      .mockResolvedValueOnce(jsonResponse({ code: "RATE_LIMITED" }, 429))
      .mockRejectedValueOnce(new Error("offline"))
    vi.stubGlobal("fetch", fetchMock)

    const registrationCollision = await registerCitizen({
      name: "Citizen User",
      phone: "+966500000001",
      districtId: "al-naeem",
      password: "registration-password",
      confirmPassword: "registration-password",
    })
    const registrationUnauthorized = await registerCitizen({
      name: "Citizen User",
      phone: "+966500000002",
      districtId: "al-naeem",
      password: "registration-password",
      confirmPassword: "registration-password",
    })
    const validation = await loginCitizen({ phone: "invalid", password: "short" })
    const unsupportedMedia = await loginCitizen({ phone: "+966500000001", password: "wrong-password" })
    const rateLimit = await loginStaff({ employeeId: "M-100", password: "wrong-password" })
    const network = await loginCitizen({ phone: "+966500000001", password: "wrong-password" })

    expect(registrationCollision).toEqual({ ok: false, kind: "registration", status: 409 })
    expect(registrationUnauthorized).toEqual({ ok: false, kind: "registration", status: 401 })
    expect(validation).toEqual({ ok: false, kind: "validation", status: 400 })
    expect(unsupportedMedia).toEqual({ ok: false, kind: "unsupported-media", status: 415 })
    expect(rateLimit).toEqual({ ok: false, kind: "rate-limit", status: 429 })
    expect(network).toEqual({ ok: false, kind: "network", status: null })
    if (!registrationCollision.ok && !rateLimit.ok && !unsupportedMedia.ok) {
      expect(municipalAuthFailureMessage(registrationCollision)).not.toContain("exists")
      expect(municipalAuthFailureMessage(rateLimit)).not.toBe(municipalAuthFailureMessage(unsupportedMedia))
    }
  })

  it("treats an already-expired sign-out as complete and reports network failure without success", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ code: "AUTHENTICATION_REQUIRED" }, 401))
      .mockRejectedValueOnce(new Error("offline"))
    vi.stubGlobal("fetch", fetchMock)

    await expect(signOutMunicipal()).resolves.toEqual({ ok: true, data: { expired: true } })
    await expect(signOutMunicipal()).resolves.toEqual({ ok: false, kind: "network", status: null })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ operation: "sign-out" })
  })
})
