export type ReportServiceErrorCode = "forbidden" | "invalid-request" | "not-found"

export class ReportServiceError extends Error {
  readonly code: ReportServiceErrorCode
  readonly status: 400 | 403 | 404

  constructor(code: ReportServiceErrorCode) {
    const status = code === "invalid-request" ? 400 : code === "forbidden" ? 403 : 404
    super(code)
    this.name = "ReportServiceError"
    this.code = code
    this.status = status
  }
}
