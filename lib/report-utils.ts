import type { MunicipalUser, Report, ReportStatus } from "@/types/domain"

export function getReportPhotoUrl(report: Pick<Report, "attachments">): string | null {
  return report.attachments.find((attachment) => attachment.kind === "report-photo")?.url ?? null
}

export function formatReportStatus(status: ReportStatus): string {
  return status
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function reportStatusStep(status: ReportStatus): number {
  if (status === "resolved") return 3
  if (status === "in-progress") return 2
  return 0
}

export function isReportOwnedByUser(
  report: Pick<Report, "authorId">,
  user: Pick<MunicipalUser, "id">,
): boolean {
  return report.authorId === user.id
}
