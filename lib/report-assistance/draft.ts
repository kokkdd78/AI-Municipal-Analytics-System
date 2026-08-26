import type { ReportAssistanceResponse } from "./contracts"

export interface ReportAssistanceDraft {
  category: "trash" | "lighting" | "pothole" | "water" | "trees" | "other"
  severity: "low" | "medium" | "high"
}

export function applyAssistanceSuggestion(
  draft: ReportAssistanceDraft,
  assistance: ReportAssistanceResponse,
): ReportAssistanceDraft {
  return assistance.available
    ? { ...draft, category: assistance.suggestion.category, severity: assistance.suggestion.severity }
    : draft
}

export function overrideAssistanceSuggestion(
  draft: ReportAssistanceDraft,
  override: Partial<ReportAssistanceDraft>,
): ReportAssistanceDraft {
  return { ...draft, ...override }
}
