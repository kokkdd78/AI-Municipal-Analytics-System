"use client"

import { useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"

import { useAuth } from "@/context/auth-context"
import { destinationForMunicipalRole } from "@/lib/auth/client"
import type { UserRole } from "@/types/domain"

export default function AuthenticatedRoleBoundary({
  role,
  children,
}: {
  role: UserRole
  children: ReactNode
}) {
  const router = useRouter()
  const { isLoading, userRole } = useAuth()

  useEffect(() => {
    if (isLoading || userRole === role) return
    router.replace(userRole ? destinationForMunicipalRole(userRole) : "/auth")
    router.refresh()
  }, [isLoading, role, router, userRole])

  if (isLoading || userRole !== role) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" aria-live="polite">
        <p className="text-sm text-muted-foreground">Checking your session...</p>
      </div>
    )
  }

  return children
}
