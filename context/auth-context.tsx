"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

type UserRole = "Citizen" | "Manager" | "Crew" | null

interface UserData {
  fullName: string
  phone: string
  district?: string
}

interface AuthContextType {
  userRole: UserRole
  setUserRole: (role: UserRole) => void
  userData: UserData | null
  setUserData: (data: UserData | null) => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userRole, setUserRole] = useState<UserRole>(null)
  const [userData, setUserData] = useState<UserData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const storedRole = localStorage.getItem("userRole")
    if (storedRole) {
      setUserRole(storedRole as UserRole)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    if (userRole) {
      localStorage.setItem("userRole", userRole)
    } else {
      localStorage.removeItem("userRole")
    }
  }, [userRole])

  return (
    <AuthContext.Provider value={{ userRole, setUserRole, userData, setUserData, isLoading }}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return context
}
