"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import {
  getMunicipalSession,
  signOutMunicipal,
  type MunicipalAuthFailure,
  type MunicipalAuthResult,
  type SafeAuthenticationSession,
  type SafeMunicipalUser,
} from "@/lib/auth/client"
import { applyMunicipalSessionProjection, clearAppSession } from "@/lib/client-storage"
import type { UserRole } from "@/types/domain"

interface AuthContextType {
  user: SafeMunicipalUser | null
  userRole: UserRole | null
  isLoading: boolean
  isAuthenticated: boolean
  refreshSession: () => Promise<MunicipalAuthResult<SafeAuthenticationSession>>
  completeAuthentication: (
    expectedSession: SafeAuthenticationSession,
  ) => Promise<MunicipalAuthResult<SafeAuthenticationSession>>
  signOut: () => Promise<MunicipalAuthResult<{ expired: boolean }>>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function sessionsMatch(first: SafeAuthenticationSession, second: SafeAuthenticationSession): boolean {
  return (
    first.user.id === second.user.id &&
    first.user.role === second.user.role &&
    first.destination === second.destination
  )
}

const invalidSessionFailure: MunicipalAuthFailure = { ok: false, kind: "server", status: 200 }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeMunicipalUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const mountedRef = useRef(false)
  const requestSequenceRef = useRef(0)
  const signOutPromiseRef = useRef<Promise<MunicipalAuthResult<{ expired: boolean }>> | null>(null)

  const invalidatePendingRequests = useCallback(() => {
    ++requestSequenceRef.current
  }, [])

  const applySession = useCallback((session: SafeAuthenticationSession | null) => {
    if (session) {
      applyMunicipalSessionProjection(session.user)
      setUser(session.user)
    } else {
      clearAppSession()
      setUser(null)
    }
  }, [])

  const refreshSessionRequest = useCallback(
    async (
      options: { expected?: SafeAuthenticationSession; force?: boolean } = {},
    ): Promise<MunicipalAuthResult<SafeAuthenticationSession>> => {
      const requestSequence = ++requestSequenceRef.current
      const result = await getMunicipalSession({ force: options.force })
      if (!mountedRef.current || requestSequence !== requestSequenceRef.current) return result

      if (result.ok) {
        if (options.expected && !sessionsMatch(options.expected, result.data)) {
          setIsLoading(false)
          return invalidSessionFailure
        }
        applySession(result.data)
      } else if (result.kind === "session-expired") {
        applySession(null)
      }
      setIsLoading(false)
      return result
    },
    [applySession],
  )

  const refreshSession = useCallback(() => refreshSessionRequest(), [refreshSessionRequest])

  const completeAuthentication = useCallback(
    (expectedSession: SafeAuthenticationSession) =>
      refreshSessionRequest({ expected: expectedSession, force: true }),
    [refreshSessionRequest],
  )

  const signOut = useCallback((): Promise<MunicipalAuthResult<{ expired: boolean }>> => {
    if (signOutPromiseRef.current) return signOutPromiseRef.current

    ++requestSequenceRef.current
    const request = signOutMunicipal()
      .then((result) => {
        if (mountedRef.current && result.ok) {
          applySession(null)
          setIsLoading(false)
        }
        return result
      })
      .finally(() => {
        if (signOutPromiseRef.current === request) signOutPromiseRef.current = null
      })
    signOutPromiseRef.current = request
    return request
  }, [applySession])

  useEffect(() => {
    let active = true
    mountedRef.current = true
    queueMicrotask(() => {
      if (active) void refreshSessionRequest()
    })

    return () => {
      active = false
      mountedRef.current = false
      invalidatePendingRequests()
    }
  }, [invalidatePendingRequests, refreshSessionRequest])

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      userRole: user?.role ?? null,
      isLoading,
      isAuthenticated: user !== null,
      refreshSession,
      completeAuthentication,
      signOut,
    }),
    [completeAuthentication, isLoading, refreshSession, signOut, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) throw new Error("useAuth must be used within AuthProvider")
  return context
}
