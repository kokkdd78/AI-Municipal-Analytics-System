"use client"

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react"
import {
  clearAppSession,
  getAppStorageSnapshot,
  parseAppStorage,
  subscribeAppStorage,
  updateAppStorage,
} from "@/lib/client-storage"
import type { UserRole } from "@/types/domain"

interface AuthContextType {
  userRole: UserRole | null
  setUserRole: (role: UserRole | null) => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const rawStorage = useSyncExternalStore(subscribeAppStorage, getAppStorageSnapshot, () => null)
  const storedState = useMemo(() => parseAppStorage(rawStorage), [rawStorage])
  const isHydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  )
  const setUserRole = useCallback((role: UserRole | null) => {
    if (role === null) {
      clearAppSession()
    } else {
      updateAppStorage({ role })
    }
  }, [])

  return (
    <AuthContext.Provider value={{ userRole: storedState.role, setUserRole, isLoading: !isHydrated }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return context
}
