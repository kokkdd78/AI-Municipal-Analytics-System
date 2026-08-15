import type { SuggestionStatus as DatabaseSuggestionStatus } from "../../generated/prisma/client"
import type { SuggestionStatus } from "../../types/domain"
import type { SuggestionProjectionRecord } from "./repository"

export interface SuggestionDto {
  id: string
  title: string
  description: string
  category: string
  status: SuggestionStatus
  location: { lat: number; lng: number }
  district: { id: string; name: string }
  createdAt: string
  updatedAt: string
  votes: number
  hasVoted: boolean
}

const SUGGESTION_STATUS: Record<DatabaseSuggestionStatus, SuggestionStatus> = {
  UNDER_REVIEW: "Under Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
}

export function toSuggestionDto(record: SuggestionProjectionRecord): SuggestionDto {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    category: record.category,
    status: SUGGESTION_STATUS[record.status],
    location: { lat: record.latitude, lng: record.longitude },
    district: record.district,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    votes: record.importedVoteBaseline + record.voteCount,
    hasVoted: record.viewerHasVoted,
  }
}
