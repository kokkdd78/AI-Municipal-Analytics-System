"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { type District, findDistrictByName } from "@/constants/districts"

export interface User {
  name: string
  district: string
  avatar: string
  role: "citizen" | "manager" | null
}

export interface Report {
  id: string
  title: string
  lat: number
  lng: number
  votes: number
  description?: string
  type?: string
  photo?: string | null
  district?: string
  createdAt?: string
  status?: "pending" | "in-progress" | "resolved"
  authorId?: string
}

export interface Suggestion {
  id: string
  title: string
  category: string
  lat: number
  lng: number
  description: string
  district: District
  createdAt: string
  votes: number
}

interface DataContextType {
  user: User
  updateUser: (updates: Partial<User>) => void
  reports: Report[]
  addReport: (report: Report) => void
  upvoteReport: (id: string) => void
  votedReports: Set<string>
  suggestions: Suggestion[]
  addSuggestion: (suggestion: Suggestion) => void
  upvoteSuggestion: (id: string) => void
  votedSuggestions: Set<string>
}

const DataContext = createContext<DataContextType | undefined>(undefined)

const DEFAULT_USER: User = {
  name: "Ayman AlJenidi",
  district: "Al-Naeem",
  avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Ayman",
  role: "citizen",
}

const DEFAULT_REPORTS: Report[] = [
  {
    id: "main-1",
    title: "Pothole on Main St",
    lat: 21.6169,
    lng: 39.1564,
    votes: 12,
    type: "pothole",
    district: "Al-Naeem",
    status: "pending",
  },
  {
    id: "main-2",
    title: "Broken Streetlight",
    lat: 21.618,
    lng: 39.158,
    votes: 8,
    type: "light",
    district: "Al-Naeem",
    status: "in-progress",
  },
  {
    id: "main-3",
    title: "Trash Pile",
    lat: 21.615,
    lng: 39.155,
    votes: 5,
    type: "trash",
    district: "Al-Naeem",
    status: "resolved",
  },
]

export function DataProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(DEFAULT_USER)
  const [reports, setReports] = useState<Report[]>(DEFAULT_REPORTS)
  const [votedReports, setVotedReports] = useState<Set<string>>(new Set())
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [votedSuggestions, setVotedSuggestions] = useState<Set<string>>(new Set())
  const [isInitialized, setIsInitialized] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem("app_user")
    const storedReports = localStorage.getItem("app_reports")
    const storedVotedReports = localStorage.getItem("app_voted_reports")
    const storedSuggestions = localStorage.getItem("app_suggestions")
    const storedVotedSuggestions = localStorage.getItem("app_voted_suggestions")

    if (storedUser) setUser(JSON.parse(storedUser))
    if (storedReports) setReports(JSON.parse(storedReports))
    if (storedVotedReports) setVotedReports(new Set(JSON.parse(storedVotedReports)))

    if (storedSuggestions) {
      const parsed = JSON.parse(storedSuggestions)
      const migrated = parsed.map((s: any) => {
        if (typeof s.district === "string") {
          const districtObj = findDistrictByName(s.district)
          return { ...s, district: districtObj || { id: "al-naeem", name: "Al-Naeem", arabic: "النعيم" } }
        }
        return s
      })
      setSuggestions(migrated)
    }

    if (storedVotedSuggestions) setVotedSuggestions(new Set(JSON.parse(storedVotedSuggestions)))

    setIsInitialized(true)
  }, [])

  // Save to localStorage whenever data changes
  useEffect(() => {
    if (!isInitialized) return
    localStorage.setItem("app_user", JSON.stringify(user))
  }, [user, isInitialized])

  useEffect(() => {
    if (!isInitialized) return
    localStorage.setItem("app_reports", JSON.stringify(reports))
  }, [reports, isInitialized])

  useEffect(() => {
    if (!isInitialized) return
    localStorage.setItem("app_voted_reports", JSON.stringify(Array.from(votedReports)))
  }, [votedReports, isInitialized])

  useEffect(() => {
    if (!isInitialized) return
    localStorage.setItem("app_suggestions", JSON.stringify(suggestions))
  }, [suggestions, isInitialized])

  useEffect(() => {
    if (!isInitialized) return
    localStorage.setItem("app_voted_suggestions", JSON.stringify(Array.from(votedSuggestions)))
  }, [votedSuggestions, isInitialized])

  const updateUser = (updates: Partial<User>) => {
    setUser((prev) => ({ ...prev, ...updates }))
  }

  const addReport = (report: Report) => {
    setReports((prev) => [...prev, report])
  }

  const upvoteReport = (id: string) => {
    if (votedReports.has(id)) return
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, votes: r.votes + 1 } : r)))
    setVotedReports((prev) => {
      const newSet = new Set(prev)
      newSet.add(id)
      return newSet
    })
  }

  const addSuggestion = (suggestion: Suggestion) => {
    setSuggestions((prev) => [...prev, suggestion])
  }

  const upvoteSuggestion = (id: string) => {
    if (votedSuggestions.has(id)) return
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, votes: s.votes + 1 } : s)))
    setVotedSuggestions((prev) => {
      const newSet = new Set(prev)
      newSet.add(id)
      return newSet
    })
  }

  return (
    <DataContext.Provider
      value={{
        user,
        updateUser,
        reports,
        addReport,
        upvoteReport,
        votedReports,
        suggestions,
        addSuggestion,
        upvoteSuggestion,
        votedSuggestions,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const context = useContext(DataContext)
  if (context === undefined) {
    throw new Error("useData must be used within a DataProvider")
  }
  return context
}
