import { findDistrictByName } from "../constants/districts"
import type { District } from "../constants/districts"
import type {
  Attachment,
  MunicipalUser,
  Report,
  ReportSeverity,
  ReportStatus,
  Suggestion,
  UserRole,
} from "@/types/domain"

export const APP_STORAGE_KEY = "smartMunicipalAssistant"
const APP_STORAGE_EVENT = "smart-municipal-assistant-storage"

export const LEGACY_STORAGE_KEYS = [
  "userRole",
  "app_user",
  "app_reports",
  "app_voted_reports",
  "app_suggestions",
  "app_voted_suggestions",
  "myReports",
  "reports",
] as const

export type ClientStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

export interface AppStorageState {
  version: 1
  role: UserRole | null
  user: MunicipalUser | null
  reports: Report[]
  votedReportIds: string[]
  suggestions: Suggestion[]
  votedSuggestionIds: string[]
}

export const EMPTY_APP_STORAGE: AppStorageState = {
  version: 1,
  role: null,
  user: null,
  reports: [],
  votedReportIds: [],
  suggestions: [],
  votedSuggestionIds: [],
}

const FALLBACK_LOCATION = { lat: 21.5433, lng: 39.1728 }
const FALLBACK_DATE = "1970-01-01T00:00:00.000Z"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function validLatitude(value: unknown): number | null {
  const latitude = finiteNumber(value)
  return latitude !== null && latitude >= -90 && latitude <= 90 ? latitude : null
}

function validLongitude(value: unknown): number | null {
  const longitude = finiteNumber(value)
  return longitude !== null && longitude >= -180 && longitude <= 180 ? longitude : null
}

function validDateString(value: unknown): boolean {
  const date = nonEmptyString(value)
  return date !== null && !Number.isNaN(Date.parse(date))
}

function safeJsonParse(value: string | null): unknown {
  if (!value) return null

  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function safeGetItem(storage: ClientStorage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function parsedArray(storage: ClientStorage, key: string): unknown[] {
  const parsed = safeJsonParse(safeGetItem(storage, key))
  return Array.isArray(parsed) ? parsed : []
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map(nonEmptyString).filter((value): value is string => value !== null))]
}

function normalizeRole(value: unknown): UserRole | null {
  const role = nonEmptyString(value)?.toLowerCase()
  if (role === "citizen") return "Citizen"
  if (role === "manager") return "Manager"
  if (role === "crew" || role === "field crew") return "Crew"
  return null
}

function isValidRawUserField(key: string, value: unknown): boolean {
  if (key === "role") return value === null || normalizeRole(value) !== null
  if (["id", "name", "fullName", "phone", "district", "avatar"].includes(key)) {
    return nonEmptyString(value) !== null
  }
  return value !== null && value !== undefined
}

function mergeRawUser(primary: unknown, fallback: unknown): Record<string, unknown> | null {
  const primaryUser = isRecord(primary) ? primary : null
  const fallbackUser = isRecord(fallback) ? fallback : null
  if (!primaryUser) return fallbackUser ? { ...fallbackUser } : null
  if (!fallbackUser) return { ...primaryUser }

  const merged: Record<string, unknown> = { ...fallbackUser }
  for (const [key, value] of Object.entries(primaryUser)) {
    if (isValidRawUserField(key, value)) merged[key] = value
  }
  return merged
}

function stableHash(value: string): string {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

function stableLegacyUserId(name: string, phone: string | null, district: string): string {
  return `legacy-user-${stableHash(`${phone ?? ""}|${name.toLowerCase()}|${district.toLowerCase()}`)}`
}

function normalizeUser(value: unknown): MunicipalUser | null {
  if (!isRecord(value)) return null

  const name = nonEmptyString(value.name) ?? nonEmptyString(value.fullName)
  if (!name) return null

  const district = nonEmptyString(value.district) ?? "Unknown District"
  const phone = nonEmptyString(value.phone)

  return {
    id: nonEmptyString(value.id) ?? stableLegacyUserId(name, phone, district),
    name,
    ...(phone ? { phone } : {}),
    district,
    avatar: nonEmptyString(value.avatar) ?? "/placeholder-user.jpg",
    role: normalizeRole(value.role),
  }
}

function normalizeCoordinates(value: Record<string, unknown>): { lat: number; lng: number } {
  const nestedLocation = isRecord(value.location) ? value.location : null
  const lat =
    validLatitude(nestedLocation?.lat) ?? validLatitude(value.lat) ?? validLatitude(value.latitude) ?? FALLBACK_LOCATION.lat
  const lng =
    validLongitude(nestedLocation?.lng) ??
    validLongitude(value.lng) ??
    validLongitude(value.longitude) ??
    FALLBACK_LOCATION.lng

  return { lat, lng }
}

function normalizeStatus(value: unknown): ReportStatus {
  return validReportStatus(value) ?? "pending"
}

function validReportStatus(value: unknown): ReportStatus | null {
  const status = nonEmptyString(value)?.toLowerCase().replace(/[\s_]+/g, "-")
  if (status === "in-progress" || status === "inprogress") return "in-progress"
  if (status === "resolved" || status === "closed" || status === "complete" || status === "completed") {
    return "resolved"
  }
  if (status === "pending") return "pending"
  return null
}

function normalizeSeverity(value: unknown): ReportSeverity | undefined {
  const severity = nonEmptyString(value)?.toLowerCase()
  if (severity === "low" || severity === "medium" || severity === "high") return severity
  return undefined
}

function normalizeAttachment(value: unknown, reportId: string, index: number): Attachment | null {
  if (!isRecord(value)) return null

  const url = nonEmptyString(value.url)
  if (!url) return null

  const rawKind = nonEmptyString(value.kind)
  const kind: Attachment["kind"] =
    rawKind === "completion-evidence" || rawKind === "avatar" ? rawKind : "report-photo"

  return {
    id: nonEmptyString(value.id) ?? `${reportId}-attachment-${index}`,
    name: nonEmptyString(value.name) ?? "Migrated attachment",
    mimeType: nonEmptyString(value.mimeType) ?? "image/*",
    url,
    kind,
  }
}

function validAttachmentKind(value: unknown): Attachment["kind"] | null {
  const kind = nonEmptyString(value)
  if (kind === "report-photo" || kind === "completion-evidence" || kind === "avatar") return kind
  return null
}

function isValidRawAttachmentField(key: string, value: unknown): boolean {
  if (key === "kind") return validAttachmentKind(value) !== null
  if (key === "id" || key === "name" || key === "mimeType" || key === "url") {
    return nonEmptyString(value) !== null
  }
  return false
}

function mergeRawAttachment(
  primary: Record<string, unknown>,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...fallback }

  for (const [key, value] of Object.entries(primary)) {
    if (isValidRawAttachmentField(key, value)) merged[key] = value
  }

  return merged
}

function mergeRawAttachments(primary: unknown, fallback: unknown): Record<string, unknown>[] {
  const mergedAttachments: Record<string, unknown>[] = []
  const sources = [
    Array.isArray(primary) ? primary : [],
    Array.isArray(fallback) ? fallback : [],
  ]

  for (const source of sources) {
    for (const value of source) {
      if (!isRecord(value)) continue

      const id = nonEmptyString(value.id)
      const url = nonEmptyString(value.url)
      const existingIndex = mergedAttachments.findIndex((attachment) => {
        const existingId = nonEmptyString(attachment.id)
        const existingUrl = nonEmptyString(attachment.url)
        return (id !== null && id === existingId) || (url !== null && url === existingUrl)
      })

      if (existingIndex === -1) {
        mergedAttachments.push({ ...value })
      } else {
        mergedAttachments[existingIndex] = mergeRawAttachment(mergedAttachments[existingIndex], value)
      }
    }
  }

  return mergedAttachments
}

function deduplicateAttachments(attachments: Attachment[]): Attachment[] {
  const deduplicated = new Map<string, Attachment>()

  for (const attachment of attachments) {
    const key = attachment.id || attachment.url
    const existing = deduplicated.get(key)
    deduplicated.set(key, existing ? { ...attachment, ...existing } : attachment)
  }

  return [...deduplicated.values()]
}

function mergeRawLocation(primary: unknown, fallback: unknown): Record<string, unknown> | undefined {
  const primaryLocation = isRecord(primary) ? primary : null
  const fallbackLocation = isRecord(fallback) ? fallback : null
  if (!primaryLocation) return fallbackLocation ? { ...fallbackLocation } : undefined
  if (!fallbackLocation) return { ...primaryLocation }

  return {
    ...fallbackLocation,
    ...(validLatitude(primaryLocation.lat) !== null ? { lat: primaryLocation.lat } : {}),
    ...(validLongitude(primaryLocation.lng) !== null ? { lng: primaryLocation.lng } : {}),
  }
}

function isValidRawReportField(key: string, value: unknown): boolean {
  switch (key) {
    case "id":
    case "title":
    case "description":
    case "category":
    case "district":
    case "authorId":
    case "issueType":
    case "type":
    case "photo":
    case "photoUrl":
    case "image":
      return nonEmptyString(value) !== null
    case "status":
      return validReportStatus(value) !== null
    case "severity":
      return normalizeSeverity(value) !== undefined
    case "lat":
    case "latitude":
      return validLatitude(value) !== null
    case "lng":
    case "longitude":
      return validLongitude(value) !== null
    case "votes":
      return finiteNumber(value) !== null && Number(value) >= 0
    case "createdAt":
      return validDateString(value)
    case "location":
    case "attachments":
    default:
      return false
  }
}

function mergeRawReport(primary: Record<string, unknown>, fallback: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...fallback }

  for (const [key, value] of Object.entries(primary)) {
    if (isValidRawReportField(key, value)) merged[key] = value
  }

  const location = mergeRawLocation(primary.location, fallback.location)
  if (location) merged.location = location

  const attachments = mergeRawAttachments(primary.attachments, fallback.attachments)
  if (attachments.length > 0) {
    merged.attachments = attachments
  } else if (Array.isArray(primary.attachments) || Array.isArray(fallback.attachments)) {
    merged.attachments = []
  }

  return merged
}

function mergeRawReportsById(
  sources: unknown[][],
  mergeDuplicates: (
    primary: Record<string, unknown>,
    fallback: Record<string, unknown>,
  ) => Record<string, unknown> = mergeRawReport,
): Record<string, unknown>[] {
  const mergedReports: Record<string, unknown>[] = []
  const reportIndices = new Map<string, number>()

  for (const source of sources) {
    for (const value of source) {
      if (!isRecord(value)) continue

      const id = nonEmptyString(value.id)
      const existingIndex = id ? reportIndices.get(id) : undefined
      if (existingIndex === undefined) {
        if (id) reportIndices.set(id, mergedReports.length)
        mergedReports.push({ ...value })
      } else {
        mergedReports[existingIndex] = mergeDuplicates(mergedReports[existingIndex], value)
      }
    }
  }

  return mergedReports
}

function mergeRawLegacyReport(
  primary: Record<string, unknown>,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  const merged = mergeRawReport(primary, fallback)
  const primaryVotes = finiteNumber(primary.votes)
  const fallbackVotes = finiteNumber(fallback.votes)

  if (primaryVotes !== null || fallbackVotes !== null) {
    merged.votes = Math.max(0, primaryVotes ?? 0, fallbackVotes ?? 0)
  }

  return merged
}

function normalizeReport(value: unknown): Report | null {
  if (!isRecord(value)) return null

  const location = normalizeCoordinates(value)
  const title =
    nonEmptyString(value.title) ??
    nonEmptyString(value.issueType) ??
    nonEmptyString(value.category) ??
    nonEmptyString(value.type) ??
    "Municipal Report"
  const createdAt = validDateString(value.createdAt) ? nonEmptyString(value.createdAt)! : FALLBACK_DATE
  const authorId = nonEmptyString(value.authorId)
  const id =
    nonEmptyString(value.id) ??
    `legacy-report-${stableHash(`${title}|${location.lat}|${location.lng}|${createdAt}|${authorId ?? ""}`)}`
  const canonicalAttachments = Array.isArray(value.attachments)
    ? value.attachments
        .map((attachment, index) => normalizeAttachment(attachment, id, index))
        .filter((attachment): attachment is Attachment => attachment !== null)
    : []
  const legacyPhoto =
    nonEmptyString(value.photo) ?? nonEmptyString(value.photoUrl) ?? nonEmptyString(value.image)

  if (legacyPhoto && !canonicalAttachments.some((attachment) => attachment.url === legacyPhoto)) {
    canonicalAttachments.push({
      id: `${id}-report-photo-${stableHash(legacyPhoto)}`,
      name: "Migrated report photo",
      mimeType: "image/*",
      url: legacyPhoto,
      kind: "report-photo",
    })
  }

  const severity = normalizeSeverity(value.severity)

  return {
    id,
    title,
    description: nonEmptyString(value.description) ?? "",
    category:
      nonEmptyString(value.category) ?? nonEmptyString(value.issueType) ?? nonEmptyString(value.type) ?? "other",
    status: normalizeStatus(value.status ?? value.type),
    ...(severity ? { severity } : {}),
    location,
    district: nonEmptyString(value.district) ?? "Unknown District",
    createdAt,
    votes: Math.max(0, finiteNumber(value.votes) ?? 0),
    ...(authorId ? { authorId } : {}),
    attachments: deduplicateAttachments(canonicalAttachments),
  }
}

function mergeReports(primary: Report, fallback: Report): Report {
  const authorId = primary.authorId ?? fallback.authorId
  const severity = primary.severity ?? fallback.severity

  return {
    ...fallback,
    ...primary,
    description: primary.description || fallback.description,
    category: primary.category === "other" ? fallback.category : primary.category,
    district: primary.district === "Unknown District" ? fallback.district : primary.district,
    createdAt: primary.createdAt === FALLBACK_DATE ? fallback.createdAt : primary.createdAt,
    votes: Math.max(primary.votes, fallback.votes),
    ...(authorId ? { authorId } : {}),
    ...(severity ? { severity } : {}),
    attachments: deduplicateAttachments([...primary.attachments, ...fallback.attachments]),
  }
}

function deduplicateReports(reports: Report[]): Report[] {
  const deduplicated = new Map<string, Report>()

  for (const report of reports) {
    const existing = deduplicated.get(report.id)
    deduplicated.set(report.id, existing ? mergeReports(existing, report) : report)
  }

  return [...deduplicated.values()]
}

function normalizeDistrict(value: unknown): District {
  if (isRecord(value)) {
    const name = nonEmptyString(value.name)
    if (name) {
      return {
        id: nonEmptyString(value.id) ?? `legacy-district-${stableHash(name.toLowerCase())}`,
        name,
        arabic: nonEmptyString(value.arabic) ?? "",
      }
    }
  }

  const name = nonEmptyString(value) ?? "Unknown District"
  return (
    findDistrictByName(name) ?? {
      id: `legacy-district-${stableHash(name.toLowerCase())}`,
      name,
      arabic: "",
    }
  )
}

function normalizeSuggestion(value: unknown): Suggestion | null {
  if (!isRecord(value)) return null

  const location = normalizeCoordinates(value)
  const title = nonEmptyString(value.title) ?? "Community Suggestion"
  const createdAt = nonEmptyString(value.createdAt) ?? FALLBACK_DATE
  const id =
    nonEmptyString(value.id) ??
    `legacy-suggestion-${stableHash(`${title}|${location.lat}|${location.lng}|${createdAt}`)}`

  return {
    id,
    title,
    category: nonEmptyString(value.category) ?? "other",
    location,
    description: nonEmptyString(value.description) ?? "",
    district: normalizeDistrict(value.district),
    createdAt,
    votes: Math.max(0, finiteNumber(value.votes) ?? 0),
  }
}

function mergeSuggestions(primary: Suggestion, fallback: Suggestion): Suggestion {
  return {
    ...fallback,
    ...primary,
    description: primary.description || fallback.description,
    category: primary.category === "other" ? fallback.category : primary.category,
    createdAt: primary.createdAt === FALLBACK_DATE ? fallback.createdAt : primary.createdAt,
    votes: Math.max(primary.votes, fallback.votes),
  }
}

function deduplicateSuggestions(suggestions: Suggestion[]): Suggestion[] {
  const deduplicated = new Map<string, Suggestion>()

  for (const suggestion of suggestions) {
    const existing = deduplicated.get(suggestion.id)
    deduplicated.set(suggestion.id, existing ? mergeSuggestions(existing, suggestion) : suggestion)
  }

  return [...deduplicated.values()]
}

function normalizeReportOwners(reports: Report[], user: MunicipalUser | null, knownNames: string[] = []): Report[] {
  if (!user) return reports

  const ownerNames = new Set([user.name, ...knownNames].filter(Boolean))
  return reports.map((report) =>
    report.authorId && ownerNames.has(report.authorId) ? { ...report, authorId: user.id } : report,
  )
}

function normalizeStorageState(value: unknown, knownOwnerNames: string[] = []): AppStorageState {
  const record = isRecord(value) ? value : {}
  const user = normalizeUser(record.user)
  const reports = Array.isArray(record.reports)
    ? record.reports.map(normalizeReport).filter((report): report is Report => report !== null)
    : []
  const suggestions = Array.isArray(record.suggestions)
    ? record.suggestions.map(normalizeSuggestion).filter((suggestion): suggestion is Suggestion => suggestion !== null)
    : []

  return {
    version: 1,
    role: Object.hasOwn(record, "role") ? normalizeRole(record.role) : user?.role ?? null,
    user,
    reports: normalizeReportOwners(deduplicateReports(reports), user, knownOwnerNames),
    votedReportIds: uniqueStrings(record.votedReportIds),
    suggestions: deduplicateSuggestions(suggestions),
    votedSuggestionIds: uniqueStrings(record.votedSuggestionIds),
  }
}

export function parseAppStorage(rawValue: string | null): AppStorageState {
  return normalizeStorageState(safeJsonParse(rawValue))
}

export function mergeAppStorage(
  current: AppStorageState,
  updates: Partial<AppStorageState>,
): AppStorageState {
  return {
    ...current,
    ...updates,
    version: 1,
    reports: updates.reports ?? current.reports,
    votedReportIds: updates.votedReportIds ?? current.votedReportIds,
    suggestions: updates.suggestions ?? current.suggestions,
    votedSuggestionIds: updates.votedSuggestionIds ?? current.votedSuggestionIds,
  }
}

export function applySuggestionVote(current: AppStorageState, id: string): AppStorageState {
  if (current.votedSuggestionIds.includes(id)) return current

  return mergeAppStorage(current, {
    suggestions: current.suggestions.map((suggestion) =>
      suggestion.id === id ? { ...suggestion, votes: suggestion.votes + 1 } : suggestion,
    ),
    votedSuggestionIds: [...current.votedSuggestionIds, id],
  })
}

function browserStorage(): ClientStorage | null {
  if (typeof window === "undefined") return null

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function legacyRole(storage: ClientStorage): UserRole | null {
  const rawRole = safeGetItem(storage, "userRole")
  return normalizeRole(rawRole) ?? normalizeRole(safeJsonParse(rawRole))
}

function migratedRole(parsedCanonical: unknown, storage: ClientStorage): UserRole | null {
  const canonicalRecord = isRecord(parsedCanonical) ? parsedCanonical : null
  const fallbackRole = legacyRole(storage)

  if (!canonicalRecord || !Object.hasOwn(canonicalRecord, "role")) return fallbackRole
  if (canonicalRecord.role === null) return null

  return normalizeRole(canonicalRecord.role) ?? fallbackRole
}

export function migrateLegacyAppStorage(storage: ClientStorage): AppStorageState {
  const canonicalRaw = safeGetItem(storage, APP_STORAGE_KEY)
  const parsedCanonical = safeJsonParse(canonicalRaw)
  const canonicalState = normalizeStorageState(parsedCanonical)
  const legacyRawValues = new Map(
    LEGACY_STORAGE_KEYS.map((key) => [key, safeGetItem(storage, key)] as const),
  )
  const hasLegacyData = [...legacyRawValues.values()].some((value) => value !== null)
  const canonicalRecord = isRecord(parsedCanonical) ? parsedCanonical : {}
  const rawCanonicalUser = canonicalRecord.user
  const rawLegacyUser = safeJsonParse(legacyRawValues.get("app_user") ?? null)
  const canonicalUser = normalizeUser(rawCanonicalUser)
  const legacyUser = normalizeUser(rawLegacyUser)
  const user = normalizeUser(mergeRawUser(rawCanonicalUser, rawLegacyUser))
  const ownerNames = [canonicalUser?.name, legacyUser?.name].filter(
    (name): name is string => Boolean(name),
  )
  const rawLegacyReports = mergeRawReportsById([
    parsedArray(storage, "app_reports"),
    parsedArray(storage, "myReports"),
    parsedArray(storage, "reports"),
  ], mergeRawLegacyReport)
  const rawReports = mergeRawReportsById([
    Array.isArray(canonicalRecord.reports) ? canonicalRecord.reports : [],
    rawLegacyReports,
  ])
  const reports = rawReports.map(normalizeReport).filter((report): report is Report => report !== null)
  const legacySuggestions = parsedArray(storage, "app_suggestions")
    .map(normalizeSuggestion)
    .filter((suggestion): suggestion is Suggestion => suggestion !== null)
  const migratedState: AppStorageState = {
    version: 1,
    role: migratedRole(parsedCanonical, storage),
    user,
    reports: normalizeReportOwners(
      deduplicateReports(reports),
      user,
      ownerNames,
    ),
    votedReportIds: [
      ...new Set([
        ...canonicalState.votedReportIds,
        ...uniqueStrings(safeJsonParse(legacyRawValues.get("app_voted_reports") ?? null)),
      ]),
    ],
    suggestions: deduplicateSuggestions([...canonicalState.suggestions, ...legacySuggestions]),
    votedSuggestionIds: [
      ...new Set([
        ...canonicalState.votedSuggestionIds,
        ...uniqueStrings(safeJsonParse(legacyRawValues.get("app_voted_suggestions") ?? null)),
      ]),
    ],
  }
  const serializedState = JSON.stringify(migratedState)
  const shouldWriteCanonical = hasLegacyData || (canonicalRaw !== null && canonicalRaw !== serializedState)

  if (shouldWriteCanonical) {
    try {
      storage.setItem(APP_STORAGE_KEY, serializedState)
    } catch {
      return migratedState
    }

    for (const key of LEGACY_STORAGE_KEYS) {
      try {
        storage.removeItem(key)
      } catch {
        // A failed removal is safe: the idempotent migration will retry on the next read.
      }
    }
  }

  return migratedState
}

export function readAppStorage(): AppStorageState {
  const storage = browserStorage()
  return storage ? migrateLegacyAppStorage(storage) : { ...EMPTY_APP_STORAGE }
}

export function getAppStorageSnapshot(): string | null {
  const storage = browserStorage()
  return storage ? JSON.stringify(migrateLegacyAppStorage(storage)) : null
}

export function subscribeAppStorage(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined

  const handleStorage = (event: StorageEvent) => {
    if (event.key === APP_STORAGE_KEY) onStoreChange()
  }

  window.addEventListener("storage", handleStorage)
  window.addEventListener(APP_STORAGE_EVENT, onStoreChange)

  return () => {
    window.removeEventListener("storage", handleStorage)
    window.removeEventListener(APP_STORAGE_EVENT, onStoreChange)
  }
}

function notifyAppStorageChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(APP_STORAGE_EVENT))
}

export function updateAppStorage(updates: Partial<AppStorageState>): AppStorageState {
  const nextState = mergeAppStorage(readAppStorage(), updates)
  const storage = browserStorage()

  if (storage) {
    storage.setItem(APP_STORAGE_KEY, JSON.stringify(nextState))
    notifyAppStorageChange()
  }

  return nextState
}

export function clearAppSession(storageOverride?: ClientStorage): AppStorageState {
  const storage = storageOverride ?? browserStorage()
  if (!storage) return { ...EMPTY_APP_STORAGE }

  const nextState = mergeAppStorage(migrateLegacyAppStorage(storage), { role: null })
  storage.setItem(APP_STORAGE_KEY, JSON.stringify(nextState))

  if (!storageOverride) notifyAppStorageChange()
  return nextState
}
