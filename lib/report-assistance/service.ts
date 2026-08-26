import type { AuthenticatedMunicipalUser } from "@/lib/auth/authorization-core"

import {
  providerSuggestionSchema,
  type ReportAssistanceRequest,
  type ReportAssistanceResponse,
} from "./contracts"
import type { ReportAssistanceProvider } from "./provider"
import type { AssistanceCandidate, ReportAssistanceRepository } from "./repository"

const MAX_DUPLICATE_CANDIDATES = 20

function duplicateSummary(candidate: AssistanceCandidate): string {
  return candidate.description.replace(/\s+/g, " ").trim().slice(0, 320)
}

export function createReportAssistanceService(
  repository: ReportAssistanceRepository,
  provider: ReportAssistanceProvider | null,
) {
  return {
    async assist(user: AuthenticatedMunicipalUser, request: ReportAssistanceRequest): Promise<ReportAssistanceResponse> {
      if (user.role !== "Citizen") throw new Error("forbidden")
      if (!(await repository.districtExists(request.districtId))) throw new Error("invalid-request")
      if (!provider) return { available: false }

      const candidates = await repository.recentCandidates(request.districtId, MAX_DUPLICATE_CANDIDATES)
      try {
        const parsed = providerSuggestionSchema.safeParse(await provider.suggest({ report: request, candidates }))
        if (!parsed.success) return { available: false }
        const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))
        const possibleDuplicates = parsed.data.duplicateIds.flatMap((id) => {
          const candidate = byId.get(id)
          return candidate ? [{ id: candidate.id, title: candidate.title, summary: duplicateSummary(candidate) }] : []
        })
        return {
          available: true,
          suggestion: {
            category: parsed.data.category,
            severity: parsed.data.severity,
            reasoning: parsed.data.reasoning,
          },
          possibleDuplicates,
        }
      } catch {
        return { available: false }
      }
    },
  }
}
