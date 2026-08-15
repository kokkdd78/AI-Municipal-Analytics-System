import type { PrismaClient, SuggestionStatus } from "../../generated/prisma/client"

export interface SuggestionProjectionRecord {
  id: string
  authorId: string | null
  title: string
  description: string
  category: string
  status: SuggestionStatus
  latitude: number
  longitude: number
  importedVoteBaseline: number
  createdAt: Date
  updatedAt: Date
  district: { id: string; name: string }
  voteCount: number
  viewerHasVoted: boolean
}

export interface CreateSuggestionRecordInput {
  id: string
  authorId: string
  title: string
  description: string
  category: string
  districtId: string
  latitude: number
  longitude: number
}

export interface SuggestionRepository {
  districtExists(id: string): Promise<boolean>
  createSuggestion(input: CreateSuggestionRecordInput): Promise<SuggestionProjectionRecord>
  listSuggestions(viewerId: string): Promise<SuggestionProjectionRecord[]>
  addVote(input: { suggestionId: string; userId: string; voteId: string }): Promise<number | null>
}

const suggestionProjectionSelect = {
  id: true,
  authorId: true,
  title: true,
  description: true,
  category: true,
  status: true,
  latitude: true,
  longitude: true,
  importedVoteBaseline: true,
  createdAt: true,
  updatedAt: true,
  district: { select: { id: true, name: true } },
  _count: { select: { votes: true } },
} as const

type SuggestionQueryRecord = Omit<SuggestionProjectionRecord, "voteCount" | "viewerHasVoted">
  & { _count: { votes: number }; votes: { id: string }[] }

function selectForViewer(viewerId: string) {
  return {
    ...suggestionProjectionSelect,
    votes: { where: { userId: viewerId }, select: { id: true }, take: 1 },
  } as const
}

function projection(record: SuggestionQueryRecord): SuggestionProjectionRecord {
  const { _count, votes, ...suggestion } = record
  return { ...suggestion, voteCount: _count.votes, viewerHasVoted: votes.length > 0 }
}

export function createPrismaSuggestionRepository(database: PrismaClient): SuggestionRepository {
  return {
    async districtExists(id) {
      return (await database.district.count({ where: { id } })) === 1
    },
    async createSuggestion(input) {
      return projection(await database.suggestion.create({
        data: {
          id: input.id,
          authorId: input.authorId,
          title: input.title,
          description: input.description,
          category: input.category,
          districtId: input.districtId,
          latitude: input.latitude,
          longitude: input.longitude,
          status: "UNDER_REVIEW",
          importedVoteBaseline: 0,
        },
        select: selectForViewer(input.authorId),
      }))
    },
    async listSuggestions(viewerId) {
      const records = await database.suggestion.findMany({
        select: selectForViewer(viewerId),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      })
      return records.map(projection)
    },
    async addVote(input) {
      return database.$transaction(async (transaction) => {
        const suggestion = await transaction.suggestion.findUnique({
          where: { id: input.suggestionId },
          select: { importedVoteBaseline: true },
        })
        if (!suggestion) return null
        await transaction.suggestionVote.createMany({
          data: [{ id: input.voteId, suggestionId: input.suggestionId, userId: input.userId }],
          skipDuplicates: true,
        })
        const persistedVotes = await transaction.suggestionVote.count({
          where: { suggestionId: input.suggestionId },
        })
        return suggestion.importedVoteBaseline + persistedVotes
      })
    },
  }
}
