import ReportSuccess from "@/components/report-success"
import { requirePageRole } from "@/lib/auth/page-authorization"

export const metadata = {
  title: "Report Submitted",
  description: "Your report has been submitted successfully",
}

export default async function ReportSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ reportId?: string }>
}) {
  await requirePageRole("Citizen")
  const { reportId } = await searchParams
  return <ReportSuccess reportId={reportId} />
}
