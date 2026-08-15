import type { UserRole } from "../../generated/prisma/client"

export const ROLE_HOMES = {
  Citizen: "/citizen-app",
  Manager: "/manager",
  Crew: "/crew",
} as const satisfies Record<UserRole, string>

const EXACT_PROTECTED_ROUTES = new Map<string, UserRole>([
  ["/citizen-app", "Citizen"],
  ["/map", "Citizen"],
  ["/my-reports", "Citizen"],
  ["/report", "Citizen"],
  ["/report-success", "Citizen"],
  ["/manager", "Manager"],
  ["/crew", "Crew"],
])

const TRACKED_REPORT_PATH = /^\/report\/track\/[A-Za-z0-9_-]{1,128}$/

export function roleHome(role: UserRole): string {
  return ROLE_HOMES[role]
}

export function requiredRoleForPage(pathname: string): UserRole | null {
  const exactRole = EXACT_PROTECTED_ROUTES.get(pathname)
  if (exactRole) return exactRole

  if (TRACKED_REPORT_PATH.test(pathname)) return "Citizen"
  return null
}

export function pageAuthorizationRedirect(
  user: { role: UserRole } | null,
  requiredRole: UserRole,
): string | null {
  if (!user) return "/auth"
  if (user.role !== requiredRole) return roleHome(user.role)
  return null
}

export function safeCallbackPath(value: unknown, role: UserRole): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null
  if (!value.startsWith("/") || value.startsWith("//")) return null
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null
  if (value.includes("%") || value.includes("?") || value.includes("#")) return null

  let parsed: URL
  try {
    parsed = new URL(value, "https://municipal.invalid")
  } catch {
    return null
  }

  if (parsed.origin !== "https://municipal.invalid" || parsed.pathname !== value) return null
  return requiredRoleForPage(parsed.pathname) === role ? parsed.pathname : null
}
