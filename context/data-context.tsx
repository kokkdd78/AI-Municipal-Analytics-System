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
  uploadReportImage as uploadServerReportImage,
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
  mergeUploadedReportAttachment,
  mergeCitizenReportViews,
  mayDisplayServerReports,
  ownedLegacyReportViews,
  serverReportToView,
  type CitizenReportSource,
  type CitizenReportView,
} from "@/lib/reports/client-state"
import type { CreateReportRequest } from "@/lib/reports/contracts"
import type { CommunityReportDto, OwnedReportDto, ReportDetailDto } from "@/lib/reports/dto"
import {
  createSuggestion as createServerSuggestion,
  listSuggestions as listServerSuggestions,
  SuggestionClientError,
  suggestionClientErrorMessage,
  type SuggestionRequestOptions,
  voteForSuggestion,
} from "@/lib/suggestions/client"
import {
  applyLegacySuggestionVote,
  legacySuggestionViews,
  mayDisplayServerSuggestions,
  mergeCitizenSuggestionViews,
  mergeSuggestionVote,
  prependSuggestionById,
  serverSuggestionToView,
  type CitizenSuggestionView,
} from "@/lib/suggestions/client-state"
import type { CreateSuggestionRequest } from "@/lib/suggestions/contracts"
import type { SuggestionDto } from "@/lib/suggestions/dto"
import type { MunicipalUser } from "@/types/domain"

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
  uploadReportImage: (reportId: string, image: File, options?: ReportRequestOptions) => Promise<void>
  isCreatingReport: boolean
  upvoteReport: (id: string) => Promise<void>
  votingReportIds: Set<string>
  reportMutationError: string | null
  clearReportMutationError: () => void
  reportSource: (id: string) => CitizenReportSource | null
  votedReports: Set<string>
  suggestions: CitizenSuggestionView[]
  suggestionLoadState: ReportLoadState
  refreshSuggestions: () => Promise<void>
  addSuggestion: (input: CreateSuggestionRequest, options?: SuggestionRequestOptions) => Promise<SuggestionDto>
  isCreatingSuggestion: boolean
  upvoteSuggestion: (id: string) => Promise<void>
  votingSuggestionIds: Set<string>
  suggestionMutationError: string | null
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

interface ServerSuggestionState {
  userId: string | null
  suggestions: SuggestionDto[]
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
}

const EMPTY_SERVER_SUGGESTION_STATE: ServerSuggestionState = {
  userId: null,
  suggestions: [],
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
  const [suggestionState, setSuggestionState] = useState<ServerSuggestionState>(EMPTY_SERVER_SUGGESTION_STATE)
  const [isCreatingSuggestion, setIsCreatingSuggestion] = useState(false)
  const [votingSuggestionIds, setVotingSuggestionIds] = useState<Set<string>>(() => new Set())
  const [suggestionMutationError, setSuggestionMutationError] = useState<string | null>(null)
  const loadGateRef = useRef(createLatestReportRequestGate())
  const suggestionLoadGateRef = useRef(createLatestReportRequestGate())
  const createControllerRef = useRef<AbortController | null>(null)
  const votingControllersRef = useRef(new Map<string, AbortController>())
  const suggestionCreateControllerRef = useRef<AbortController | null>(null)
  const suggestionVotingControllersRef = useRef(new Map<string, AbortController>())

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
  const legacySuggestions = useMemo(
    () => legacySuggestionViews(storedState.suggestions, storedState.votedSuggestionIds),
    [storedState.suggestions, storedState.votedSuggestionIds],
  )
  const suggestionStateBelongsToCitizen = mayDisplayServerSuggestions(
    suggestionState.userId,
    authenticatedUser ? { id: authenticatedUser.id, role: authenticatedUser.role } : null,
  )
  const serverSuggestionViews = useMemo(
    () => suggestionStateBelongsToCitizen
      ? suggestionState.suggestions.map(serverSuggestionToView)
      : [],
    [suggestionState.suggestions, suggestionStateBelongsToCitizen],
  )
  const suggestions = useMemo(
    () => mergeCitizenSuggestionViews(serverSuggestionViews, legacySuggestions),
    [legacySuggestions, serverSuggestionViews],
  )
  const votedSuggestions = useMemo(
    () => new Set(suggestions.filter((suggestion) => suggestion.hasVoted).map((suggestion) => suggestion.id)),
    [suggestions],
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

  const loadSuggestions = useCallback(async (userId: string, refreshing: boolean) => {
    const token = suggestionLoadGateRef.current.begin(userId)
    setSuggestionState((current) => ({
      userId,
      suggestions: refreshing && current.userId === userId ? current.suggestions : [],
      isLoading: !refreshing,
      isRefreshing: refreshing,
      error: null,
    }))
    try {
      const result = await awaitCurrentReportList(
        listServerSuggestions({ signal: token.signal }),
        suggestionLoadGateRef.current,
        token,
        () => currentCitizenIdRef.current,
      )
      if (!result.current) return
      setSuggestionState({
        userId,
        suggestions: result.value,
        isLoading: false,
        isRefreshing: false,
        error: null,
      })
    } catch (error) {
      if (
        (error instanceof SuggestionClientError && error.kind === "aborted")
        || !suggestionLoadGateRef.current.isCurrent(token, currentCitizenIdRef.current)
      ) return
      setSuggestionState((current) => current.userId === userId
        ? {
            ...current,
            suggestions: refreshing ? current.suggestions : [],
            isLoading: false,
            isRefreshing: false,
            error: suggestionClientErrorMessage(error),
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

  useEffect(() => {
    const loadGate = suggestionLoadGateRef.current
    const votingControllers = suggestionVotingControllersRef.current
    let active = true
    loadGate.invalidate()
    suggestionCreateControllerRef.current?.abort()
    suggestionCreateControllerRef.current = null
    for (const controller of votingControllers.values()) controller.abort()
    votingControllers.clear()
    queueMicrotask(() => {
      if (!active) return
      setIsCreatingSuggestion(false)
      setVotingSuggestionIds(new Set())
      setSuggestionMutationError(null)
      if (!citizenId) {
        setSuggestionState(EMPTY_SERVER_SUGGESTION_STATE)
        return
      }
      void loadSuggestions(citizenId, false)
    })
    return () => {
      active = false
      loadGate.invalidate()
      suggestionCreateControllerRef.current?.abort()
      for (const controller of votingControllers.values()) controller.abort()
    }
  }, [citizenId, loadSuggestions])

  const refreshReports = useCallback(async () => {
    const userId = currentCitizenIdRef.current
    if (!userId) return
    await loadReports(userId, true)
  }, [loadReports])

  const refreshSuggestions = useCallback(async () => {
    const userId = currentCitizenIdRef.current
    if (!userId) return
    await loadSuggestions(userId, true)
  }, [loadSuggestions])

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

  const uploadReportImage = useCallback(async (
    reportId: string,
    image: File,
    options: ReportRequestOptions = {},
  ): Promise<void> => {
    const userId = currentCitizenIdRef.current
    if (!userId) throw new ReportClientError("authentication", 401)
    const attachment = await uploadServerReportImage(reportId, image, options)
    if (options.signal?.aborted || currentCitizenIdRef.current !== userId) {
      throw new ReportClientError("aborted", null)
    }
    setServerState((current) => current.userId === userId
      ? { ...current, ...mergeUploadedReportAttachment(current, reportId, attachment) }
      : current)
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

  const addSuggestion = useCallback(async (
    input: CreateSuggestionRequest,
    options: SuggestionRequestOptions = {},
  ): Promise<SuggestionDto> => {
    const userId = currentCitizenIdRef.current
    if (!userId) throw new SuggestionClientError("authentication", 401)
    if (suggestionCreateControllerRef.current) throw new SuggestionClientError("conflict", 409)
    const controller = new AbortController()
    const stopForwarding = forwardReportAbortSignal(options.signal, controller)
    suggestionCreateControllerRef.current = controller
    setIsCreatingSuggestion(true)
    setSuggestionMutationError(null)
    try {
      const result = await awaitCurrentReportMutation(
        createServerSuggestion(input, { signal: controller.signal }),
        controller.signal,
        userId,
        () => currentCitizenIdRef.current,
      )
      if (!result.current) throw new SuggestionClientError("aborted", null)
      suggestionLoadGateRef.current.invalidate()
      setSuggestionState((current) => current.userId === userId
        ? { ...current, suggestions: prependSuggestionById(current.suggestions, result.value), error: null }
        : current)
      return result.value
    } catch (error) {
      if (!(error instanceof SuggestionClientError && error.kind === "aborted")) {
        setSuggestionMutationError(suggestionClientErrorMessage(error))
      }
      throw error
    } finally {
      stopForwarding()
      if (suggestionCreateControllerRef.current === controller) {
        suggestionCreateControllerRef.current = null
        setIsCreatingSuggestion(false)
      }
    }
  }, [])

  const upvoteSuggestion = useCallback(async (id: string): Promise<void> => {
    const userId = currentCitizenIdRef.current
    if (!userId) return
    const serverSuggestion = suggestionState.userId === userId
      ? suggestionState.suggestions.find((suggestion) => suggestion.id === id)
      : undefined
    const legacySuggestion = legacySuggestions.find((suggestion) => suggestion.id === id)
    if (serverSuggestion?.hasVoted || (!serverSuggestion && legacySuggestion?.hasVoted)) return
    if (suggestionVotingControllersRef.current.has(id)) return

    setSuggestionMutationError(null)
    if (!serverSuggestion && legacySuggestion) {
      const nextState = applyLegacySuggestionVote(storedState, id)
      if (nextState !== storedState) {
        updateAppStorage({
          suggestions: nextState.suggestions,
          votedSuggestionIds: nextState.votedSuggestionIds,
        })
      }
      return
    }
    if (!serverSuggestion) return

    const controller = new AbortController()
    suggestionVotingControllersRef.current.set(id, controller)
    setVotingSuggestionIds((current) => new Set(current).add(id))
    try {
      const result = await awaitCurrentReportMutation(
        voteForSuggestion(id, { signal: controller.signal }),
        controller.signal,
        userId,
        () => currentCitizenIdRef.current,
      )
      if (!result.current) return
      suggestionLoadGateRef.current.invalidate()
      setSuggestionState((current) => current.userId === userId
        ? { ...current, suggestions: mergeSuggestionVote(current.suggestions, id, result.value.votes) }
        : current)
    } catch (error) {
      if (!(error instanceof SuggestionClientError && error.kind === "aborted")) {
        setSuggestionMutationError(suggestionClientErrorMessage(error))
      }
    } finally {
      if (suggestionVotingControllersRef.current.get(id) === controller) {
        suggestionVotingControllersRef.current.delete(id)
        setVotingSuggestionIds((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
      }
    }
  }, [legacySuggestions, storedState, suggestionState.suggestions, suggestionState.userId])

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

  const suggestionLoadState = useMemo<ReportLoadState>(() => citizenId
    ? suggestionStateBelongsToCitizen
      ? {
          isLoading: suggestionState.isLoading,
          isRefreshing: suggestionState.isRefreshing,
          error: suggestionState.error,
        }
      : { isLoading: true, isRefreshing: false, error: null }
    : { isLoading: false, isRefreshing: false, error: null }, [
      citizenId,
      suggestionState.error,
      suggestionState.isLoading,
      suggestionState.isRefreshing,
      suggestionStateBelongsToCitizen,
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
    uploadReportImage,
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
    suggestionLoadState,
    refreshSuggestions,
    addSuggestion,
    isCreatingSuggestion,
    upvoteSuggestion,
    votingSuggestionIds,
    suggestionMutationError,
    votedSuggestions,
  }), [
    addSuggestion,
    createReport,
    uploadReportImage,
    isCreatingReport,
    legacyReports,
    myReports,
    refreshReports,
    reportLoadState,
    reportMutationError,
    reports,
    refreshSuggestions,
    suggestions,
    suggestionLoadState,
    suggestionMutationError,
    updateUser,
    upvoteReport,
    upvoteSuggestion,
    user,
    votedReports,
    votedSuggestions,
    votingReportIds,
    votingSuggestionIds,
    isCreatingSuggestion,
  ])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextType {
  const context = useContext(DataContext)
  if (context === undefined) throw new Error("useData must be used within a DataProvider")
  return context
}
