export type SuggestionServiceErrorCode = "forbidden" | "invalid-request" | "not-found"

export class SuggestionServiceError extends Error {
  constructor(readonly code: SuggestionServiceErrorCode) {
    super("Suggestion operation failed")
    this.name = "SuggestionServiceError"
  }
}
