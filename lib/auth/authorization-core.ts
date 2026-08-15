import type { UserRole } from "@/generated/prisma/client"

export interface AuthenticatedMunicipalUser {
  id: string
  name: string
  role: UserRole
  isActive: true
  avatarUrl: string | null
  districtId: string | null
  departmentId: string | null
}

interface SessionIdentity {
  user: { id: string }
}

export interface AuthorizationDependencies {
  getSession(headers: Headers): Promise<SessionIdentity | null>
  findUserById(
    id: string,
  ): Promise<(Omit<AuthenticatedMunicipalUser, "isActive"> & { isActive: boolean }) | null>
}

export class AuthorizationError extends Error {
  readonly status: 401 | 403

  constructor(status: 401 | 403) {
    super(status === 401 ? "Authentication required" : "Access denied")
    this.name = "AuthorizationError"
    this.status = status
  }
}

export function createAuthorizationService(dependencies: AuthorizationDependencies) {
  async function currentUser(headers: Headers): Promise<AuthenticatedMunicipalUser | null> {
    const session = await dependencies.getSession(headers)
    if (!session) return null

    const user = await dependencies.findUserById(session.user.id)
    if (!user?.isActive) return null

    return { ...user, isActive: true }
  }

  async function requireUser(headers: Headers): Promise<AuthenticatedMunicipalUser> {
    const user = await currentUser(headers)
    if (!user) throw new AuthorizationError(401)
    return user
  }

  async function requireAnyRole(
    headers: Headers,
    roles: readonly UserRole[],
  ): Promise<AuthenticatedMunicipalUser> {
    const user = await requireUser(headers)
    if (!roles.includes(user.role)) throw new AuthorizationError(403)
    return user
  }

  async function requireRole(headers: Headers, role: UserRole): Promise<AuthenticatedMunicipalUser> {
    return requireAnyRole(headers, [role])
  }

  return { currentUser, requireUser, requireRole, requireAnyRole }
}

export function authorizationErrorResponse(error: unknown): Response {
  if (!(error instanceof AuthorizationError)) throw error
  return Response.json(
    { error: error.status === 401 ? "Authentication required" : "Access denied" },
    { status: error.status },
  )
}

export type ApiAuthorizationResult =
  | { user: AuthenticatedMunicipalUser; response?: never }
  | { user?: never; response: Response }

export async function asApiAuthorizationResult(
  authorization: Promise<AuthenticatedMunicipalUser>,
): Promise<ApiAuthorizationResult> {
  try {
    return { user: await authorization }
  } catch (error) {
    return { response: authorizationErrorResponse(error) }
  }
}
