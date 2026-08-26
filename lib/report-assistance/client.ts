import {
  reportAssistanceResponseSchema,
  type ReportAssistanceRequest,
  type ReportAssistanceResponse,
} from "./contracts"

export class ReportAssistanceClientError extends Error {}

export async function requestReportAssistance(
  request: ReportAssistanceRequest,
  options: { signal?: AbortSignal } = {},
): Promise<ReportAssistanceResponse> {
  const response = await fetch("/api/reports/assist", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal: options.signal,
  })
  if (!response.ok) throw new ReportAssistanceClientError("Assistance is unavailable")
  const parsed = reportAssistanceResponseSchema.safeParse(await response.json().catch(() => undefined))
  if (!parsed.success) throw new ReportAssistanceClientError("Assistance is unavailable")
  return parsed.data
}
