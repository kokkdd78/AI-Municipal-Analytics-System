import type { AppStorageState } from "../client-storage"
import type { SuggestionDto } from "./dto"
import type { Suggestion, UserRole } from "../../types/domain"

export type CitizenSuggestionSource = "legacy" | "server"

export interface CitizenSuggestionView extends Suggestion {
  source: CitizenSuggestionSource
  hasVoted: boolean
  status?: SuggestionDto["status"]
}

export function legacySuggestionViews(
  suggestions: readonly Suggestion[],
  votedSuggestionIds: readonly string[],
): CitizenSuggestionView[] {
  const voted = new Set(votedSuggestionIds)
  return suggestions.map((suggestion) => ({
    ...suggestion,
    source: "legacy",
    hasVoted: voted.has(suggestion.id),
  }))
}

export function serverSuggestionToView(suggestion: SuggestionDto): CitizenSuggestionView {
  return {
    id: suggestion.id,
    title: suggestion.title,
    category: suggestion.category,
    location: suggestion.location,
    description: suggestion.description,
    district: { ...suggestion.district, arabic: "" },
    createdAt: suggestion.createdAt,
    votes: suggestion.votes,
    source: "server",
    hasVoted: suggestion.hasVoted,
    status: suggestion.status,
  }
}

export function mergeCitizenSuggestionViews(
  serverSuggestions: readonly CitizenSuggestionView[],
  legacySuggestions: readonly CitizenSuggestionView[],
): CitizenSuggestionView[] {
  const merged = new Map(legacySuggestions.map((suggestion) => [suggestion.id, suggestion]))
  for (const suggestion of serverSuggestions) merged.set(suggestion.id, suggestion)
  return [...merged.values()].toSorted((first, second) =>
    second.createdAt.localeCompare(first.createdAt) || second.id.localeCompare(first.id),
  )
}

export function applyLegacySuggestionVote(state: AppStorageState, id: string): AppStorageState {
  if (state.votedSuggestionIds.includes(id) || !state.suggestions.some((item) => item.id === id)) return state
  return {
    ...state,
    suggestions: state.suggestions.map((suggestion) =>
      suggestion.id === id ? { ...suggestion, votes: suggestion.votes + 1 } : suggestion,
    ),
    votedSuggestionIds: [...state.votedSuggestionIds, id],
  }
}

export function mayDisplayServerSuggestions(
  stateUserId: string | null,
  user: { id: string; role: UserRole } | null,
): boolean {
  return Boolean(stateUserId && user?.role === "Citizen" && stateUserId === user.id)
}

export function prependSuggestionById(
  suggestions: readonly SuggestionDto[],
  suggestion: SuggestionDto,
): SuggestionDto[] {
  return [suggestion, ...suggestions.filter((item) => item.id !== suggestion.id)]
}

export function mergeSuggestionVote(
  suggestions: readonly SuggestionDto[],
  id: string,
  votes: number,
): SuggestionDto[] {
  return suggestions.map((suggestion) =>
    suggestion.id === id ? { ...suggestion, votes, hasVoted: true } : suggestion,
  )
}
