"use client"

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react"
import {
  applySuggestionVote,
  getProfileForAuthenticatedUser,
  getAppStorageSnapshot,
  parseAppStorage,
  subscribeAppStorage,
  updateProfileForAuthenticatedUser,
  updateAppStorage,
} from "@/lib/client-storage"
import { useAuth } from "@/context/auth-context"
import type { MunicipalUser, Report, Suggestion } from "@/types/domain"

interface DataContextType {
  user: MunicipalUser | null
  updateUser: (updates: Pick<Partial<MunicipalUser>, "name" | "district" | "avatar">) => void
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

const DEFAULT_REPORTS: Report[] = [
  {
    id: "main-1",
    title: "Pothole on Main St",
    description: "A pothole needs municipal inspection.",
    category: "pothole",
    location: { lat: 21.6169, lng: 39.1564 },
    votes: 12,
    district: "Al-Naeem",
    status: "pending",
    createdAt: "2026-08-10T08:00:00.000Z",
    attachments: [],
  },
  {
    id: "main-2",
    title: "Broken Streetlight",
    description: "A streetlight is not working after dark.",
    category: "lighting",
    location: { lat: 21.618, lng: 39.158 },
    votes: 8,
    district: "Al-Naeem",
    status: "in-progress",
    createdAt: "2026-08-09T18:30:00.000Z",
    attachments: [],
  },
  {
    id: "main-3",
    title: "Trash Pile",
    description: "Waste has accumulated beside the road.",
    category: "trash",
    location: { lat: 21.615, lng: 39.155 },
    votes: 5,
    district: "Al-Naeem",
    status: "resolved",
    createdAt: "2026-08-08T10:15:00.000Z",
    attachments: [],
  },
]

export function DataProvider({ children }: { children: ReactNode }) {
  const { user: authenticatedUser } = useAuth()
  const rawStorage = useSyncExternalStore(subscribeAppStorage, getAppStorageSnapshot, () => null)
  const storedState = useMemo(() => parseAppStorage(rawStorage), [rawStorage])
  const user =
    authenticatedUser?.role === "Citizen"
      ? getProfileForAuthenticatedUser(storedState, authenticatedUser.id)
      : null
  const reports = storedState.reports.length > 0 ? storedState.reports : DEFAULT_REPORTS
  const votedReports = useMemo(() => new Set(storedState.votedReportIds), [storedState.votedReportIds])
  const suggestions = storedState.suggestions
  const votedSuggestions = useMemo(
    () => new Set(storedState.votedSuggestionIds),
    [storedState.votedSuggestionIds],
  )

  const updateUser = (updates: Pick<Partial<MunicipalUser>, "name" | "district" | "avatar">) => {
    if (!authenticatedUser || authenticatedUser.role !== "Citizen") return
    updateProfileForAuthenticatedUser(authenticatedUser.id, updates)
  }

  const addReport = (report: Report) => {
    if (!authenticatedUser || authenticatedUser.role !== "Citizen" || !user) return
    updateAppStorage({ reports: [...reports, { ...report, authorId: authenticatedUser.id }] })
  }

  const upvoteReport = (id: string) => {
    if (votedReports.has(id)) return
    updateAppStorage({
      reports: reports.map((report) => (report.id === id ? { ...report, votes: report.votes + 1 } : report)),
      votedReportIds: [...votedReports, id],
    })
  }

  const addSuggestion = (suggestion: Suggestion) => {
    updateAppStorage({ suggestions: [...suggestions, suggestion] })
  }

  const upvoteSuggestion = (id: string) => {
    const nextState = applySuggestionVote(storedState, id)
    if (nextState === storedState) return

    updateAppStorage({
      suggestions: nextState.suggestions,
      votedSuggestionIds: nextState.votedSuggestionIds,
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
