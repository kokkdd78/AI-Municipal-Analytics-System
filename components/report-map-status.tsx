import { formatReportStatus } from "../lib/report-utils"
import type { ReportStatus } from "../types/domain"

export default function ReportMapStatus({ status }: { status: ReportStatus }) {
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      Status: <span className="font-medium text-foreground">{formatReportStatus(status)}</span>
    </p>
  )
}
