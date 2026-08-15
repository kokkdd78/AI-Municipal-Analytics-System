import { randomUUID } from "node:crypto"

import type { AuthenticatedMunicipalUser } from "../auth/authorization-core"
import type { CreateSuggestionRequest } from "./contracts"
import { toSuggestionDto, type SuggestionDto } from "./dto"
import { SuggestionServiceError } from "./errors"
import type { SuggestionRepository } from "./repository"

export interface SuggestionVoteDto {
  suggestionId: string
  voted: true
  votes: number
}

export interface SuggestionService {
  list(user: AuthenticatedMunicipalUser): Promise<SuggestionDto[]>
  create(user: AuthenticatedMunicipalUser, input: CreateSuggestionRequest): Promise<SuggestionDto>
  vote(user: AuthenticatedMunicipalUser, id: string): Promise<SuggestionVoteDto>
}

function requireCitizen(user: AuthenticatedMunicipalUser): void {
  if (user.role !== "Citizen") throw new SuggestionServiceError("forbidden")
}

export function createSuggestionService(
  repository: SuggestionRepository,
  generateId: () => string = randomUUID,
): SuggestionService {
  return {
    async list(user) {
      return (await repository.listSuggestions(user.id)).map(toSuggestionDto)
    },
    async create(user, input) {
      requireCitizen(user)
      if (!(await repository.districtExists(input.districtId))) {
        throw new SuggestionServiceError("invalid-request")
      }
      return toSuggestionDto(await repository.createSuggestion({
        id: generateId(),
        authorId: user.id,
        title: input.title,
        description: input.description,
        category: input.category,
        districtId: input.districtId,
        latitude: input.location.lat,
        longitude: input.location.lng,
      }))
    },
    async vote(user, id) {
      requireCitizen(user)
      const votes = await repository.addVote({ suggestionId: id, userId: user.id, voteId: generateId() })
      if (votes === null) throw new SuggestionServiceError("not-found")
      return { suggestionId: id, voted: true, votes }
    },
  }
}
