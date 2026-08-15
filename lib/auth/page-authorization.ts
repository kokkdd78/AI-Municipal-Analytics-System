import "server-only"

import { redirect } from "next/navigation"

import type { UserRole } from "@/generated/prisma/client"
import { getCurrentUser } from "./authorization"
import { pageAuthorizationRedirect } from "./route-policy"

export async function requirePageRole(requiredRole: UserRole) {
  const user = await getCurrentUser()
  const destination = pageAuthorizationRedirect(user, requiredRole)
  if (destination) redirect(destination)
  return user
}
