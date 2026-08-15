import { UserRole } from "../generated/prisma/client"
import {
  AuthorizationError,
  asApiAuthorizationResult,
  authorizationErrorResponse,
  createAuthorizationService,
  type AuthenticatedMunicipalUser,
} from "../lib/auth/authorization-core"
import { describe, expect, it } from "vitest"

const headers = new Headers()

function storedUser(
  role: UserRole,
  isActive = true,
): Omit<AuthenticatedMunicipalUser, "isActive"> & { isActive: boolean } {
  return {
    id: "database-user-id",
    name: "Database User",
    role,
    isActive,
    avatarUrl: null,
    districtId: null,
    departmentId: null,
  }
}

describe("server authorization helpers", () => {
  it.each([
    [UserRole.Citizen, UserRole.Citizen, true],
    [UserRole.Manager, UserRole.Manager, true],
    [UserRole.Crew, UserRole.Crew, true],
    [UserRole.Citizen, UserRole.Manager, false],
    [UserRole.Crew, UserRole.Manager, false],
  ])("authorizes from the reloaded database role", async (databaseRole, requiredRole, allowed) => {
    const authorization = createAuthorizationService({
      getSession: async () => ({ user: { id: "database-user-id" } }),
      findUserById: async () => storedUser(databaseRole),
    })

    if (allowed) {
      await expect(authorization.requireRole(headers, requiredRole)).resolves.toMatchObject({
        id: "database-user-id",
        role: databaseRole,
      })
    } else {
      await expect(authorization.requireRole(headers, requiredRole)).rejects.toMatchObject({ status: 403 })
    }
  })

  it("supports any-role checks without treating the session payload as authority", async () => {
    const authorization = createAuthorizationService({
      getSession: async () => ({ user: { id: "database-user-id" } }),
      findUserById: async () => storedUser(UserRole.Crew),
    })

    await expect(
      authorization.requireAnyRole(headers, [UserRole.Manager, UserRole.Crew]),
    ).resolves.toMatchObject({ role: UserRole.Crew })
  })

  it("rejects missing sessions, deleted users, and inactive users as unauthenticated", async () => {
    const cases = [
      createAuthorizationService({ getSession: async () => null, findUserById: async () => null }),
      createAuthorizationService({
        getSession: async () => ({ user: { id: "missing" } }),
        findUserById: async () => null,
      }),
      createAuthorizationService({
        getSession: async () => ({ user: { id: "inactive" } }),
        findUserById: async () => storedUser(UserRole.Manager, false),
      }),
    ]

    for (const authorization of cases) {
      await expect(authorization.requireUser(headers)).rejects.toMatchObject({ status: 401 })
    }
  })

  it("produces only 401 and 403 API responses for authorization failures", async () => {
    const unauthorized = authorizationErrorResponse(new AuthorizationError(401))
    const forbidden = authorizationErrorResponse(new AuthorizationError(403))

    expect(unauthorized.status).toBe(401)
    expect(forbidden.status).toBe(403)
    await expect(unauthorized.json()).resolves.toEqual({ error: "Authentication required" })
    await expect(forbidden.json()).resolves.toEqual({ error: "Access denied" })

    const apiUnauthorized = await asApiAuthorizationResult(
      Promise.reject(new AuthorizationError(401)),
    )
    expect(apiUnauthorized.response?.status).toBe(401)
  })
})
