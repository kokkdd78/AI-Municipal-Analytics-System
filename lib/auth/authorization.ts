import "server-only"

import { headers as requestHeaders } from "next/headers"

import type { UserRole } from "@/generated/prisma/client"
import { prisma } from "@/lib/db/prisma"
import { asApiAuthorizationResult, createAuthorizationService } from "./authorization-core"
import { auth } from "./server"

const authorization = createAuthorizationService({
  getSession: (headers) => auth.api.getSession({ headers }),
  findUserById: (id) =>
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        role: true,
        isActive: true,
        avatarUrl: true,
        districtId: true,
        departmentId: true,
      },
    }),
})

async function suppliedOrRequestHeaders(supplied?: Headers): Promise<Headers> {
  return supplied ?? (await requestHeaders())
}

export async function getCurrentUser(headers?: Headers) {
  return authorization.currentUser(await suppliedOrRequestHeaders(headers))
}

export async function requireUser(headers?: Headers) {
  return authorization.requireUser(await suppliedOrRequestHeaders(headers))
}

export async function requireRole(role: UserRole, headers?: Headers) {
  return authorization.requireRole(await suppliedOrRequestHeaders(headers), role)
}

export async function requireAnyRole(roles: readonly UserRole[], headers?: Headers) {
  return authorization.requireAnyRole(await suppliedOrRequestHeaders(headers), roles)
}

export async function requireApiUser(headers?: Headers) {
  return asApiAuthorizationResult(requireUser(headers))
}

export async function requireApiRole(role: UserRole, headers?: Headers) {
  return asApiAuthorizationResult(requireRole(role, headers))
}

export async function requireApiAnyRole(roles: readonly UserRole[], headers?: Headers) {
  return asApiAuthorizationResult(requireAnyRole(roles, headers))
}

export { AuthorizationError, authorizationErrorResponse } from "./authorization-core"
