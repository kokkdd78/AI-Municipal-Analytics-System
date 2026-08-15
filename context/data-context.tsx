"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import { useAuth } from "@/context/auth-context"
import {
  applySuggestionVote,
  getAppStorageSnapshot,
  getProfileForAuthenticatedUser,
  parseAppStorage,
  subscribeAppStorage,
  updateAppStorage,
  updateProfileForAuthenticatedUser,
} from "@/lib/client-storage"
import {
  createReport as createServerReport,
  listAllReports,
  ReportClientError,
  reportClientErrorMessage,
  type ReportRequestOptions,
  voteForReport,
} from "@/lib/reports/client"
import {
  applyLegacyReportVote,
  awaitCurrentReportList,
  awaitCurrentReportMutation,
  createLatestReportRequestGate,
  forwardReportAbortSignal,
  mergeCompletedServerVote,
  mergeCreatedServerReport,
  mergeCitizenReportViews,
  mayDisplayServerReports,
  ownedLegacyReportViews,
  serverReportToView,
  type CitizenReportSource,
  type CitizenReportView,
} from "@/lib/reports/client-state"
import type { CreateReportRequest } from "@/lib/reports/contracts"
import type { CommunityReportDto, OwnedReportDto, ReportDetailDto } from "@/lib/reports/dto"
import type { MunicipalUser, Suggestion } from "@/types/domain"

interface ReportLoadState {
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
}

interface DataContextType {
  user: MunicipalUser | null
  updateUser: (updates: Pick<Partial<MunicipalUser>, "name" | "district" | "avatar">) => void
  reports: CitizenReportView[]
  myReports: CitizenReportView[]
  legacyReports: CitizenReportView[]
  reportLoadState: ReportLoadState
  refreshReports: () => Promise<void>
  createReport: (input: CreateReportRequest, options?: ReportRequestOptions) => Promise<ReportDetailDto>
  isCreatingReport: boolean
  upvoteReport: (id: string) => Promise<void>
  votingReportIds: Set<string>
  reportMutationError: string | null
  clearReportMutationError: () => void
  reportSource: (id: string) => CitizenReportSource | null
  votedReports: Set<string>
  suggestions: Suggestion[]
  addSuggestion: (suggestion: Suggestion) => void
  upvoteSuggestion: (id: string) => void
  votedSuggestions: Set<string>
}

interface ServerReportState {
  userId: string | null
  community: CommunityReportDto[]
  mine: OwnedReportDto[]
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
}

const EMPTY_SERVER_REPORT_STATE: ServerReportState = {
  userId: null,
  community: [],
  mine: [],
  isLoading: false,
  isRefreshing: false,
  error: null,
}

const DataContext = createContext<DataContextType | undefined>(undefined)

export function DataProvider({ children }: { children: ReactNode }) {
  const { user: authenticatedUser } = useAuth()
  const rawStorage = useSyncExternalStore(subscribeAppStorage, getAppStorageSnapshot, () => null)
  const storedState = useMemo(() => parseAppStorage(rawStorage), [rawStorage])
  const citizenId = authenticatedUser?.role === "Citizen" ? authenticatedUser.id : null
  const currentCitizenIdRef = useRef<string | null>(citizenId)

  const [serverState, setServerState] = useState<ServerReportState>(EMPTY_SERVER_REPORT_STATE)
  const [isCreatingReport, setIsCreatingReport] = useState(false)
  const [votingReportIds, setVotingReportIds] = useState<Set<string>>(() => new Set())
  const [reportMutationError, setReportMutationError] = useState<string | null>(null)
  const loadGateRef = useRef(createLatestReportRequestGate())
  const createControllerRef = useRef<AbortController | null>(null)
  const votingControllersRef = useRef(new Map<string, AbortController>())

  const user = citizenId ? getProfileForAuthenticatedUser(storedState, citizenId) : null
  const legacyReports = useMemo(
    () => ownedLegacyReportViews(
      storedState.reports,
      storedState.votedReportIds,
      authenticatedUser ? { id: authenticatedUser.id, role: authenticatedUser.role } : null,
    ),
    [authenticatedUser, storedState.reports, storedState.votedReportIds],
  )

  const stateBelongsToCitizen = mayDisplayServerReports(
    serverState.userId,
    authenticatedUser ? { id: authenticatedUser.id, role: authenticatedUser.role } : null,
  )
  const serverCommunityViews = useMemo(
    () => stateBelongsToCitizen ? serverState.community.map(serverReportToView) : [],
    [serverState.community, stateBelongsToCitizen],
  )
  const serverOwnedViews = useMemo(
    () => stateBelongsToCitizen ? serverState.mine.map(serverReportToView) : [],
    [serverState.mine, stateBelongsToCitizen],
  )
  const reports = useMemo(
    () => mergeCitizenReportViews(serverCommunityViews, legacyReports),
    [legacyReports, serverCommunityViews],
  )
  const myReports = useMemo(
    () => mergeCitizenReportViews(serverOwnedViews, legacyReports),
    [legacyReports, serverOwnedViews],
  )
  const votedReports = useMemo(
    () => new Set(reports.filter((report) => report.hasVoted).map((report) => report.id)),
    [reports],
  )

  const loadReports = useCallback(async (userId: string, refreshing: boolean) => {
    const token = loadGateRef.current.begin(userId)
    setServerState((current) => ({
      userId,
      community: refreshing && current.userId === userId ? current.community : [],
      mine: refreshing && current.userId === userId ? current.mine : [],
      isLoading: !refreshing,
      isRefreshing: refreshing,
      error: null,
    }))

    try {
      const result = await awaitCurrentReportList(
        Promise.all([
          listAllReports("community", { signal: token.signal }),
          listAllReports("mine", { signal: token.signal }),
        ]),
        loadGateRef.current,
        token,
        () => currentCitizenIdRef.current,
      )
      if (!result.current) return
      const [community, mine] = result.value
      setServerState({ userId, community, mine, isLoading: false, isRefreshing: false, error: null })
    } catch (error) {
      if (
        (error instanceof ReportClientError && error.kind === "aborted")
        || !loadGateRef.current.isCurrent(token, currentCitizenIdRef.current)
      ) {
        return
      }
      setServerState((current) => current.userId === userId
        ? {
            ...current,
            community: refreshing ? current.community : [],
            mine: refreshing ? current.mine : [],
            isLoading: false,
            isRefreshing: false,
            error: reportClientErrorMessage(error),
          }
        : current)
    }
  }, [])

  useEffect(() => {
    const loadGate = loadGateRef.current
    const votingControllers = votingControllersRef.current
    let active = true
    currentCitizenIdRef.current = citizenId
    loadGate.invalidate()
    createControllerRef.current?.abort()
    createControllerRef.current = null
    for (const controller of votingControllers.values()) controller.abort()
    votingControllers.clear()
    queueMicrotask(() => {
      if (!active) return
      setIsCreatingReport(false)
      setVotingReportIds(new Set())
      setReportMutationError(null)
      if (!citizenId) {
        setServerState(EMPTY_SERVER_REPORT_STATE)
        return
      }
      void loadReports(citizenId, false)
    })
    return () => {
      active = false
      loadGate.invalidate()
      createControllerRef.current?.abort()
      for (const controller of votingControllers.values()) controller.abort()
    }
  }, [citizenId, loadReports])

  const refreshReports = useCallback(async () => {
    const userId = currentCitizenIdRef.current
    if (!userId) return
    await loadReports(userId, true)
  }, [loadReports])

  const updateUser = useCallback((updates: Pick<Partial<MunicipalUser>, "name" | "district" | "avatar">) => {
    if (!citizenId) return
    updateProfileForAuthenticatedUser(citizenId, updates)
  }, [citizenId])

  const createReport = useCallback(async (
    input: CreateReportRequest,
    options: ReportRequestOptions = {},
  ): Promise<ReportDetailDto> => {
    const userId = currentCitizenIdRef.current
    if (!userId) throw new ReportClientError("authentication", 401)
    if (createControllerRef.current) throw new ReportClientError("conflict", 409)

    const controller = new AbortController()
    const stopForwardingAbort = forwardReportAbortSignal(options.signal, controller)
    createControllerRef.current = controller
    setIsCreatingReport(true)
    setReportMutationError(null)
    try {
      const result = await awaitCurrentReportMutation(
        createServerReport(input, { signal: controller.signal }),
        controller.signal,
        userId,
        () => currentCitizenIdRef.current,
      )
      if (!result.current) throw new ReportClientError("aborted", null)
      const created = result.value
      loadGateRef.current.invalidate()
      setServerState((current) => current.userId === userId
        ? {
            ...current,
            ...mergeCreatedServerReport(current, created, userId),
            isLoading: false,
            isRefreshing: false,
            error: null,
          }
        : current)
      return created
    } catch (error) {
      if (!(error instanceof ReportClientError && error.kind === "aborted")) {
        setReportMutationError(reportClientErrorMessage(error))
      }
      throw error
    } finally {
      stopForwardingAbort()
      if (createControllerRef.current === controller) {
        createControllerRef.current = null
        setIsCreatingReport(false)
      }
    }
  }, [])

  const upvoteReport = useCallback(async (id: string): Promise<void> => {
    const userId = currentCitizenIdRef.current
    if (!userId) return

    const currentServer = serverState.userId === userId
      ? [...serverState.community, ...serverState.mine].find((report) => report.id === id)
      : undefined
    const legacy = legacyReports.find((report) => report.id === id)
    if (currentServer?.hasVoted || (!currentServer && legacy?.hasVoted)) return
    if (votingControllersRef.current.has(id)) return

    setReportMutationError(null)
    if (!currentServer && legacy) {
      const nextState = applyLegacyReportVote(storedState, id)
      if (nextState !== storedState) {
        updateAppStorage({ reports: nextState.reports, votedReportIds: nextState.votedReportIds })
      }
      return
    }
    if (!currentServer) return

    const controller = new AbortController()
    votingControllersRef.current.set(id, controller)
    setVotingReportIds((current) => new Set(current).add(id))
    try {
      const mutation = await awaitCurrentReportMutation(
        voteForReport(id, { signal: controller.signal }),
        controller.signal,
        userId,
        () => currentCitizenIdRef.current,
      )
      if (!mutation.current) return
      loadGateRef.current.invalidate()
      setServerState((current) => current.userId === userId
        ? {
            ...current,
            ...mergeCompletedServerVote(current, id, mutation.value.votes),
            isLoading: false,
            isRefreshing: false,
            error: null,
          }
        : current)
    } catch (error) {
      if (!(error instanceof ReportClientError && error.kind === "aborted")) {
        setReportMutationError(reportClientErrorMessage(error))
      }
    } finally {
      if (votingControllersRef.current.get(id) === controller) {
        votingControllersRef.current.delete(id)
        setVotingReportIds((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
      }
    }
  }, [legacyReports, serverState.community, serverState.mine, serverState.userId, storedState])

  const suggestions = storedState.suggestions
  const votedSuggestions = useMemo(
    () => new Set(storedState.votedSuggestionIds),
    [storedState.votedSuggestionIds],
  )

  const addSuggestion = useCallback((suggestion: Suggestion) => {
    updateAppStorage({ suggestions: [...suggestions, suggestion] })
  }, [suggestions])

  const upvoteSuggestion = useCallback((id: string) => {
    const nextState = applySuggestionVote(storedState, id)
    if (nextState === storedState) return
    updateAppStorage({
      suggestions: nextState.suggestions,
      votedSuggestionIds: nextState.votedSuggestionIds,
    })
  }, [storedState])

  const reportLoadState = useMemo<ReportLoadState>(() => citizenId
    ? stateBelongsToCitizen
      ? {
          isLoading: serverState.isLoading,
          isRefreshing: serverState.isRefreshing,
          error: serverState.error,
        }
      : { isLoading: true, isRefreshing: false, error: null }
    : { isLoading: false, isRefreshing: false, error: null }, [
      citizenId,
      serverState.error,
      serverState.isLoading,
      serverState.isRefreshing,
      stateBelongsToCitizen,
    ])

  const value = useMemo<DataContextType>(() => ({
    user,
    updateUser,
    reports,
    myReports,
    legacyReports,
    reportLoadState,
    refreshReports,
    createReport,
    isCreatingReport,
    upvoteReport,
    votingReportIds,
    reportMutationError,
    clearReportMutationError: () => setReportMutationError(null),
    reportSource: (id) => reports.find((report) => report.id === id)?.source
      ?? myReports.find((report) => report.id === id)?.source
      ?? null,
    votedReports,
    suggestions,
    addSuggestion,
    upvoteSuggestion,
    votedSuggestions,
  }), [
    addSuggestion,
    createReport,
    isCreatingReport,
    legacyReports,
    myReports,
    refreshReports,
    reportLoadState,
    reportMutationError,
    reports,
    suggestions,
    updateUser,
    upvoteReport,
    upvoteSuggestion,
    user,
    votedReports,
    votedSuggestions,
    votingReportIds,
  ])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextType {
  const context = useContext(DataContext)
  if (context === undefined) throw new Error("useData must be used within a DataProvider")
  return context
}
